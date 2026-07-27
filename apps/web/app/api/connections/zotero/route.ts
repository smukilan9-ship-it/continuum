import { createHash } from "node:crypto";
import { embedDocuments, embeddingConfiguration } from "@continuum/ai";
import { getDatabase, NeonRepository, sql } from "@continuum/db";
import { chunkDocument, contentHash, sanitizeUntrustedContent } from "@continuum/retrieval";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { openCredential, sealCredential } from "@/lib/credential-vault";
import {
  listZoteroCollections,
  listZoteroItems,
  listZoteroLibraries,
  newZoteroIntegrationId,
  normalizeZoteroItem,
  storedZoteroPdf,
  syncZoteroLibraries,
  validateZoteroKey,
  zoteroPrefix,
  zoteroRequest,
  type ZoteroCredential,
  type ZoteroItem,
} from "@/lib/zotero";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("validate"), apiKey: z.string().trim().min(16).max(256) }),
  z.object({ action: z.literal("connect"), apiKey: z.string().trim().min(16).max(256) }),
  z.object({ action: z.literal("sync") }),
  z.object({
    action: z.literal("save_item"),
    libraryType: z.enum(["user", "group"]),
    libraryId: z.string().regex(/^\d+$/),
    itemKey: z.string().regex(/^[A-Z0-9]{8}$/i),
  }),
  z.object({ action: z.literal("disconnect") }),
]);

function libraryQuery(url: URL) {
  const libraryType = url.searchParams.get("libraryType") === "group" ? "group" as const : "user" as const;
  const libraryId = url.searchParams.get("libraryId")?.slice(0, 100);
  if (!libraryId || !/^\d+$/.test(libraryId)) throw new Error("Choose a valid Zotero library.");
  return { libraryType, libraryId };
}

async function credentialFor(userId: string) {
  const connection = await new NeonRepository().getIntegration(userId, "zotero");
  if (!connection) throw new Error("Zotero is not connected.");
  try {
    return { connection, credential: openCredential<ZoteroCredential>(connection.encryptedCredentials) };
  } catch {
    throw new Error("The saved Zotero credential can no longer be decrypted. Replace it with a new dedicated Zotero API key.");
  }
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "zotero-read", 120, 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Too many Zotero requests" }, { status: 429 });
  try {
    const { credential } = await credentialFor(user.id);
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource") ?? "libraries";
    const libraries = await listZoteroLibraries(credential);
    if (resource === "libraries") {
      const state = await getDatabase().execute(sql`
        select library_type, library_id, library_version, last_sync_at, last_error, stats
        from zotero_libraries where user_id = ${user.id} and deleted = false
      `);
      return NextResponse.json({ libraries, syncState: state.rows }, { headers: { "cache-control": "private, no-store" } });
    }
    const library = libraryQuery(url);
    const accessible = libraries.find((entry) => entry.type === library.libraryType && entry.id === library.libraryId);
    if (!accessible) return NextResponse.json({ error: "This key cannot access the selected library." }, { status: 403 });
    if (resource === "collections") {
      const page = await listZoteroCollections(credential, library.libraryType, library.libraryId);
      const collections = page.data.map((collection) => ({
        key: collection.key,
        name: String(collection.data.name ?? "Untitled collection"),
        parentCollectionKey: typeof collection.data.parentCollection === "string" ? collection.data.parentCollection : undefined,
        version: collection.version,
      }));
      return NextResponse.json({ collections, total: page.total, libraryVersion: page.libraryVersion }, { headers: { "cache-control": "private, no-store" } });
    }
    if (resource === "attachment") {
      const itemKey = url.searchParams.get("itemKey");
      if (!itemKey || !/^[A-Z0-9]{8}$/i.test(itemKey)) return NextResponse.json({ error: "Invalid attachment key" }, { status: 400 });
      const pdf = await storedZoteroPdf({ credential, ...library, itemKey, allowFiles: accessible.permissions.files });
      return new Response(pdf.bytes, {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `inline; filename="${pdf.filename.replaceAll('"', "")}"`,
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
          ...(pdf.etag ? { etag: pdf.etag } : {}),
        },
      });
    }
    const page = await listZoteroItems({
      credential,
      ...library,
      collectionKey: url.searchParams.get("collectionKey")?.slice(0, 20),
      parentItemKey: url.searchParams.get("parentItemKey")?.slice(0, 20),
      query: url.searchParams.get("q")?.slice(0, 300),
      itemType: url.searchParams.get("itemType")?.slice(0, 100),
      sort: z.enum(["dateModified", "dateAdded", "title", "creator", "date"]).catch("dateModified").parse(url.searchParams.get("sort")),
      direction: url.searchParams.get("direction") === "asc" ? "asc" : "desc",
      start: Number(url.searchParams.get("start") ?? 0),
      limit: Number(url.searchParams.get("limit") ?? 50),
    });
    return NextResponse.json({
      items: page.data.map(normalizeZoteroItem),
      total: page.total,
      libraryVersion: page.libraryVersion,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Zotero request failed" }, { status: 502 });
  }
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
      const key = await validateZoteroKey(parsed.data.apiKey);
      if (parsed.data.action === "validate") {
        return NextResponse.json({
          valid: true,
          username: key.username ?? `Zotero user ${key.userID}`,
          groupsAvailable: Boolean(key.access?.groups),
          filesAvailable: Boolean(key.access?.user?.files),
          message: "Zotero accepted this dedicated read key. It has not been saved yet.",
        });
      }
      const existing = await repo.getIntegration(user.id, "zotero");
      await repo.upsertIntegration({
        id: existing?.id ?? newZoteroIntegrationId(),
        userId: user.id,
        provider: "zotero",
        encryptedCredentials: sealCredential({ apiKey: parsed.data.apiKey, userId: String(key.userID), username: key.username } satisfies ZoteroCredential),
        scopes: ["library:read", ...(key.access?.user?.files ? ["files:read"] : []), ...(key.access?.groups ? ["groups:read"] : [])],
      });
      return NextResponse.json({ connected: true, username: key.username ?? `Zotero user ${key.userID}` });
    }
    const { connection, credential } = await credentialFor(user.id);
    if (parsed.data.action === "save_item") {
      const saveRequest = parsed.data;
      const libraries = await listZoteroLibraries(credential);
      if (!libraries.some((library) => library.type === saveRequest.libraryType && library.id === saveRequest.libraryId)) {
        return NextResponse.json({ error: "This key cannot access the selected library." }, { status: 403 });
      }
      const remote = (await zoteroRequest<ZoteroItem>(
        `${zoteroPrefix(saveRequest.libraryType, saveRequest.libraryId)}/items/${saveRequest.itemKey}`,
        credential.apiKey,
      )).data;
      const item = normalizeZoteroItem(remote);
      if (item.itemType === "attachment" || item.itemType === "note") return NextResponse.json({ error: "Save the parent bibliographic item instead." }, { status: 400 });
      const raw = [
        `# ${item.title}`,
        item.creators.length ? `Authors: ${item.creators.map((creator) => creator.name).join(", ")}` : "",
        item.date ? `Date: ${item.date}` : "",
        item.publicationTitle ? `Publication: ${item.publicationTitle}` : "",
        item.doi ? `DOI: ${item.doi}` : "",
        item.url ? `URL: ${item.url}` : "",
        item.abstract ? `\nAbstract\n${item.abstract}` : "",
      ].filter(Boolean).join("\n");
      const sanitized = sanitizeUntrustedContent(raw).sanitized.slice(0, 100_000);
      const sourceId = `source_zotero_${createHash("sha256").update(`${user.id}:${saveRequest.libraryType}:${saveRequest.libraryId}:${item.key}`).digest("hex").slice(0, 24)}`;
      const chunks = chunkDocument({ id: sourceId, title: item.title, text: sanitized, version: item.version || 1, deleted: false });
      let embeddings: number[][] | undefined;
      if (embeddingConfiguration()) {
        try { embeddings = await embedDocuments(chunks.map((chunk) => chunk.text)); } catch { /* Lexical retrieval remains available. */ }
      }
      await getStore(user.id).saveSource({
        id: sourceId,
        userId: user.id,
        title: item.title,
        mimeType: "application/vnd.zotero.item+json",
        contentHash: contentHash(sanitized),
        sourceVersion: item.version || 1,
        parserVersion: "zotero-web-api-v3",
        chunks: chunks.map((chunk, index) => ({
          id: chunk.id,
          sourceId,
          passage: chunk.passage,
          content: chunk.text,
          contentHash: chunk.contentHash,
          ...(embeddings?.[index] ? { embedding: embeddings[index] } : {}),
        })),
      });
      await getDatabase().execute(sql`
        update zotero_items set source_id = ${sourceId}, updated_at = now(), version = version + 1
        where user_id = ${user.id} and library_type = ${saveRequest.libraryType}
          and library_id = ${saveRequest.libraryId} and item_key = ${item.key}
      `);
      return NextResponse.json({ saved: true, sourceId, title: item.title });
    }
    const results = await syncZoteroLibraries(user.id, credential);
    const lastSyncAt = new Date().toISOString();
    await repo.upsertIntegration({
      id: connection.id,
      userId: user.id,
      provider: "zotero",
      encryptedCredentials: sealCredential({ ...credential, lastSyncAt }),
      scopes: connection.scopes,
    });
    return NextResponse.json({
      synced: true,
      libraries: results,
      changedCollections: results.reduce((total, result) => total + result.changedCollections, 0),
      changedItems: results.reduce((total, result) => total + result.changedItems, 0),
      deleted: results.reduce((total, result) => total + result.deleted, 0),
      lastSyncAt,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Zotero action failed" }, { status: 502 });
  }
}
