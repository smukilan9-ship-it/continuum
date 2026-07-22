export type ScholarlyProviderId = "openalex" | "crossref";
export type ScholarlySearchMode = "keywords" | "title" | "author" | "doi";

export type NormalizedScholarlyWork = {
  providerId: string;
  doi?: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  abstract?: string;
  citedByCount?: number;
  openAccess: boolean;
  landingPageUrl?: string;
  fullTextUrl?: string;
  topics: string[];
  institutions: string[];
  type?: string;
  sourceProvider: ScholarlyProviderId;
  retrievedAt: string;
  relatedWorkIds: string[];
  referenceIds: string[];
};

export type ScholarlySearchInput = {
  query: string;
  mode: ScholarlySearchMode;
  openAccessOnly?: boolean;
  fromYear?: number;
  toYear?: number;
  limit?: number;
};

export type ScholarlyFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class ScholarlyProviderError extends Error {
  constructor(readonly provider: ScholarlyProviderId, message: string, readonly code: "unconfigured" | "timeout" | "rate_limited" | "upstream") {
    super(message);
    this.name = "ScholarlyProviderError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeDoi(value: unknown) {
  return stringValue(value)?.toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "").replace(/^doi:\s*/, "");
}

function safeUrl(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : undefined;
  } catch { return undefined; }
}

function stripMarkup(value: unknown) {
  return stringValue(value)?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function abstractFromInvertedIndex(value: unknown) {
  const index = asRecord(value);
  const positioned: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of asArray(positions)) if (typeof position === "number") positioned.push([position, word]);
  }
  return positioned.sort((left, right) => left[0] - right[0]).map((item) => item[1]).join(" ") || undefined;
}

export function normalizeOpenAlexWork(value: unknown, retrievedAt = new Date().toISOString()): NormalizedScholarlyWork | undefined {
  const work = asRecord(value);
  const title = stringValue(work.display_name) ?? stringValue(work.title);
  const id = stringValue(work.id);
  if (!title || !id) return undefined;
  const primaryLocation = asRecord(work.primary_location);
  const source = asRecord(primaryLocation.source);
  const bestLocation = asRecord(work.best_oa_location);
  const openAccess = asRecord(work.open_access);
  const authorships = asArray(work.authorships).map(asRecord);
  return {
    providerId: id.replace(/^https?:\/\/openalex\.org\//, ""),
    ...(normalizeDoi(work.doi) ? { doi: normalizeDoi(work.doi) } : {}),
    title,
    authors: authorships.map((authorship) => stringValue(asRecord(authorship.author).display_name)).filter((author): author is string => Boolean(author)),
    ...(numberValue(work.publication_year) ? { year: numberValue(work.publication_year) } : {}),
    ...(stringValue(source.display_name) ? { venue: stringValue(source.display_name) } : {}),
    ...(abstractFromInvertedIndex(work.abstract_inverted_index) ? { abstract: abstractFromInvertedIndex(work.abstract_inverted_index) } : {}),
    ...(numberValue(work.cited_by_count) !== undefined ? { citedByCount: numberValue(work.cited_by_count) } : {}),
    openAccess: openAccess.is_oa === true || primaryLocation.is_oa === true,
    ...(safeUrl(primaryLocation.landing_page_url) ?? safeUrl(work.doi) ? { landingPageUrl: safeUrl(primaryLocation.landing_page_url) ?? safeUrl(work.doi) } : {}),
    ...(safeUrl(bestLocation.pdf_url) ?? safeUrl(primaryLocation.pdf_url) ? { fullTextUrl: safeUrl(bestLocation.pdf_url) ?? safeUrl(primaryLocation.pdf_url) } : {}),
    topics: asArray(work.topics).map((topic) => stringValue(asRecord(topic).display_name)).filter((topic): topic is string => Boolean(topic)).slice(0, 8),
    institutions: [...new Set(authorships.flatMap((authorship) => asArray(authorship.institutions).map((institution) => stringValue(asRecord(institution).display_name)).filter((name): name is string => Boolean(name))))].slice(0, 8),
    ...(stringValue(work.type) ? { type: stringValue(work.type) } : {}),
    sourceProvider: "openalex",
    retrievedAt,
    relatedWorkIds: asArray(work.related_works).map(String).map((related) => related.replace(/^https?:\/\/openalex\.org\//, "")),
    referenceIds: asArray(work.referenced_works).map(String).map((reference) => reference.replace(/^https?:\/\/openalex\.org\//, "")),
  };
}

function crossrefYear(work: Record<string, unknown>) {
  for (const key of ["published-print", "published-online", "published", "issued", "created"]) {
    const parts = asArray(asRecord(work[key])["date-parts"])[0];
    if (Array.isArray(parts) && typeof parts[0] === "number") return parts[0];
  }
  return undefined;
}

export function normalizeCrossrefWork(value: unknown, retrievedAt = new Date().toISOString()): NormalizedScholarlyWork | undefined {
  const work = asRecord(value);
  const title = stringValue(asArray(work.title)[0]) ?? stringValue(work.title);
  const doi = normalizeDoi(work.DOI);
  if (!title || !doi) return undefined;
  const authors = asArray(work.author).map(asRecord).map((author) => [stringValue(author.given), stringValue(author.family)].filter(Boolean).join(" ")).filter(Boolean);
  const links = asArray(work.link).map(asRecord);
  const fullText = links.find((link) => /pdf|xml|html/i.test(String(link["content-type"] ?? "")) && safeUrl(link.URL));
  const licenses = asArray(work.license).map(asRecord);
  return {
    providerId: doi,
    doi,
    title,
    authors,
    ...(crossrefYear(work) ? { year: crossrefYear(work) } : {}),
    ...(stringValue(asArray(work["container-title"])[0]) ? { venue: stringValue(asArray(work["container-title"])[0]) } : {}),
    ...(stripMarkup(work.abstract) ? { abstract: stripMarkup(work.abstract) } : {}),
    ...(numberValue(work["is-referenced-by-count"]) !== undefined ? { citedByCount: numberValue(work["is-referenced-by-count"]) } : {}),
    openAccess: Boolean(fullText || licenses.length),
    ...(safeUrl(work.URL) ? { landingPageUrl: safeUrl(work.URL) } : {}),
    ...(safeUrl(fullText?.URL) ? { fullTextUrl: safeUrl(fullText?.URL) } : {}),
    topics: asArray(work.subject).map(String).slice(0, 8),
    institutions: [...new Set(asArray(work.author).flatMap((author) => asArray(asRecord(author).affiliation).map((affiliation) => stringValue(asRecord(affiliation).name)).filter((name): name is string => Boolean(name))))].slice(0, 8),
    ...(stringValue(work.type) ? { type: stringValue(work.type) } : {}),
    sourceProvider: "crossref",
    retrievedAt,
    relatedWorkIds: [],
    referenceIds: asArray(work.reference).map((reference) => normalizeDoi(asRecord(reference).DOI)).filter((reference): reference is string => Boolean(reference)).slice(0, 100),
  };
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson(provider: ScholarlyProviderId, url: URL, fetcher: ScholarlyFetch, headers: HeadersInit = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetcher(url, { signal: controller.signal, headers: { accept: "application/json", ...headers }, cache: "no-store" });
      if (response.ok) return await response.json() as unknown;
      if (response.status === 429 && attempt < 2) { await wait(250 * (attempt + 1)); continue; }
      if (response.status >= 500 && attempt < 2) { await wait(180 * (2 ** attempt)); continue; }
      throw new ScholarlyProviderError(provider, `${provider} returned ${response.status}`, response.status === 429 ? "rate_limited" : "upstream");
    } catch (error) {
      if (error instanceof ScholarlyProviderError) throw error;
      if ((error as { name?: string }).name === "AbortError") {
        if (attempt < 2) continue;
        throw new ScholarlyProviderError(provider, `${provider} timed out`, "timeout");
      }
      if (attempt >= 2) throw new ScholarlyProviderError(provider, `${provider} could not be reached`, "upstream");
    } finally { clearTimeout(timeout); }
  }
  throw new ScholarlyProviderError(provider, `${provider} could not be reached`, "upstream");
}

export class OpenAlexProvider {
  readonly id = "openalex" as const;
  constructor(private readonly apiKey: string | undefined, private readonly fetcher: ScholarlyFetch = fetch) {}

  async search(input: ScholarlySearchInput) {
    if (!this.apiKey?.trim()) throw new ScholarlyProviderError(this.id, "OpenAlex needs an OPENALEX_API_KEY", "unconfigured");
    const retrievedAt = new Date().toISOString();
    const query = input.query.trim();
    const doi = normalizeDoi(query);
    const url = input.mode === "doi" && doi
      ? new URL(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`)
      : new URL("https://api.openalex.org/works");
    url.searchParams.set("api_key", this.apiKey.trim());
    if (!(input.mode === "doi" && doi)) {
      if (input.mode === "title") url.searchParams.set("filter", `title.search:${query}`);
      else if (input.mode === "author") url.searchParams.set("filter", `raw_author_name.search:${query}`);
      else url.searchParams.set("search", query);
      const filters = [url.searchParams.get("filter")].filter(Boolean) as string[];
      if (input.openAccessOnly) filters.push("open_access.is_oa:true");
      if (input.fromYear) filters.push(`from_publication_date:${input.fromYear}-01-01`);
      if (input.toYear) filters.push(`to_publication_date:${input.toYear}-12-31`);
      if (filters.length) url.searchParams.set("filter", filters.join(","));
      url.searchParams.set("per-page", String(Math.min(25, Math.max(1, input.limit ?? 12))));
      url.searchParams.set("select", "id,doi,display_name,publication_year,cited_by_count,authorships,primary_location,best_oa_location,open_access,topics,type,abstract_inverted_index,related_works,referenced_works");
    }
    const payload = await fetchJson(this.id, url, this.fetcher);
    const records = asArray(asRecord(payload).results).length ? asArray(asRecord(payload).results) : [payload];
    return records.map((work) => normalizeOpenAlexWork(work, retrievedAt)).filter((work): work is NormalizedScholarlyWork => Boolean(work));
  }

  async related(workId: string, limit = 12) {
    if (!this.apiKey?.trim()) throw new ScholarlyProviderError(this.id, "OpenAlex needs an OPENALEX_API_KEY", "unconfigured");
    const url = new URL("https://api.openalex.org/works");
    url.searchParams.set("api_key", this.apiKey.trim());
    url.searchParams.set("filter", `related_to:${workId.replace(/^https?:\/\/openalex\.org\//, "")}`);
    url.searchParams.set("per-page", String(Math.min(25, Math.max(1, limit))));
    const payload = await fetchJson(this.id, url, this.fetcher);
    return asArray(asRecord(payload).results).map((work) => normalizeOpenAlexWork(work)).filter((work): work is NormalizedScholarlyWork => Boolean(work));
  }
}

export class CrossrefProvider {
  readonly id = "crossref" as const;
  constructor(private readonly mailto: string | undefined, private readonly fetcher: ScholarlyFetch = fetch) {}

  async search(input: ScholarlySearchInput) {
    const retrievedAt = new Date().toISOString();
    const doi = normalizeDoi(input.query);
    const url = input.mode === "doi" && doi
      ? new URL(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)
      : new URL("https://api.crossref.org/works");
    if (!(input.mode === "doi" && doi)) {
      const key = input.mode === "author" ? "query.author" : input.mode === "title" ? "query.title" : "query.bibliographic";
      url.searchParams.set(key, input.query.trim());
      url.searchParams.set("rows", String(Math.min(25, Math.max(1, input.limit ?? 12))));
      const filters: string[] = [];
      if (input.fromYear) filters.push(`from-pub-date:${input.fromYear}-01-01`);
      if (input.toYear) filters.push(`until-pub-date:${input.toYear}-12-31`);
      if (input.openAccessOnly) filters.push("has-license:true");
      if (filters.length) url.searchParams.set("filter", filters.join(","));
    }
    if (this.mailto?.includes("@")) url.searchParams.set("mailto", this.mailto);
    const payload = await fetchJson(this.id, url, this.fetcher, { "user-agent": `Continuum/1.0 (${this.mailto?.includes("@") ? `mailto:${this.mailto}` : "academic research client"})` });
    const message = asRecord(asRecord(payload).message);
    const records = asArray(message.items).length ? asArray(message.items) : [message];
    return records.map((work) => normalizeCrossrefWork(work, retrievedAt)).filter((work): work is NormalizedScholarlyWork => Boolean(work));
  }
}

function normalizedTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function titleSimilarity(left: string, right: string) {
  const a = new Set(normalizedTitle(left).split(" ").filter((token) => token.length > 2));
  const b = new Set(normalizedTitle(right).split(" ").filter((token) => token.length > 2));
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

export function deduplicateScholarlyWorks(works: NormalizedScholarlyWork[]) {
  const merged: NormalizedScholarlyWork[] = [];
  for (const work of works) {
    const duplicate = merged.find((candidate) => (work.doi && candidate.doi === work.doi) || (candidate.providerId === work.providerId && candidate.sourceProvider === work.sourceProvider) || (work.authors[0] && candidate.authors[0] && work.authors[0].split(" ").at(-1)?.toLowerCase() === candidate.authors[0].split(" ").at(-1)?.toLowerCase() && titleSimilarity(candidate.title, work.title) >= 0.9));
    if (!duplicate) { merged.push(work); continue; }
    duplicate.authors = duplicate.authors.length >= work.authors.length ? duplicate.authors : work.authors;
    duplicate.abstract ??= work.abstract;
    duplicate.fullTextUrl ??= work.fullTextUrl;
    duplicate.landingPageUrl ??= work.landingPageUrl;
    duplicate.citedByCount = Math.max(duplicate.citedByCount ?? 0, work.citedByCount ?? 0);
    duplicate.openAccess ||= work.openAccess;
    duplicate.topics = [...new Set([...duplicate.topics, ...work.topics])].slice(0, 8);
  }
  return merged;
}

export function scholarSearchUrl(query: string) {
  const url = new URL("https://scholar.google.com/scholar");
  url.searchParams.set("q", query.trim());
  return url.toString();
}
