import { createHash, randomUUID } from "node:crypto";
import { embedDocuments, embeddingConfiguration } from "@continuum/ai";
import { NeonRepository } from "@continuum/db";
import { chunkDocument, contentHash, sanitizeUntrustedContent } from "@continuum/retrieval";
import { del, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { extractText } from "unpdf";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { enforceRateLimit } from "@/lib/auth";
import { contextPackMarkdown, type ContextPack, type ContextPackMetadata } from "@/lib/context-packs";
import {
  acknowledgeBridgeOperations,
  applyBridgeBatch,
  pendingBridgeOperations,
  type BridgeOperation,
} from "@/lib/obsidian-sync-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const documentSchema = z.object({
  path: z.string().min(1).max(1000),
  mimeType: z.string().min(1).max(200).default("application/octet-stream"),
  modifiedAt: z.string().datetime({ offset: true }),
  content: z.string().max(10 * 1024 * 1024).optional(),
  contentBase64: z.string().max(14 * 1024 * 1024).regex(/^[A-Za-z0-9+/]*={0,2}$/, "Invalid base64 content").optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).refine((document) => document.content !== undefined || document.contentBase64 !== undefined, "Document content is required");
const bridgeOperationSchema = z.object({
  operationId: z.string().min(3).max(200),
  idempotencyKey: z.string().min(8).max(300),
  operationType: z.enum(["create", "update", "rename", "move", "delete"]),
  syncId: z.string().min(8).max(200).optional(),
  recordId: z.string().min(3).max(200).optional(),
  recordType: z.enum(["assistant_memory", "research_note", "paper_note", "learning_note", "concept_summary", "project_note", "session_summary", "decision", "open_question", "next_action", "linked_source", "workspace_note"]),
  schemaVersion: z.number().int().min(1).max(10),
  title: z.string().min(1).max(300),
  path: z.string().min(1).max(1000),
  content: z.string().max(2 * 1024 * 1024),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  localRevision: z.number().int().nonnegative(),
  knownServerRevision: z.number().int().nonnegative(),
  commonBaseRevision: z.number().int().nonnegative(),
  deletionState: z.enum(["active", "tombstone", "archived"]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  origin: z.literal("obsidian"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const protocolSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("push_batch"), operations: z.array(bridgeOperationSchema).max(100) }),
  z.object({
    action: z.literal("ack"),
    acknowledgements: z.array(z.object({
      operationId: z.string().min(3).max(200),
      status: z.enum(["completed", "retry", "conflict"]),
      error: z.string().max(1000).optional(),
      localRevision: z.number().int().nonnegative().optional(),
    })).max(100),
  }),
]);
const maxIndexedCharacters = 500_000;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeVaultPath(value: string) {
  const normalized = value.normalize("NFKC").replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => !part || part === "." || part === "..") || normalized.includes("\0")) throw new Error("Unsafe vault path");
  return normalized;
}

async function authorize(request: Request) {
  const raw = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!raw || !process.env.DATABASE_URL) return undefined;
  return new NeonRepository().resolveIntegrationToken(hash(raw), "obsidian");
}

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const configured = [process.env.APP_BASE_URL, ...(process.env.OBSIDIAN_ALLOWED_ORIGINS?.split(",") ?? [])].filter(Boolean).map((value) => String(value).trim().replace(/\/$/, ""));
  if (!origin || !configured.includes(origin.replace(/\/$/, ""))) return { vary: "origin" };
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "vary": "origin",
  };
}

export async function GET(request: Request) {
  const token = await authorize(request);
  if (!token || !token.scopes.includes("documents:read")) return NextResponse.json({ error: "Valid Obsidian documents:read token required" }, { status: 401, headers: cors(request) });
  const rate = await enforceRateLimit(request, "obsidian-sync", Number(process.env.OBSIDIAN_SYNC_REQUESTS_PER_MINUTE ?? 120), 60_000, token.userId);
  if (!rate.allowed) return NextResponse.json({ error: "Obsidian sync rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { ...cors(request), "retry-after": "60" } });
  const url = new URL(request.url);
  if (url.searchParams.get("mode") === "operations") {
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 100) || 100));
    const operations = await pendingBridgeOperations(token.userId, limit);
    return NextResponse.json({
      protocolVersion: 1,
      generatedAt: new Date().toISOString(),
      operations,
    }, { headers: { ...cors(request), "cache-control": "private, no-store" } });
  }
  const store = getStore(token.userId);
  const [context, projects, receipts, packCatalog] = await Promise.all([
    store.read("load_context", { focus: "resume my most important current academic work", maxTokens: 1800 }, "obsidian"),
    store.read("list_projects", { limit: 30 }, "obsidian"),
    store.listReceipts(20),
    store.read("list_context_packs", {}, "obsidian") as Promise<ContextPackMetadata[]>,
  ]);
  const packs = await Promise.all(packCatalog.slice(0, 24).map((metadata) => store.read("get_context_pack", { packId: metadata.id, maxTokens: 1400 }, "obsidian") as Promise<ContextPack>));
  const generatedAt = new Date().toISOString();
  const packDocuments = packs.map((pack) => ({ path: `Continuum/Context Packs/${pack.metadata.id.replace(/[^a-zA-Z0-9._-]+/g, "-")}.md`, content: contextPackMarkdown(pack) }));
  const documents = [
    { path: "Continuum/Current context.md", content: `---\ncontinuum_generated: true\ngenerated_at: ${generatedAt}\n---\n\n# Current academic context\n\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\`\n` },
    { path: "Continuum/Projects.md", content: `---\ncontinuum_generated: true\ngenerated_at: ${generatedAt}\n---\n\n# Projects\n\n\`\`\`json\n${JSON.stringify(projects, null, 2)}\n\`\`\`\n` },
    { path: "Continuum/Outcome receipts.md", content: `---\ncontinuum_generated: true\ngenerated_at: ${generatedAt}\n---\n\n# Outcome receipts\n\n${receipts.map((receipt) => `## ${(receipt as { summary?: string }).summary ?? "Session"}\n\n\`\`\`json\n${JSON.stringify(receipt, null, 2)}\n\`\`\``).join("\n\n")}\n` },
    ...packDocuments,
  ];
  return NextResponse.json({ generatedAt, documents }, { headers: { ...cors(request), "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const token = await authorize(request);
  if (!token || !token.scopes.includes("documents:write")) return NextResponse.json({ error: "Valid Obsidian documents:write token required" }, { status: 401, headers: cors(request) });
  const rate = await enforceRateLimit(request, "obsidian-sync", Number(process.env.OBSIDIAN_SYNC_REQUESTS_PER_MINUTE ?? 120), 60_000, token.userId);
  if (!rate.allowed) return NextResponse.json({ error: "Obsidian sync rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { ...cors(request), "retry-after": "60" } });
  const body = await request.json().catch(() => undefined);
  const protocol = protocolSchema.safeParse(body);
  if (protocol.success) {
    if (protocol.data.action === "push_batch") {
      const acknowledgements = await applyBridgeBatch(token.userId, protocol.data.operations as BridgeOperation[]);
      return NextResponse.json({ protocolVersion: 1, acknowledgements }, { headers: { ...cors(request), "cache-control": "private, no-store" } });
    }
    const acknowledgements = await acknowledgeBridgeOperations(token.userId, protocol.data.acknowledgements);
    return NextResponse.json({ protocolVersion: 1, acknowledgements }, { headers: { ...cors(request), "cache-control": "private, no-store" } });
  }
  const parsed = documentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid vault document", issues: parsed.error.issues }, { status: 400, headers: cors(request) });
  let path: string;
  try { path = safeVaultPath(parsed.data.path); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unsafe vault path" }, { status: 400, headers: cors(request) }); }
  const bytes = parsed.data.content !== undefined ? Buffer.from(parsed.data.content, "utf8") : Buffer.from(parsed.data.contentBase64!, "base64");
  if (!bytes.byteLength) return NextResponse.json({ error: "The vault document is empty" }, { status: 400, headers: cors(request) });
  if (bytes.byteLength > 10 * 1024 * 1024) return NextResponse.json({ error: "Documents are limited to 10 MB per sync request" }, { status: 413, headers: cors(request) });
  const digest = createHash("sha256").update(bytes).digest("hex");
  const externalId = hash(path).slice(0, 32);
  const repo = new NeonRepository();
  const existing = (await repo.listSyncedDocuments(token.userId, "obsidian")).find((document) => document.externalId === externalId);
  if (existing?.contentHash === digest) return NextResponse.json({ unchanged: true, path, contentHash: digest, sourceId: existing.sourceId }, { headers: cors(request) });

  const store = getStore(token.userId);
  let rawText: string | undefined;
  if (parsed.data.mimeType.includes("pdf") || path.toLowerCase().endsWith(".pdf")) {
    try { rawText = (await extractText(new Uint8Array(bytes), { mergePages: true })).text; } catch { rawText = undefined; }
  } else if (parsed.data.mimeType.startsWith("text/") || /\.(md|markdown|txt|csv|json|yaml|yml|tex|py|js|ts|tsx|jsx|java|c|cpp|h|rs|go)$/i.test(path)) rawText = bytes.toString("utf8");
  if (rawText && rawText.length > maxIndexedCharacters) return NextResponse.json({ error: "Indexed vault text is limited to 500,000 characters per document" }, { status: 413, headers: cors(request) });

  const blobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN));
  let storagePath: string | undefined;
  if (blobConfigured) {
    const safeName = path.split("/").at(-1)!.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const blob = await put(`obsidian/${token.userId}/${externalId}/${digest.slice(0, 12)}-${safeName}`, bytes, { access: "private", contentType: parsed.data.mimeType, addRandomSuffix: false });
    storagePath = blob.url;
  }

  let sourceId: string | undefined;
  let chunksStored = 0;
  let injectionDetected = false;
  if (rawText?.trim()) {
    const sanitized = sanitizeUntrustedContent(rawText);
    injectionDetected = sanitized.injectionDetected;
    const indexedSourceId = `source_obs_${hash(`${token.userId}:${externalId}:${digest}`).slice(0, 20)}`;
    sourceId = indexedSourceId;
    const chunks = chunkDocument({ id: indexedSourceId, title: path, text: sanitized.sanitized, version: (existing?.syncVersion ?? 0) + 1, deleted: false });
    let embeddings: number[][] | undefined;
    if (embeddingConfiguration()) { try { embeddings = await embedDocuments(chunks.map((chunk) => chunk.text)); } catch { /* Lexical retrieval remains active. */ } }
    try {
      await store.saveSource({ id: indexedSourceId, userId: token.userId, title: path, mimeType: parsed.data.mimeType, storagePath, contentHash: contentHash(sanitized.sanitized), sourceVersion: (existing?.syncVersion ?? 0) + 1, parserVersion: "obsidian-sync-v1", chunks: chunks.map((chunk, index) => ({ id: chunk.id, sourceId: indexedSourceId, passage: chunk.passage, content: chunk.text, contentHash: chunk.contentHash, ...(embeddings?.[index] ? { embedding: embeddings[index] } : {}) })) });
    } catch (error) {
      if (storagePath) {
        try { await del(storagePath); } catch { /* Preserve the indexing failure. */ }
      }
      throw error;
    }
    chunksStored = chunks.length;
  }
  const documentId = existing?.id ?? `synced_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  try {
    await repo.upsertSyncedDocument({ id: documentId, userId: token.userId, provider: "obsidian", externalId, path, mimeType: parsed.data.mimeType, contentHash: digest, sourceId, remoteUpdatedAt: parsed.data.modifiedAt, metadata: { ...parsed.data.metadata, storagePath, bytes: bytes.byteLength, indexed: Boolean(sourceId), injectionDetected } });
  } catch (error) {
    if (sourceId) {
      try { await store.deleteSource(sourceId); } catch { /* Preserve the metadata failure. */ }
    }
    if (storagePath) {
      try { await del(storagePath); } catch { /* Preserve the metadata failure. */ }
    }
    throw error;
  }
  if (existing?.sourceId && existing.sourceId !== sourceId) {
    const replaced = await store.deleteSource(existing.sourceId);
    if (replaced?.storagePath && replaced.storagePath !== storagePath) {
      try { await del(replaced.storagePath); } catch { /* The old source is already excluded from retrieval. */ }
    }
  }
  await store.appendEvent({ type: "integration.document.synced", summary: `Synced ${path} from Obsidian${sourceId ? ` and indexed ${chunksStored} passages` : " as an original file"}.`, entityIds: [documentId, ...(sourceId ? [sourceId] : [])], payload: { provider: "obsidian", path, contentHash: digest, bytes: bytes.byteLength, sourceId, storage: storagePath ? "private_blob" : "database_metadata_only", injectionDetected }, source: { surface: "import" }, importance: 0.45 });
  return NextResponse.json({ synced: true, path, documentId, sourceId, chunksStored, originalStored: Boolean(storagePath), warning: !storagePath && !sourceId ? "Configure private Blob storage to retain non-text originals." : undefined }, { status: existing ? 200 : 201, headers: cors(request) });
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cors(request) });
}
