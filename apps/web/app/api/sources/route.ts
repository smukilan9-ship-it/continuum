import { contentHash, sanitizeUntrustedContent, chunkDocument } from "@continuum/retrieval";
import { embedDocuments, embeddingConfiguration } from "@continuum/ai";
import { createHash } from "node:crypto";
import { del, put } from "@vercel/blob";
import { extractText } from "unpdf";
import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { detectQuestionImageType, extractContextFromImages, normalizeQuestionDocument } from "@/lib/image-question-extraction";

export const runtime = "nodejs";
const maxSourceBytes = 10 * 1024 * 1024;
const maxIndexedCharacters = 500_000;

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "source-read", Number(process.env.SOURCE_READS_PER_MINUTE ?? 60), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Source read rate limit exceeded" }, { status: 429, headers: { "retry-after": "60" } });
  const store = getStore(user.id);
  const url = new URL(request.url);
  const sourceId = url.searchParams.get("sourceId");

  // §13.3 source detail: the numbered passages Continuum actually indexed —
  // the only honest answer to "what does it have from this file?".
  if (url.searchParams.get("include") === "passages") {
    if (!sourceId || sourceId.length > 200) return NextResponse.json({ error: "A valid sourceId is required" }, { status: 400 });
    const passages = await store.listSourceChunks(sourceId);
    // `listSourceChunks` is already user-scoped, so an id belonging to someone
    // else simply has no passages — it never reveals that the source exists.
    return NextResponse.json({
      sourceId,
      passages: passages.map((chunk) => ({ id: chunk.id, passage: chunk.passage, text: chunk.text, reference: chunk.reference })),
    }, { headers: { "cache-control": "private, no-store" } });
  }

  return NextResponse.json({ sources: await store.listSources(), adapter: store.kind }, { headers: { "cache-control": "private, no-store" } });
}

const patchSchema = z.object({
  sourceId: z.string().min(3).max(200),
  // `null` unfiles a source; a string files it into a project the caller owns.
  projectId: z.string().min(3).max(200).nullable(),
});

/**
 * §13.2 "Send to project" — re-files an already-indexed source.
 *
 * This was the write the Library's overflow menu was missing, which is why the
 * item shipped disabled. Ownership is checked on both ends inside the store, so
 * a guessed project id can neither be written to nor probed for existence.
 */
export async function PATCH(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin source changes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "source-update", Number(process.env.SOURCE_UPDATES_PER_HOUR ?? 120), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Source update rate limit exceeded" }, { status: 429, headers: { "retry-after": "3600" } });
  const parsed = patchSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "A sourceId and a projectId (or null) are required", issues: parsed.error.issues }, { status: 400 });
  const store = getStore(user.id);
  const result = await store.assignSourceToProject(parsed.data.sourceId, parsed.data.projectId);
  if (result.status === "project_not_found") return NextResponse.json({ error: "Project not found or not accessible" }, { status: 404 });
  if (result.status === "source_not_found") return NextResponse.json({ error: "Source not found" }, { status: 404 });
  await store.appendEvent({
    type: "source.project.changed",
    summary: parsed.data.projectId ? `Filed ${result.source.title} into a research project.` : `Unfiled ${result.source.title} from its project.`,
    entityIds: [result.source.id],
    ...(parsed.data.projectId ? { projectId: parsed.data.projectId } : {}),
    payload: { projectId: parsed.data.projectId },
  });
  return NextResponse.json({ source: result.source });
}

export async function DELETE(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin source deletion is not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "source-delete", Number(process.env.SOURCE_DELETES_PER_HOUR ?? 30), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Source deletion rate limit exceeded" }, { status: 429, headers: { "retry-after": "3600" } });
  const sourceId = new URL(request.url).searchParams.get("sourceId");
  if (!sourceId || sourceId.length > 200) return NextResponse.json({ error: "A valid sourceId is required" }, { status: 400 });
  const store = getStore(user.id);
  const source = await store.deleteSource(sourceId);
  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });
  let blobDeleted = false;
  if (source.storagePath && (process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN))) {
    try { await del(source.storagePath); blobDeleted = true; } catch { /* Soft deletion still excludes the source; cleanup can be retried. */ }
  }
  await store.appendEvent({ type: "source.deletion.queued", summary: `Deleted ${source.title} from retrieval and queued vector cleanup.`, entityIds: [source.id], payload: { blobDeleted, vectorDeletionQueued: true } });
  return NextResponse.json({ deleted: source.id, excludedFromRetrieval: true, blobDeleted, vectorDeletionQueued: true });
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin source upload is not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "source-upload", Number(process.env.SOURCE_UPLOADS_PER_HOUR ?? 20), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Source upload rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "3600" } });
  const form = await request.formData().catch(() => undefined);
  if (!form) return NextResponse.json({ error: "Invalid source upload form" }, { status: 400 });
  const file = form.get("file");
  const projectId = typeof form.get("projectId") === "string" && String(form.get("projectId")).trim() ? String(form.get("projectId")).trim() : undefined;
  // §11.4: the composer states the destination before the file is read, so
  // nothing joins the Library by accident (S12). Anything that does not say
  // "session" is a deliberate Library add, which keeps every existing caller
  // (the Add-source dialog, Zotero import) on the durable default.
  const retention = form.get("retention") === "session" ? "session" as const : "library" as const;
  if (!(file instanceof File)) return NextResponse.json({ error: "A PDF, DOCX, text file, or image is required" }, { status: 400 });
  if (projectId && projectId.length > 200) return NextResponse.json({ error: "Invalid projectId" }, { status: 400 });
  if (!file.size) return NextResponse.json({ error: "The source file is empty" }, { status: 400 });
  if (file.size > maxSourceBytes) return NextResponse.json({ error: "Files are limited to 10 MB" }, { status: 413 });
  const title = file.name.normalize("NFKC").replaceAll("\0", "").trim();
  if (!title || title.length > 255) return NextResponse.json({ error: "The source filename is invalid or too long" }, { status: 400 });
  const isPdf = file.type.includes("pdf") || title.toLowerCase().endsWith(".pdf");
  const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || title.toLowerCase().endsWith(".docx");
  const isText = file.type.startsWith("text/") || /\.(txt|md|markdown|csv|json|yaml|yml|tex|py|js|jsx|ts|tsx|java|c|cc|cpp|h|hpp|rs|go|rb|php|swift|kt|kts|sql|html|css|scss|sh|bash|zsh)$/i.test(title);
  const isImageName = /\.(png|jpe?g|webp)$/i.test(title);
  if (!isPdf && !isDocx && !isText && !isImageName) return NextResponse.json({ error: "Only PDF, DOCX, text, code, CSV, PNG, JPEG, and WebP sources are supported" }, { status: 415 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isPdf && new TextDecoder("ascii").decode(bytes.slice(0, 5)) !== "%PDF-") return NextResponse.json({ error: "The uploaded file is not a valid PDF" }, { status: 415 });
  if (isDocx && new TextDecoder("ascii").decode(bytes.slice(0, 2)) !== "PK") return NextResponse.json({ error: "The uploaded file is not a valid DOCX document" }, { status: 415 });
  const detectedImageType = isImageName ? detectQuestionImageType(bytes) : undefined;
  if (isImageName && (!detectedImageType || detectedImageType === "application/pdf")) return NextResponse.json({ error: "The uploaded file is not a valid PNG, JPEG, or WebP image" }, { status: 415 });
  let rawText: string;
  let injectionDetected = false;
  try {
    if (detectedImageType) {
      const extracted = await extractContextFromImages(await normalizeQuestionDocument(bytes, detectedImageType));
      rawText = [`# ${extracted.title}`, extracted.extractedText, "## Visual context", extracted.visualSummary].filter(Boolean).join("\n\n");
      injectionDetected = extracted.injectionDetected;
    } else {
      rawText = isPdf
        ? (await extractText(bytes, { mergePages: true })).text
        : isDocx
          ? (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value
          : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
  } catch {
    return NextResponse.json({ error: "The source could not be safely parsed or understood" }, { status: 422 });
  }
  if (rawText.length > maxIndexedCharacters) return NextResponse.json({ error: "Extracted text is limited to 500,000 characters per source" }, { status: 413 });
  const sanitizedResult = sanitizeUntrustedContent(rawText);
  const sanitized = sanitizedResult.sanitized;
  injectionDetected ||= sanitizedResult.injectionDetected;
  if (!sanitized.trim()) return NextResponse.json({ error: "No readable text was found in this source" }, { status: 422 });
  const hash = contentHash(sanitized);
  const store = getStore(user.id);
  if (projectId) {
    const ownedProjects = await store.read("list_projects", { limit: 50 }) as Array<{ id?: string }>;
    const ownsProject = ownedProjects.some((project) => project.id === projectId);
    if (!ownsProject) return NextResponse.json({ error: "Project not found or not accessible" }, { status: 404 });
  }
  const duplicate = await store.findSourceByHash(hash);
  if (duplicate) return NextResponse.json({ duplicate: true, source: duplicate, duplicateKey: hash }, { status: 200 });
  const userPrefix = createHash("sha256").update(user.id).digest("hex").slice(0, 6);
  const id = `source_${userPrefix}${hash.slice(0, 12)}`;
  const chunks = chunkDocument({ id, title, text: sanitized, version: 1, deleted: false });

  let storagePath: string | undefined;
  let storageStatus: "stored" | "not_configured" | "unavailable" = "not_configured";
  const blobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN));
  if (blobConfigured) {
    const safeName = title.replace(/[^a-zA-Z0-9._-]+/g, "-");
    // Storing the original binary is best-effort and must never block or hang
    // ingestion — the searchable index (chunks + embeddings) does not depend on
    // it. Bound the upload and degrade gracefully if the blob store is slow or
    // unreachable.
    const blobTimeoutMs = Number(process.env.BLOB_UPLOAD_TIMEOUT_MS ?? 15_000);
    const controller = new AbortController();
    const timeout = new Promise<"timeout">((resolve) => setTimeout(() => { controller.abort(); resolve("timeout"); }, blobTimeoutMs));
    try {
      // Race against a hard timeout: some environments (notably `next dev`'s
      // patched fetch) can leave the upload's socket hung past its own abort, so
      // a dangling put must not stall the request. A slow store degrades to
      // "unavailable" and ingestion proceeds without the original binary.
      const result = await Promise.race([
        put(`sources/${user.id}/${hash.slice(0, 16)}-${safeName}`, Buffer.from(bytes), {
          access: "private",
          contentType: isPdf ? "application/pdf" : isDocx ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : (detectedImageType ?? file.type) || "text/plain",
          addRandomSuffix: false,
          abortSignal: controller.signal,
        }),
        timeout,
      ]);
      if (result === "timeout") storageStatus = "unavailable";
      else { storagePath = result.url; storageStatus = "stored"; }
    } catch {
      storageStatus = "unavailable";
    }
  }

  let embeddings: number[][] | undefined;
  let embeddingStatus: "stored" | "not_configured" | "provider_failed" = "not_configured";
  if (store.kind === "neon" && embeddingConfiguration()) {
    try {
      embeddings = await embedDocuments(chunks.map((chunk) => chunk.text));
      embeddingStatus = "stored";
    } catch {
      embeddingStatus = "provider_failed";
    }
  }

  try {
    await store.saveSource({
      id,
      userId: user.id,
      projectId,
      title,
      mimeType: isPdf ? "application/pdf" : isDocx ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : (detectedImageType ?? file.type) || "text/plain",
      storagePath,
      contentHash: hash,
      sourceVersion: 1,
      parserVersion: isPdf ? "unpdf-1.6.2" : isDocx ? "mammoth-1.11" : detectedImageType ? "gemini-image-context-v1" : "utf8-v1",
      retention,
      chunks: chunks.map((chunk, index) => ({
        id: chunk.id,
        sourceId: id,
        passage: chunk.passage,
        content: chunk.text,
        contentHash: chunk.contentHash,
        ...(embeddings?.[index] ? { embedding: embeddings[index] } : {}),
      })),
    });
  } catch (error) {
    if (storagePath) {
      try { await del(storagePath); } catch { /* The original failure remains the actionable error. */ }
    }
    throw error;
  }
  await store.appendEvent({
    type: "source.ingestion.completed",
    summary: `Indexed ${title} into ${chunks.length} stable passage${chunks.length === 1 ? "" : "s"}.`,
    entityIds: [id, ...chunks.map((chunk) => chunk.id)],
    payload: { contentHash: hash, parserVersion: isPdf ? "unpdf-1.6.2" : isDocx ? "mammoth-1.11" : detectedImageType ? "gemini-image-context-v1" : "utf8-v1", injectionDetected, embeddingStatus, blobStored: Boolean(storagePath) },
  });
  return NextResponse.json({
    source: { id, title, contentHash: hash, version: 1, parserVersion: isPdf ? "unpdf-1.6.2" : isDocx ? "mammoth-1.11" : detectedImageType ? "gemini-image-context-v1" : "utf8-v1", injectionDetected, storage: storageStatus === "stored" ? "vercel_blob_private" : storageStatus, embeddingStatus },
    chunks,
    duplicate: false,
    duplicateKey: hash,
  }, { status: 201 });
}
