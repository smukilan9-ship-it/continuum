import { contentHash, sanitizeUntrustedContent, chunkDocument } from "@continuum/retrieval";
import { embedDocuments, embeddingConfiguration } from "@continuum/ai";
import { createHash } from "node:crypto";
import { del, put } from "@vercel/blob";
import { extractText } from "unpdf";
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";

export const runtime = "nodejs";
const maxSourceBytes = 10 * 1024 * 1024;
const maxIndexedCharacters = 500_000;

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "source-read", Number(process.env.SOURCE_READS_PER_MINUTE ?? 60), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Source read rate limit exceeded" }, { status: 429, headers: { "retry-after": "60" } });
  const store = getStore(user.id);
  return NextResponse.json({ sources: await store.listSources(), adapter: store.kind }, { headers: { "cache-control": "private, no-store" } });
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
  if (!(file instanceof File)) return NextResponse.json({ error: "A PDF or text file is required" }, { status: 400 });
  if (projectId && projectId.length > 200) return NextResponse.json({ error: "Invalid projectId" }, { status: 400 });
  if (!file.size) return NextResponse.json({ error: "The source file is empty" }, { status: 400 });
  if (file.size > maxSourceBytes) return NextResponse.json({ error: "Files are limited to 10 MB" }, { status: 413 });
  const title = file.name.normalize("NFKC").replaceAll("\0", "").trim();
  if (!title || title.length > 255) return NextResponse.json({ error: "The source filename is invalid or too long" }, { status: 400 });
  const isPdf = file.type.includes("pdf") || title.toLowerCase().endsWith(".pdf");
  const isText = file.type.startsWith("text/") || /\.(txt|md|markdown|csv|json|yaml|yml|tex)$/i.test(title);
  if (!isPdf && !isText) return NextResponse.json({ error: "Only PDF and text sources are supported" }, { status: 415 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isPdf && new TextDecoder("ascii").decode(bytes.slice(0, 5)) !== "%PDF-") return NextResponse.json({ error: "The uploaded file is not a valid PDF" }, { status: 415 });
  let rawText: string;
  try { rawText = isPdf ? (await extractText(bytes, { mergePages: true })).text : new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return NextResponse.json({ error: "The source could not be parsed as valid PDF or UTF-8 text" }, { status: 422 }); }
  if (rawText.length > maxIndexedCharacters) return NextResponse.json({ error: "Extracted text is limited to 500,000 characters per source" }, { status: 413 });
  const { sanitized, injectionDetected } = sanitizeUntrustedContent(rawText);
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
  const blobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN));
  if (blobConfigured) {
    const safeName = title.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const blob = await put(`sources/${user.id}/${hash.slice(0, 16)}-${safeName}`, Buffer.from(bytes), {
      access: "private",
      contentType: isPdf ? "application/pdf" : file.type || "text/plain",
      addRandomSuffix: false,
    });
    storagePath = blob.url;
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
      mimeType: isPdf ? "application/pdf" : file.type || "text/plain",
      storagePath,
      contentHash: hash,
      sourceVersion: 1,
      parserVersion: "unpdf-1.6.2",
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
    payload: { contentHash: hash, parserVersion: "unpdf-1.6.2", injectionDetected, embeddingStatus, blobStored: Boolean(storagePath) },
  });
  return NextResponse.json({
    source: { id, title, contentHash: hash, version: 1, parserVersion: "unpdf-1.6.2", injectionDetected, storage: storagePath ? "vercel_blob_private" : "not_configured", embeddingStatus },
    chunks,
    duplicate: false,
    duplicateKey: hash,
  }, { status: 201 });
}
