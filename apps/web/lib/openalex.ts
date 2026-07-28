import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { externalApiCache, getDatabase, sql } from "@continuum/db";
import { abstractFromInvertedIndex, normalizeDoi, normalizeOpenAlexWork, type NormalizedScholarlyWork } from "./scholarly";

export const openAlexEntityKinds = ["works", "authors", "institutions", "sources", "topics"] as const;
export type OpenAlexEntityKind = typeof openAlexEntityKinds[number];

export type OpenAlexEntity = {
  id: string;
  kind: OpenAlexEntityKind;
  title: string;
  description?: string;
  worksCount?: number;
  citedByCount?: number;
  countryCode?: string;
  homepageUrl?: string;
  externalUrl: string;
  identifiers: Record<string, string>;
  summary: Record<string, unknown>;
  raw: Record<string, unknown>;
};

export type OpenAlexList = {
  results: OpenAlexEntity[];
  works: NormalizedScholarlyWork[];
  total: number;
  nextCursor?: string;
  cost?: number;
};

type CachedPayload = {
  payload: Record<string, unknown>;
  cache: "fresh" | "stale" | "miss";
  cachedAt?: string;
  refresh?: () => Promise<void>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function safeUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : undefined;
  } catch { return undefined; }
}

function shortId(value: unknown) {
  return text(value)?.replace(/^https?:\/\/openalex\.org\//i, "").toUpperCase();
}

function expectedPrefix(kind: OpenAlexEntityKind) {
  return ({ works: "W", authors: "A", institutions: "I", sources: "S", topics: "T" } as const)[kind];
}

export function validOpenAlexId(kind: OpenAlexEntityKind, value: string) {
  const normalized = value.replace(/^https?:\/\/openalex\.org\//i, "").toUpperCase();
  if (!new RegExp(`^${expectedPrefix(kind)}\\d{3,20}$`).test(normalized)) throw new Error("Invalid OpenAlex entity ID.");
  return normalized;
}

/**
 * An upstream OpenAlex failure carrying a message that is safe to show a user.
 * `publicDetail` never contains the API key, SQL, or any Continuum internals —
 * it is the descriptive body OpenAlex itself returned.
 */
export class OpenAlexUpstreamError extends Error {
  readonly status: number;
  readonly publicDetail: string;
  constructor(status: number, publicDetail: string) {
    super(`OpenAlex returned HTTP ${status}.`);
    this.name = "OpenAlexUpstreamError";
    this.status = status;
    this.publicDetail = publicDetail;
  }
}

// The projection the proven-working client sends. Requesting only these fields
// keeps `/works` responses small — 25 records with `abstract_inverted_index` and
// `referenced_works` is otherwise the heaviest payload the endpoint can produce.
export const openAlexWorkSelect =
  "id,doi,display_name,title,publication_year,publication_date,cited_by_count,authorships,primary_location,best_oa_location,open_access,topics,primary_topic,type,language,is_retracted,abstract_inverted_index,related_works,referenced_works,ids";

const contactMail = () => process.env.CROSSREF_MAILTO?.trim() || process.env.OPENALEX_MAILTO?.trim();

function redactedParameters(url: URL) {
  const safe = new URLSearchParams(url.searchParams);
  safe.delete("api_key");
  return safe.toString();
}

/**
 * Issues the request, and if an authenticated call is rejected with a 4xx,
 * retries once against the public polite pool.
 *
 * A key is an enhancement (higher rate limits), not a requirement, so a
 * key-scope or key-expiry problem degrades to the polite pool instead of taking
 * scholarly search down.
 */
async function requestOpenAlex(path: string, parameters: URLSearchParams, apiKey: string | undefined) {
  try {
    return await requestOpenAlexOnce(path, parameters, apiKey);
  } catch (error) {
    const retryable = apiKey && error instanceof OpenAlexUpstreamError && error.status >= 400 && error.status < 500 && error.status !== 429;
    if (!retryable) throw error;
    console.warn("openalex_keyless_retry", JSON.stringify({ path, status: (error as OpenAlexUpstreamError).status }));
    return requestOpenAlexOnce(path, parameters, undefined);
  }
}

async function requestOpenAlexOnce(path: string, parameters: URLSearchParams, apiKey: string | undefined) {
  const url = new URL(path, "https://api.openalex.org");
  for (const [key, value] of parameters) url.searchParams.set(key, value);
  // The public API works without a key. A key is an enhancement, never a hard gate.
  const key = apiKey?.trim();
  if (key) url.searchParams.set("api_key", key);
  else if (contactMail()) url.searchParams.set("mailto", contactMail()!);
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": `Continuum/1.0 (${contactMail() ?? "scholarly-service"})` },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (response.ok) return payload;
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 200 * (2 ** attempt)));
        continue;
      }
      // OpenAlex describes its own 4xx responses; carrying that text forward turns
      // every future upstream bug from a guess into a fact.
      const detail = [payload.error, payload.message]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" — ");
      console.warn("openalex_upstream_error", JSON.stringify({
        status: response.status,
        detail: detail || null,
        path,
        params: redactedParameters(url),
      }));
      throw new OpenAlexUpstreamError(
        response.status,
        response.status === 429
          ? "OpenAlex temporarily rate limited the scholarly service."
          : detail || `OpenAlex returned HTTP ${response.status}.`,
      );
    } catch (error) {
      // Only 429/5xx/network faults are retryable; a 4xx thrown above must not be
      // replayed three times with backoff before the caller ever sees it.
      if (error instanceof OpenAlexUpstreamError) throw error;
      lastError = error instanceof Error ? error : new Error("OpenAlex request failed.");
      if (attempt < 2) continue;
    }
  }
  throw lastError ?? new Error("OpenAlex request failed.");
}

function cacheKey(path: string, parameters: URLSearchParams) {
  const normalized = [...parameters.entries()].sort(([left], [right]) => left.localeCompare(right));
  return createHash("sha256").update(JSON.stringify([path, normalized])).digest("hex");
}

async function storeCache(key: string, payload: Record<string, unknown>, staleMilliseconds: number, expiresMilliseconds: number) {
  const now = Date.now();
  await getDatabase().insert(externalApiCache).values({
    id: `external_cache_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
    provider: "openalex",
    cacheKey: key,
    payload,
    staleAt: new Date(now + staleMilliseconds),
    expiresAt: new Date(now + expiresMilliseconds),
  }).onConflictDoUpdate({
    target: [externalApiCache.provider, externalApiCache.cacheKey],
    set: {
      payload,
      staleAt: new Date(now + staleMilliseconds),
      expiresAt: new Date(now + expiresMilliseconds),
      updatedAt: new Date(),
    },
  });
}

export async function cachedOpenAlex(path: string, parameters: URLSearchParams, apiKey: string | undefined, ttl: { staleMs?: number; expiresMs?: number } = {}): Promise<CachedPayload> {
  const key = cacheKey(path, parameters);
  const result = await getDatabase().execute(sql`
    select payload, stale_at, expires_at, updated_at from external_api_cache
    where provider = 'openalex' and cache_key = ${key} and expires_at > now()
    limit 1
  `);
  const cached = result.rows[0] as { payload?: Record<string, unknown>; stale_at?: Date | string; expires_at?: Date | string; updated_at?: Date | string } | undefined;
  const staleMs = ttl.staleMs ?? 30 * 60_000;
  const expiresMs = ttl.expiresMs ?? 24 * 60 * 60_000;
  const refresh = async () => {
    const payload = await requestOpenAlex(path, parameters, apiKey);
    await storeCache(key, payload, staleMs, expiresMs);
  };
  if (cached?.payload) {
    const cachedAt = cached.updated_at ? new Date(cached.updated_at).toISOString() : undefined;
    const staleAt = new Date(cached.stale_at!).getTime();
    if (staleAt > Date.now()) return { payload: cached.payload, cache: "fresh", ...(cachedAt ? { cachedAt } : {}) };
    return { payload: cached.payload, cache: "stale", ...(cachedAt ? { cachedAt } : {}), refresh };
  }
  const payload = await requestOpenAlex(path, parameters, apiKey);
  await storeCache(key, payload, staleMs, expiresMs);
  return { payload, cache: "miss" };
}

export function normalizeOpenAlexEntity(kind: OpenAlexEntityKind, rawValue: unknown): OpenAlexEntity | undefined {
  const raw = asRecord(rawValue);
  const id = shortId(raw.id);
  const title = text(raw.display_name) ?? text(raw.title);
  if (!id || !title) return undefined;
  const ids = asRecord(raw.ids);
  const geo = asRecord(raw.geo);
  const lastInstitution = asArray(raw.last_known_institutions).map(asRecord)[0] ?? {};
  const primaryTopic = asRecord(raw.primary_topic);
  const source = asRecord(asRecord(raw.primary_location).source);
  const identifiers: Record<string, string> = {};
  for (const [key, value] of Object.entries(ids)) if (typeof value === "string") identifiers[key] = value;
  if (text(raw.doi)) identifiers.doi = text(raw.doi)!;
  if (text(raw.orcid)) identifiers.orcid = text(raw.orcid)!;
  if (text(raw.ror)) identifiers.ror = text(raw.ror)!;
  return {
    id,
    kind,
    title,
    ...(text(raw.description) ?? abstractFromInvertedIndex(raw.abstract_inverted_index) ? { description: text(raw.description) ?? abstractFromInvertedIndex(raw.abstract_inverted_index) } : {}),
    ...(number(raw.works_count) !== undefined ? { worksCount: number(raw.works_count) } : {}),
    ...(number(raw.cited_by_count) !== undefined ? { citedByCount: number(raw.cited_by_count) } : {}),
    ...(text(raw.country_code) ?? text(geo.country_code) ? { countryCode: text(raw.country_code) ?? text(geo.country_code) } : {}),
    ...(safeUrl(raw.homepage_url) ? { homepageUrl: safeUrl(raw.homepage_url) } : {}),
    externalUrl: `https://openalex.org/${id}`,
    identifiers,
    summary: {
      type: raw.type,
      publicationYear: raw.publication_year,
      publicationDate: raw.publication_date,
      openAccess: asRecord(raw.open_access),
      source: text(source.display_name),
      lastKnownInstitution: text(lastInstitution.display_name),
      primaryTopic: text(primaryTopic.display_name),
      countsByYear: asArray(raw.counts_by_year).slice(0, 12),
      topics: asArray(raw.topics).slice(0, 12).map((topic) => ({
        id: shortId(asRecord(topic).id),
        name: text(asRecord(topic).display_name),
        score: number(asRecord(topic).score),
      })),
    },
    raw,
  };
}

function normalizedList(kind: OpenAlexEntityKind, payload: Record<string, unknown>): OpenAlexList {
  const meta = asRecord(payload.meta);
  const raw = asArray(payload.results);
  return {
    results: kind === "works" ? [] : raw.map((entry) => normalizeOpenAlexEntity(kind, entry)).filter((entry): entry is OpenAlexEntity => Boolean(entry)),
    works: kind === "works" ? raw.map((entry) => normalizeOpenAlexWork(entry)).filter((entry): entry is NormalizedScholarlyWork => Boolean(entry)) : [],
    total: number(meta.count) ?? raw.length,
    ...(text(meta.next_cursor) ? { nextCursor: text(meta.next_cursor) } : {}),
    ...(number(meta.cost_usd) !== undefined ? { cost: number(meta.cost_usd) } : {}),
  };
}

/**
 * Builds request parameters in the shape OpenAlex documents: hyphenated
 * `per-page`, and an explicit `select` projection on `/works`.
 *
 * These make the request correct and cheap, but they were not the outage: the
 * HTTP 400 on every works search came from a malformed `to_publication_date`
 * filter built in the route — see `publicationYearFilter`.
 */
export function listParameters(kind: OpenAlexEntityKind, input: { perPage?: number; cursor?: string; filters?: string[]; sort?: string; search?: string; paginated?: boolean }) {
  const parameters = new URLSearchParams();
  if (input.search) parameters.set("search", input.search);
  if (input.filters?.length) parameters.set("filter", input.filters.join(","));
  if (input.sort) parameters.set("sort", input.sort);
  parameters.set("per-page", String(Math.max(1, Math.min(100, input.perPage ?? 25))));
  // OpenAlex only returns `meta.next_cursor` when a cursor is in play, so a
  // paginated list opens with the `*` seed cursor.
  if (input.cursor) parameters.set("cursor", input.cursor);
  else if (input.paginated) parameters.set("cursor", "*");
  if (kind === "works") parameters.set("select", openAlexWorkSelect);
  return parameters;
}

export async function searchOpenAlex(input: {
  kind: OpenAlexEntityKind;
  query: string;
  apiKey?: string;
  cursor?: string;
  filters?: string[];
  sort?: string;
  perPage?: number;
}) {
  const parameters = listParameters(input.kind, {
    search: input.query.replace(/[|,]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500),
    paginated: true,
    ...(input.filters ? { filters: input.filters } : {}),
    ...(input.sort ? { sort: input.sort } : {}),
    ...(input.perPage ? { perPage: input.perPage } : {}),
    ...(input.cursor ? { cursor: input.cursor } : {}),
  });
  const cached = await cachedOpenAlex(`/${input.kind}`, parameters, input.apiKey, { staleMs: 15 * 60_000, expiresMs: 12 * 60 * 60_000 });
  return { ...normalizedList(input.kind, cached.payload), cache: cached.cache, cachedAt: cached.cachedAt, refresh: cached.refresh };
}

export async function openAlexDetail(kind: OpenAlexEntityKind, id: string, apiKey?: string) {
  const normalizedId = validOpenAlexId(kind, id);
  const cached = await cachedOpenAlex(`/${kind}/${normalizedId}`, new URLSearchParams(), apiKey, { staleMs: 24 * 60 * 60_000, expiresMs: 14 * 24 * 60 * 60_000 });
  return {
    entity: normalizeOpenAlexEntity(kind, cached.payload),
    work: kind === "works" ? normalizeOpenAlexWork(cached.payload) : undefined,
    cache: cached.cache,
    cachedAt: cached.cachedAt,
    refresh: cached.refresh,
  };
}

export async function openAlexWorksForEntity(kind: Exclude<OpenAlexEntityKind, "works">, id: string, apiKey?: string, cursor?: string) {
  const normalizedId = validOpenAlexId(kind, id);
  const filterKey = ({
    authors: "author.id",
    institutions: "institutions.id",
    sources: "primary_location.source.id",
    topics: "topics.id",
  } as const)[kind];
  const parameters = listParameters("works", {
    filters: [`${filterKey}:${normalizedId}`],
    sort: "cited_by_count:desc",
    perPage: 25,
    paginated: true,
    ...(cursor ? { cursor } : {}),
  });
  const cached = await cachedOpenAlex("/works", parameters, apiKey, { staleMs: 30 * 60_000, expiresMs: 24 * 60 * 60_000 });
  return { ...normalizedList("works", cached.payload), cache: cached.cache, cachedAt: cached.cachedAt, refresh: cached.refresh };
}

export async function openAlexCitationGraph(workId: string, direction: "references" | "cited_by" | "related", apiKey?: string, cursor?: string) {
  const id = validOpenAlexId("works", workId);
  if (direction === "references") {
    const detail = await openAlexDetail("works", id, apiKey);
    const ids = detail.work?.referenceIds.slice(0, 100) ?? [];
    if (!ids.length) return { results: [], works: [], total: 0, cache: detail.cache, cachedAt: detail.cachedAt };
    const parameters = listParameters("works", { filters: [`openalex_id:${ids.join("|")}`], perPage: 100 });
    const cached = await cachedOpenAlex("/works", parameters, apiKey);
    return { ...normalizedList("works", cached.payload), cache: cached.cache, cachedAt: cached.cachedAt, refresh: cached.refresh };
  }
  const parameters = listParameters("works", {
    filters: [direction === "cited_by" ? `cites:${id}` : `related_to:${id}`],
    sort: "cited_by_count:desc",
    perPage: 25,
    paginated: true,
    ...(cursor ? { cursor } : {}),
  });
  const cached = await cachedOpenAlex("/works", parameters, apiKey, { staleMs: 30 * 60_000, expiresMs: 24 * 60 * 60_000 });
  return { ...normalizedList("works", cached.payload), cache: cached.cache, cachedAt: cached.cachedAt, refresh: cached.refresh };
}

/**
 * Cross-references a DOI list against the user's Zotero items.
 *
 * The DOI list must be expanded into a real `in (...)` list: Drizzle's `sql`
 * template turns a JS array into a comma-separated parameter run, so
 * `= any(${dois})` emitted `any(($2, $3, …))` — a Postgres row constructor that
 * `any()` rejects, taking down every OpenAlex detail and graph request.
 */
/**
 * Parses a publication-year bound, or undefined when it is absent or unusable.
 *
 * `Number(null)` is 0, so an absent `toYear` satisfied a bare `toYear <= 2200`
 * check and emitted `to_publication_date:0-12-31` on *every* works search.
 * OpenAlex rejected the whole request with HTTP 400 — that single line is what
 * took Works search down while the other four entity kinds kept working.
 */
export function publicationYearFilter(raw: string | null) {
  if (!raw?.trim()) return undefined;
  const year = Number(raw);
  return Number.isInteger(year) && year >= 1800 && year <= 2200 ? year : undefined;
}

export function zoteroMatchQuery(userId: string, dois: string[]) {
  const list = sql.join(dois.map((doi) => sql`${doi}`), sql`, `);
  return sql`
    select library_type, library_id, item_key, title, doi, source_id
    from zotero_items
    where user_id = ${userId} and deleted = false and lower(doi) in (${list})
  `;
}

export async function zoteroMatches(userId: string, doiValues: string[]) {
  const dois = doiValues.map(normalizeDoi).filter((doi): doi is string => Boolean(doi)).slice(0, 100);
  if (!dois.length) return [];
  const result = await getDatabase().execute(zoteroMatchQuery(userId, dois));
  return result.rows;
}
