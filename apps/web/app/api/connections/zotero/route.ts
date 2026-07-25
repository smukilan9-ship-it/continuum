import { createHash, randomUUID } from "node:crypto";
import { embedDocuments, embeddingConfiguration } from "@continuum/ai";
import { NeonRepository } from "@continuum/db";
import { chunkDocument, contentHash, sanitizeUntrustedContent } from "@continuum/retrieval";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { openCredential, sealCredential } from "@/lib/credential-vault";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("validate"), apiKey: z.string().trim().min(16).max(256) }),
  z.object({ action: z.literal("connect"), apiKey: z.string().trim().min(16).max(256) }),
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("disconnect") }),
]);

type ZoteroCredential = { apiKey: string; userId: string; username?: string; lastSyncAt?: string; syncCursor?: number; libraryVersion?: number; pendingLibraryVersion?: number };
type ZoteroKey = { userID?: number; username?: string; access?: { user?: { library?: boolean; files?: boolean } } };
type ZoteroItem = { key?: string; version?: number; data?: { key?: string; itemType?: string; title?: string; abstractNote?: string; dateModified?: string; date?: string; DOI?: string; url?: string; publicationTitle?: string; creators?: Array<{ firstName?: string; lastName?: string; name?: string }> } };

async function zoteroFetch<T>(path: string, apiKey: string) {
  const response = await fetch(`https://api.zotero.org${path}`, { headers: { "Zotero-API-Key": apiKey, "Zotero-API-Version": "3" }, cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(response.status === 403 ? "This Zotero key cannot read the private library" : payload.message ?? `Zotero returned ${response.status}`);
  return payload;
}

async function zoteroFetchPage(path: string, apiKey: string) {
  const response = await fetch(`https://api.zotero.org${path}`, { headers: { "Zotero-API-Key": apiKey, "Zotero-API-Version": "3" }, cache: "no-store" });
  const payload = await response.json().catch(() => []) as ZoteroItem[] & { message?: string };
  if (!response.ok) throw new Error(response.status === 403 ? "This Zotero key cannot read the private library" : payload.message ?? `Zotero returned ${response.status}`);
  return {
    items: Array.isArray(payload) ? payload : [],
    total: Number(response.headers.get("total-results") ?? payload.length),
    libraryVersion: Number(response.headers.get("last-modified-version") ?? 0),
  };
}

function zoteroSourceId(userId: string, itemKey: string) {
  return `source_zotero_${createHash("sha256").update(`${userId}:${itemKey}`).digest("hex").slice(0, 24)}`;
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin Zotero changes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "zotero-write", 12, 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Zotero actions are temporarily rate limited" }, { status: 429, headers: { "retry-after": "3600" } });
  const parsed = requestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Zotero action" }, { status: 400 });
  const repo = new NeonRepository();

  try {
    if (parsed.data.action === "disconnect") return NextResponse.json({ disconnected: await repo.revokeIntegration(user.id, "zotero") });
    if (parsed.data.action === "validate" || parsed.data.action === "connect") {
      const key = await zoteroFetch<ZoteroKey>("/keys/current", parsed.data.apiKey);
      if (!key.userID || !key.access?.user?.library) return NextResponse.json({ error: "Create a Zotero key with personal-library read access" }, { status: 403 });
      if (parsed.data.action === "validate") {
        return NextResponse.json({
          valid: true,
          username: key.username ?? `Zotero user ${key.userID}`,
          message: "Zotero accepted this read-only personal-library key. It has not been saved yet.",
        });
      }
      const existing = await repo.getIntegration(user.id, "zotero");
      await repo.upsertIntegration({
        id: existing?.id ?? `integration_zotero_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
        userId: user.id,
        provider: "zotero",
        encryptedCredentials: sealCredential({ apiKey: parsed.data.apiKey, userId: String(key.userID), username: key.username }),
        scopes: ["library:read"],
      });
      return NextResponse.json({ connected: true, username: key.username ?? `Zotero user ${key.userID}` });
    }

    const connection = await repo.getIntegration(user.id, "zotero");
    if (!connection) return NextResponse.json({ error: "Zotero is not connected" }, { status: 409 });
    const credential = openCredential<ZoteroCredential>(connection.encryptedCredentials);
    const cursor = Math.max(0, credential.syncCursor ?? 0);
    const query = new URLSearchParams({ limit: "100", start: String(cursor), format: "json" });
    if (credential.libraryVersion) query.set("since", String(credential.libraryVersion));
    const page = await zoteroFetchPage(`/users/${encodeURIComponent(credential.userId)}/items/top?${query}`, credential.apiKey);
    const items = page.items;
    const existingDocuments = new Map((await repo.listSyncedDocuments(user.id, "zotero")).map((document) => [document.externalId, document]));
    const store = getStore(user.id);
    let unchanged = 0;
    const prepared: Array<{ itemKey: string; item: ZoteroItem; data: NonNullable<ZoteroItem["data"]>; title: string; digest: string; sourceId: string; chunks: ReturnType<typeof chunkDocument> }> = [];
    for (const item of items) {
      const data = item.data;
      const itemKey = item.key ?? data?.key;
      const title = data?.title?.normalize("NFKC").trim();
      if (!data || !itemKey || !title || data.itemType === "note") continue;
      const creators = (data.creators ?? []).map((creator) => creator.name ?? [creator.firstName, creator.lastName].filter(Boolean).join(" ")).filter(Boolean).join(", ");
      const raw = [`# ${title}`, creators && `Authors: ${creators}`, data.date && `Date: ${data.date}`, data.publicationTitle && `Publication: ${data.publicationTitle}`, data.DOI && `DOI: ${data.DOI}`, data.url && `URL: ${data.url}`, data.abstractNote && `\nAbstract\n${data.abstractNote}`].filter(Boolean).join("\n");
      const sanitized = sanitizeUntrustedContent(raw).sanitized.slice(0, 30_000);
      const digest = contentHash(sanitized);
      if (existingDocuments.get(itemKey)?.contentHash === digest) { unchanged += 1; continue; }
      const sourceId = zoteroSourceId(user.id, itemKey);
      const chunks = chunkDocument({ id: sourceId, title, text: sanitized, version: item.version ?? 1, deleted: false });
      prepared.push({ itemKey, item, data, title, digest, sourceId, chunks });
    }
    const flattened = prepared.flatMap((entry) => entry.chunks.map((chunk) => chunk.text));
    let embeddings: number[][] = [];
    if (store.kind === "neon" && embeddingConfiguration() && flattened.length) {
      try { embeddings = await embedDocuments(flattened.slice(0, 80)); } catch { /* Keyword retrieval remains available and sync still completes. */ }
    }
    let embeddingOffset = 0;
    for (const entry of prepared) {
      const entryEmbeddings = embeddings.slice(embeddingOffset, embeddingOffset + entry.chunks.length);
      embeddingOffset += entry.chunks.length;
      await store.saveSource({ id: entry.sourceId, userId: user.id, title: entry.title, mimeType: "application/vnd.zotero.item+json", contentHash: entry.digest, sourceVersion: entry.item.version ?? 1, parserVersion: "zotero-web-api-v3", chunks: entry.chunks.map((chunk, index) => ({ id: chunk.id, sourceId: entry.sourceId, passage: chunk.passage, content: chunk.text, contentHash: chunk.contentHash, ...(entryEmbeddings[index] ? { embedding: entryEmbeddings[index] } : {}) })) });
      await repo.upsertSyncedDocument({ id: `sync_zotero_${createHash("sha256").update(`${user.id}:${entry.itemKey}`).digest("hex").slice(0, 24)}`, userId: user.id, provider: "zotero", externalId: entry.itemKey, path: entry.title, mimeType: "application/vnd.zotero.item+json", contentHash: entry.digest, sourceId: entry.sourceId, remoteUpdatedAt: entry.data.dateModified ?? new Date().toISOString(), metadata: { zoteroVersion: entry.item.version ?? 0, itemType: entry.data.itemType ?? "item", doi: entry.data.DOI, url: entry.data.url } });
    }
    const indexed = prepared.length;
    const lastSyncAt = new Date().toISOString();
    const nextCursor = cursor + items.length;
    const hasMore = nextCursor < page.total;
    const observedVersion = Math.max(credential.pendingLibraryVersion ?? 0, page.libraryVersion);
    const nextCredential: ZoteroCredential = hasMore
      ? { ...credential, lastSyncAt, syncCursor: nextCursor, pendingLibraryVersion: observedVersion }
      : { ...credential, lastSyncAt, syncCursor: 0, libraryVersion: observedVersion || credential.libraryVersion, pendingLibraryVersion: undefined };
    await repo.upsertIntegration({ id: connection.id, userId: user.id, provider: "zotero", encryptedCredentials: sealCredential(nextCredential), scopes: connection.scopes });
    await store.appendEvent({ type: "integration.zotero.synced", summary: `Zotero sync indexed ${indexed} changed item${indexed === 1 ? "" : "s"}.`, entityIds: [], payload: { indexed, unchanged, total: items.length } });
    return NextResponse.json({ indexed, unchanged, scanned: items.length, remaining: Math.max(0, page.total - nextCursor), hasMore, lastSyncAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Zotero action failed" }, { status: 502 });
  }
}
