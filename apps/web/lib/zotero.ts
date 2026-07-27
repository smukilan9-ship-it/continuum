import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getDatabase, sql } from "@continuum/db";

export type ZoteroCredential = {
  apiKey: string;
  userId: string;
  username?: string;
  lastSyncAt?: string;
};

export type ZoteroKey = {
  userID?: number;
  username?: string;
  access?: {
    user?: { library?: boolean; files?: boolean; notes?: boolean; write?: boolean };
    groups?: { all?: { library?: boolean; files?: boolean; write?: boolean } } & Record<string, { library?: boolean; files?: boolean; write?: boolean } | undefined>;
  };
};

export type ZoteroLibrary = {
  type: "user" | "group";
  id: string;
  name: string;
  permissions: { library: boolean; files: boolean; write: boolean };
};

export type ZoteroCollection = {
  key: string;
  version: number;
  data: { key?: string; version?: number; name?: string; parentCollection?: string | false; [key: string]: unknown };
};

export type ZoteroItem = {
  key: string;
  version: number;
  library?: { type?: string; id?: number; name?: string };
  data: {
    key?: string;
    version?: number;
    itemType?: string;
    title?: string;
    abstractNote?: string;
    dateModified?: string;
    date?: string;
    DOI?: string;
    url?: string;
    publicationTitle?: string;
    parentItem?: string;
    linkMode?: "imported_file" | "imported_url" | "linked_file" | "linked_url";
    contentType?: string;
    filename?: string;
    collections?: string[];
    tags?: Array<{ tag?: string }>;
    creators?: Array<{ firstName?: string; lastName?: string; name?: string; creatorType?: string }>;
    [key: string]: unknown;
  };
};

type Page<T> = { data: T; total: number; libraryVersion: number; next?: string };

function messageForStatus(status: number) {
  if (status === 403) return "The Zotero key does not have permission to read this library.";
  if (status === 404) return "The requested Zotero library object no longer exists.";
  if (status === 429) return "Zotero is rate limiting this connection. Wait for the retry time and try again.";
  return `Zotero returned HTTP ${status}.`;
}

export async function zoteroRequest<T>(path: string, apiKey: string, init?: RequestInit): Promise<Page<T>> {
  const response = await fetch(`https://api.zotero.org${path}`, {
    ...init,
    headers: {
      "Zotero-API-Key": apiKey,
      "Zotero-API-Version": "3",
      accept: "application/json",
      ...init?.headers,
    },
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message ?? messageForStatus(response.status));
  const link = response.headers.get("link") ?? "";
  const next = /<([^>]+)>;\s*rel="next"/.exec(link)?.[1];
  return {
    data: payload,
    total: Number(response.headers.get("total-results") ?? (Array.isArray(payload) ? payload.length : 1)),
    libraryVersion: Number(response.headers.get("last-modified-version") ?? response.headers.get("zotero-library-version") ?? 0),
    next,
  };
}

export async function validateZoteroKey(apiKey: string) {
  const key = (await zoteroRequest<ZoteroKey>("/keys/current", apiKey)).data;
  if (!key.userID || !key.access?.user?.library) throw new Error("Create a dedicated Zotero key with personal-library read access.");
  return key;
}

export async function listZoteroLibraries(credential: ZoteroCredential): Promise<ZoteroLibrary[]> {
  const key = await validateZoteroKey(credential.apiKey);
  const libraries: ZoteroLibrary[] = [{
    type: "user",
    id: credential.userId,
    name: key.username ?? credential.username ?? "My Library",
    permissions: {
      library: Boolean(key.access?.user?.library),
      files: Boolean(key.access?.user?.files),
      write: Boolean(key.access?.user?.write),
    },
  }];
  const groups = (await zoteroRequest<Array<{ id?: number; name?: string }>>(`/users/${encodeURIComponent(credential.userId)}/groups?format=json&limit=100`, credential.apiKey)).data;
  for (const group of groups) {
    if (!group.id) continue;
    const access = key.access?.groups?.[String(group.id)] ?? key.access?.groups?.all;
    if (!access?.library) continue;
    libraries.push({
      type: "group",
      id: String(group.id),
      name: group.name?.trim() || `Group ${group.id}`,
      permissions: { library: true, files: Boolean(access.files), write: Boolean(access.write) },
    });
  }
  return libraries;
}

export function zoteroPrefix(libraryType: "user" | "group", libraryId: string) {
  return `/${libraryType === "user" ? "users" : "groups"}/${encodeURIComponent(libraryId)}`;
}

export async function listZoteroCollections(credential: ZoteroCredential, libraryType: "user" | "group", libraryId: string) {
  return zoteroRequest<ZoteroCollection[]>(`${zoteroPrefix(libraryType, libraryId)}/collections?format=json&limit=100`, credential.apiKey);
}

export async function listZoteroItems(input: {
  credential: ZoteroCredential;
  libraryType: "user" | "group";
  libraryId: string;
  collectionKey?: string;
  parentItemKey?: string;
  query?: string;
  itemType?: string;
  sort?: "dateModified" | "dateAdded" | "title" | "creator" | "date";
  direction?: "asc" | "desc";
  start?: number;
  limit?: number;
  since?: number;
}) {
  const prefix = zoteroPrefix(input.libraryType, input.libraryId);
  const resource = input.parentItemKey
    ? `/items/${encodeURIComponent(input.parentItemKey)}/children`
    : input.collectionKey
      ? `/collections/${encodeURIComponent(input.collectionKey)}/items/top`
      : "/items/top";
  const query = new URLSearchParams({
    format: "json",
    limit: String(Math.max(1, Math.min(100, input.limit ?? 50))),
    start: String(Math.max(0, input.start ?? 0)),
    sort: input.sort ?? "dateModified",
    direction: input.direction ?? "desc",
  });
  if (input.query?.trim()) query.set("q", input.query.trim().slice(0, 300));
  if (input.itemType?.trim()) query.set("itemType", input.itemType.trim().slice(0, 100));
  if (input.since !== undefined) query.set("since", String(Math.max(0, input.since)));
  return zoteroRequest<ZoteroItem[]>(`${prefix}${resource}?${query}`, input.credential.apiKey);
}

export function normalizeZoteroItem(item: ZoteroItem) {
  const data = item.data;
  return {
    key: item.key || String(data.key ?? ""),
    version: item.version || Number(data.version ?? 0),
    itemType: String(data.itemType ?? "item"),
    title: String(data.title ?? data.filename ?? "Untitled item").normalize("NFKC").trim().slice(0, 500),
    abstract: String(data.abstractNote ?? "").slice(0, 100_000),
    doi: typeof data.DOI === "string" ? data.DOI.trim() : undefined,
    url: safeExternalUrl(data.url),
    parentItemKey: typeof data.parentItem === "string" ? data.parentItem : undefined,
    collections: Array.isArray(data.collections) ? data.collections.filter((value): value is string => typeof value === "string") : [],
    tags: Array.isArray(data.tags) ? data.tags.map((tag) => tag.tag).filter((value): value is string => typeof value === "string").slice(0, 500) : [],
    creators: Array.isArray(data.creators)
      ? data.creators.map((creator) => ({
          name: creator.name ?? [creator.firstName, creator.lastName].filter(Boolean).join(" "),
          creatorType: creator.creatorType,
        })).filter((creator) => creator.name)
      : [],
    date: typeof data.date === "string" ? data.date : undefined,
    dateModified: typeof data.dateModified === "string" ? data.dateModified : undefined,
    publicationTitle: typeof data.publicationTitle === "string" ? data.publicationTitle : undefined,
    attachment: data.itemType === "attachment" ? {
      linkMode: data.linkMode,
      contentType: data.contentType,
      filename: data.filename,
      url: safeExternalUrl(data.url),
      availability: data.linkMode === "linked_file"
        ? "local_file_unavailable"
        : data.linkMode === "linked_url"
          ? "external_url"
          : data.contentType === "application/pdf" || data.filename?.toLowerCase().endsWith(".pdf")
            ? "stored_pdf"
            : "stored_file",
    } : undefined,
    raw: data,
  };
}

export function safeExternalUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 4_000) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function databaseId(prefix: string, userId: string, libraryType: string, libraryId: string, key: string) {
  return `${prefix}_${createHash("sha256").update(`${userId}:${libraryType}:${libraryId}:${key}`).digest("hex").slice(0, 24)}`;
}

async function everyPage<T>(path: string, apiKey: string) {
  const values: T[] = [];
  let next: string | undefined = path;
  let libraryVersion = 0;
  while (next && values.length < 50_000) {
    const url: URL = new URL(next, "https://api.zotero.org");
    const page: Page<T[]> = await zoteroRequest<T[]>(`${url.pathname}${url.search}`, apiKey);
    values.push(...page.data);
    libraryVersion = Math.max(libraryVersion, page.libraryVersion);
    next = page.next;
  }
  return { values, libraryVersion };
}

export async function syncZoteroLibraries(userId: string, credential: ZoteroCredential) {
  const database = getDatabase();
  const libraries = await listZoteroLibraries(credential);
  const results = [];
  for (const library of libraries) {
    const current = await database.execute(sql`
      select library_version from zotero_libraries
      where user_id = ${userId} and library_type = ${library.type} and library_id = ${library.id}
      limit 1
    `);
    const since = Number(current.rows[0]?.library_version ?? 0);
    const prefix = zoteroPrefix(library.type, library.id);
    try {
      const [collectionsPage, itemsPage, deletedPage] = await Promise.all([
        everyPage<ZoteroCollection>(`${prefix}/collections?format=json&limit=100&since=${since}`, credential.apiKey),
        everyPage<ZoteroItem>(`${prefix}/items?format=json&limit=100&includeTrashed=1&since=${since}`, credential.apiKey),
        zoteroRequest<{ collections?: string[]; items?: string[] }>(`${prefix}/deleted?since=${since}`, credential.apiKey),
      ]);
      const observedVersion = Math.max(collectionsPage.libraryVersion, itemsPage.libraryVersion, deletedPage.libraryVersion, since);
      await database.transaction(async (tx) => {
        await tx.execute(sql`
          insert into zotero_libraries (id, user_id, library_type, library_id, name, permissions, library_version, last_sync_at, stats, created_at, updated_at)
          values (
            ${databaseId("zotero_library", userId, library.type, library.id, library.id)},
            ${userId}, ${library.type}, ${library.id}, ${library.name},
            ${JSON.stringify(library.permissions)}::jsonb, ${observedVersion}, now(),
            ${JSON.stringify({ changedCollections: collectionsPage.values.length, changedItems: itemsPage.values.length })}::jsonb,
            now(), now()
          )
          on conflict (user_id, library_type, library_id) do update set
            name = excluded.name, permissions = excluded.permissions, library_version = excluded.library_version,
            last_sync_at = now(), last_error = null, stats = excluded.stats, deleted = false,
            updated_at = now(), version = zotero_libraries.version + 1
        `);
        for (const collection of collectionsPage.values) {
          const key = collection.key || String(collection.data.key ?? "");
          if (!key) continue;
          await tx.execute(sql`
            insert into zotero_collections (
              id, user_id, library_type, library_id, collection_key, parent_collection_key,
              name, remote_version, created_at, updated_at
            ) values (
              ${databaseId("zotero_collection", userId, library.type, library.id, key)},
              ${userId}, ${library.type}, ${library.id}, ${key},
              ${typeof collection.data.parentCollection === "string" ? collection.data.parentCollection : null},
              ${String(collection.data.name ?? "Untitled collection").slice(0, 500)},
              ${collection.version || Number(collection.data.version ?? 0)}, now(), now()
            )
            on conflict (user_id, library_type, library_id, collection_key) do update set
              parent_collection_key = excluded.parent_collection_key, name = excluded.name,
              remote_version = excluded.remote_version, deleted = false, updated_at = now(),
              version = zotero_collections.version + 1
          `);
        }
        for (const item of itemsPage.values) {
          const normalized = normalizeZoteroItem(item);
          if (!normalized.key) continue;
          await tx.execute(sql`
            insert into zotero_items (
              id, user_id, library_type, library_id, item_key, parent_item_key, item_type,
              title, doi, remote_version, collection_keys, tags, metadata, attachments,
              retrieved_at, created_at, updated_at
            ) values (
              ${databaseId("zotero_item", userId, library.type, library.id, normalized.key)},
              ${userId}, ${library.type}, ${library.id}, ${normalized.key},
              ${normalized.parentItemKey ?? null}, ${normalized.itemType}, ${normalized.title},
              ${normalized.doi ?? null}, ${normalized.version}, ${normalized.collections},
              ${normalized.tags}, ${JSON.stringify(normalized)}::jsonb,
              ${JSON.stringify(normalized.attachment ? [normalized.attachment] : [])}::jsonb,
              now(), now(), now()
            )
            on conflict (user_id, library_type, library_id, item_key) do update set
              parent_item_key = excluded.parent_item_key, item_type = excluded.item_type,
              title = excluded.title, doi = excluded.doi, remote_version = excluded.remote_version,
              collection_keys = excluded.collection_keys, tags = excluded.tags,
              metadata = excluded.metadata, attachments = excluded.attachments,
              retrieved_at = now(), deleted = false, updated_at = now(),
              version = zotero_items.version + 1
          `);
        }
        const deletedCollections = deletedPage.data.collections ?? [];
        const deletedItems = deletedPage.data.items ?? [];
        if (deletedCollections.length) await tx.execute(sql`
          update zotero_collections set deleted = true, updated_at = now(), version = version + 1
          where user_id = ${userId} and library_type = ${library.type} and library_id = ${library.id}
            and collection_key = any(${deletedCollections})
        `);
        if (deletedItems.length) await tx.execute(sql`
          update zotero_items set deleted = true, updated_at = now(), version = version + 1
          where user_id = ${userId} and library_type = ${library.type} and library_id = ${library.id}
            and item_key = any(${deletedItems})
        `);
      });
      results.push({ library, changedCollections: collectionsPage.values.length, changedItems: itemsPage.values.length, deleted: (deletedPage.data.collections?.length ?? 0) + (deletedPage.data.items?.length ?? 0), libraryVersion: observedVersion });
    } catch (error) {
      await database.execute(sql`
        insert into zotero_libraries (id, user_id, library_type, library_id, name, permissions, library_version, last_error, next_retry_at, created_at, updated_at)
        values (
          ${databaseId("zotero_library", userId, library.type, library.id, library.id)},
          ${userId}, ${library.type}, ${library.id}, ${library.name}, ${JSON.stringify(library.permissions)}::jsonb,
          ${since}, ${error instanceof Error ? error.message.slice(0, 1000) : "Sync failed"}, now() + interval '5 minutes', now(), now()
        )
        on conflict (user_id, library_type, library_id) do update set
          last_error = excluded.last_error, next_retry_at = excluded.next_retry_at, updated_at = now()
      `);
      throw error;
    }
  }
  return results;
}

export async function storedZoteroPdf(input: {
  credential: ZoteroCredential;
  libraryType: "user" | "group";
  libraryId: string;
  itemKey: string;
  allowFiles: boolean;
}) {
  if (!input.allowFiles) throw new Error("This Zotero key does not allow stored-file access.");
  const prefix = zoteroPrefix(input.libraryType, input.libraryId);
  const item = (await zoteroRequest<ZoteroItem>(`${prefix}/items/${encodeURIComponent(input.itemKey)}`, input.credential.apiKey)).data;
  const normalized = normalizeZoteroItem(item);
  if (normalized.attachment?.availability !== "stored_pdf") throw new Error("This attachment is not a stored PDF.");
  const response = await fetch(`https://api.zotero.org${prefix}/items/${encodeURIComponent(input.itemKey)}/file`, {
    headers: { "Zotero-API-Key": input.credential.apiKey, "Zotero-API-Version": "3", accept: "application/pdf" },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok || !response.body) throw new Error(messageForStatus(response.status));
  const declared = Number(response.headers.get("content-length") ?? 0);
  const maximum = 50 * 1024 * 1024;
  if (declared > maximum) throw new Error("Stored PDFs are limited to 50 MB.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximum) {
      await reader.cancel();
      throw new Error("Stored PDFs are limited to 50 MB.");
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Zotero returned a file that is not a valid PDF.");
  return {
    bytes,
    filename: String(item.data.filename ?? `${input.itemKey}.pdf`).replace(/[^a-zA-Z0-9._ -]+/g, "-").slice(0, 200),
    etag: response.headers.get("etag") ?? undefined,
  };
}

export function newZoteroIntegrationId() {
  return `integration_zotero_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}
