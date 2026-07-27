export type ScholarlyProviderId = "openalex" | "crossref";
export type ScholarlySearchMode = "keywords" | "title" | "author" | "doi";
export type ScholarlySort = "relevance" | "citations" | "newest";

export type ScholarlyAuthor = {
  id?: string;
  name: string;
  orcid?: string;
  institutions: string[];
};

export type NormalizedScholarlyWork = {
  providerId: string;
  doi?: string;
  title: string;
  authors: string[];
  authorDetails?: ScholarlyAuthor[];
  year?: number;
  publicationDate?: string;
  venue?: string;
  abstract?: string;
  citedByCount?: number;
  openAccess: boolean;
  openAccessStatus?: string;
  landingPageUrl?: string;
  fullTextUrl?: string;
  topics: string[];
  institutions: string[];
  type?: string;
  language?: string;
  retracted?: boolean;
  version?: string;
  sourceId?: string;
  metadataIncomplete?: boolean;
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
  cursor?: string;
  sort?: ScholarlySort;
  authorId?: string;
  institutionId?: string;
  sourceId?: string;
  topicId?: string;
  language?: string;
};

export type ScholarlySearchPage = {
  results: NormalizedScholarlyWork[];
  nextCursor?: string;
  total?: number;
  cost?: number;
};

export type OpenAlexEntity = {
  id: string;
  name: string;
  type: "author" | "institution" | "source" | "topic";
  description?: string;
  worksCount?: number;
  citedByCount?: number;
  countryCode?: string;
  homepageUrl?: string;
  orcid?: string;
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
  const authorDetails = authorships.map((authorship) => {
    const author = asRecord(authorship.author);
    return {
      ...(stringValue(author.id) ? { id: stringValue(author.id)?.replace(/^https?:\/\/openalex\.org\//, "") } : {}),
      name: stringValue(author.display_name) ?? "Unknown author",
      ...(safeUrl(author.orcid) ? { orcid: safeUrl(author.orcid) } : {}),
      institutions: asArray(authorship.institutions).map((institution) => stringValue(asRecord(institution).display_name)).filter((name): name is string => Boolean(name)),
    };
  });
  const publicationDate = stringValue(work.publication_date);
  const language = stringValue(work.language);
  const version = stringValue(primaryLocation.version);
  const sourceId = stringValue(source.id)?.replace(/^https?:\/\/openalex\.org\//, "");
  return {
    providerId: id.replace(/^https?:\/\/openalex\.org\//, ""),
    ...(normalizeDoi(work.doi) ? { doi: normalizeDoi(work.doi) } : {}),
    title,
    authors: authorDetails.map((author) => author.name).filter((name) => name !== "Unknown author"),
    authorDetails,
    ...(numberValue(work.publication_year) ? { year: numberValue(work.publication_year) } : {}),
    ...(publicationDate ? { publicationDate } : {}),
    ...(stringValue(source.display_name) ? { venue: stringValue(source.display_name) } : {}),
    ...(abstractFromInvertedIndex(work.abstract_inverted_index) ? { abstract: abstractFromInvertedIndex(work.abstract_inverted_index) } : {}),
    ...(numberValue(work.cited_by_count) !== undefined ? { citedByCount: numberValue(work.cited_by_count) } : {}),
    openAccess: openAccess.is_oa === true || primaryLocation.is_oa === true,
    ...(stringValue(openAccess.oa_status) ? { openAccessStatus: stringValue(openAccess.oa_status) } : {}),
    ...(safeUrl(primaryLocation.landing_page_url) ?? safeUrl(work.doi) ? { landingPageUrl: safeUrl(primaryLocation.landing_page_url) ?? safeUrl(work.doi) } : {}),
    ...(safeUrl(bestLocation.pdf_url) ?? safeUrl(primaryLocation.pdf_url) ? { fullTextUrl: safeUrl(bestLocation.pdf_url) ?? safeUrl(primaryLocation.pdf_url) } : {}),
    topics: asArray(work.topics).map((topic) => stringValue(asRecord(topic).display_name)).filter((topic): topic is string => Boolean(topic)).slice(0, 8),
    institutions: [...new Set(authorships.flatMap((authorship) => asArray(authorship.institutions).map((institution) => stringValue(asRecord(institution).display_name)).filter((name): name is string => Boolean(name))))].slice(0, 8),
    ...(stringValue(work.type) ? { type: stringValue(work.type) } : {}),
    ...(language ? { language } : {}),
    ...(typeof work.is_retracted === "boolean" ? { retracted: work.is_retracted } : {}),
    ...(version ? { version } : {}),
    ...(sourceId ? { sourceId } : {}),
    metadataIncomplete: !work.abstract_inverted_index || !authorships.length || !source.display_name,
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

  async searchPage(input: ScholarlySearchInput): Promise<ScholarlySearchPage> {
    if (!this.apiKey?.trim()) throw new ScholarlyProviderError(this.id, "Connect an OpenAlex API key in Connections to use scholarly search.", "unconfigured");
    const retrievedAt = new Date().toISOString();
    const query = input.query.trim();
    const doi = normalizeDoi(query);
    const url = input.mode === "doi" && doi
      ? new URL(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`)
      : new URL("https://api.openalex.org/works");
    url.searchParams.set("api_key", this.apiKey.trim());
    if (!(input.mode === "doi" && doi)) {
      const safeQuery = query.replace(/[|,]/g, " ").replace(/\s+/g, " ").trim();
      if (input.mode === "title") url.searchParams.set("filter", `title.search:${safeQuery}`);
      else if (input.mode === "author") url.searchParams.set("filter", `raw_author_name.search:${safeQuery}`);
      else url.searchParams.set("search", safeQuery);
      const filters = [url.searchParams.get("filter")].filter(Boolean) as string[];
      if (input.openAccessOnly) filters.push("open_access.is_oa:true");
      if (input.fromYear) filters.push(`from_publication_date:${input.fromYear}-01-01`);
      if (input.toYear) filters.push(`to_publication_date:${input.toYear}-12-31`);
      if (input.authorId) filters.push(`author.id:${input.authorId.replace(/^https?:\/\/openalex\.org\//, "")}`);
      if (input.institutionId) filters.push(`institutions.id:${input.institutionId.replace(/^https?:\/\/openalex\.org\//, "")}`);
      if (input.sourceId) filters.push(`primary_location.source.id:${input.sourceId.replace(/^https?:\/\/openalex\.org\//, "")}`);
      if (input.topicId) filters.push(`topics.id:${input.topicId.replace(/^https?:\/\/openalex\.org\//, "")}`);
      if (input.language) filters.push(`language:${input.language.toLowerCase().replace(/[^a-z-]/g, "")}`);
      if (filters.length) url.searchParams.set("filter", filters.join(","));
      url.searchParams.set("per-page", String(Math.min(100, Math.max(1, input.limit ?? 12))));
      if (input.cursor) url.searchParams.set("cursor", input.cursor);
      if (input.sort === "citations") url.searchParams.set("sort", "cited_by_count:desc");
      else if (input.sort === "newest") url.searchParams.set("sort", "publication_date:desc");
      url.searchParams.set("select", "id,doi,display_name,publication_year,publication_date,cited_by_count,authorships,primary_location,best_oa_location,open_access,topics,type,language,is_retracted,abstract_inverted_index,related_works,referenced_works");
    }
    const payload = await fetchJson(this.id, url, this.fetcher);
    const record = asRecord(payload);
    const records = asArray(record.results).length ? asArray(record.results) : [payload];
    const meta = asRecord(record.meta);
    return {
      results: records.map((work) => normalizeOpenAlexWork(work, retrievedAt)).filter((work): work is NormalizedScholarlyWork => Boolean(work)),
      ...(stringValue(meta.next_cursor) ? { nextCursor: stringValue(meta.next_cursor) } : {}),
      ...(numberValue(meta.count) !== undefined ? { total: numberValue(meta.count) } : {}),
      ...(numberValue(meta.cost_usd) !== undefined ? { cost: numberValue(meta.cost_usd) } : {}),
    };
  }

  async search(input: ScholarlySearchInput) {
    return (await this.searchPage(input)).results;
  }

  async related(workId: string, limit = 12) {
    if (!this.apiKey?.trim()) throw new ScholarlyProviderError(this.id, "Connect an OpenAlex API key in Connections to use scholarly search.", "unconfigured");
    const url = new URL("https://api.openalex.org/works");
    url.searchParams.set("api_key", this.apiKey.trim());
    url.searchParams.set("filter", `related_to:${workId.replace(/^https?:\/\/openalex\.org\//, "")}`);
    url.searchParams.set("per-page", String(Math.min(25, Math.max(1, limit))));
    url.searchParams.set("select", "id,doi,display_name,publication_year,publication_date,cited_by_count,authorships,primary_location,best_oa_location,open_access,topics,type,language,is_retracted,abstract_inverted_index,related_works,referenced_works");
    const payload = await fetchJson(this.id, url, this.fetcher);
    return asArray(asRecord(payload).results).map((work) => normalizeOpenAlexWork(work)).filter((work): work is NormalizedScholarlyWork => Boolean(work));
  }

  async citedBy(workId: string, limit = 12) {
    return this.filteredWorks(`cites:${workId.replace(/^https?:\/\/openalex\.org\//, "")}`, limit);
  }

  async references(workIds: string[], limit = 25) {
    const ids = workIds.slice(0, limit).map((id) => id.replace(/^https?:\/\/openalex\.org\//, "")).filter(Boolean);
    if (!ids.length) return [];
    return this.filteredWorks(`openalex_id:${ids.join("|")}`, limit);
  }

  private async filteredWorks(filter: string, limit: number) {
    if (!this.apiKey?.trim()) throw new ScholarlyProviderError(this.id, "Connect an OpenAlex API key in Connections to use scholarly search.", "unconfigured");
    const url = new URL("https://api.openalex.org/works");
    url.searchParams.set("api_key", this.apiKey.trim());
    url.searchParams.set("filter", filter);
    url.searchParams.set("per-page", String(Math.min(100, Math.max(1, limit))));
    url.searchParams.set("select", "id,doi,display_name,publication_year,publication_date,cited_by_count,authorships,primary_location,best_oa_location,open_access,topics,type,language,is_retracted,abstract_inverted_index,related_works,referenced_works");
    const payload = await fetchJson(this.id, url, this.fetcher);
    return asArray(asRecord(payload).results).map((work) => normalizeOpenAlexWork(work)).filter((work): work is NormalizedScholarlyWork => Boolean(work));
  }

  async searchEntities(type: OpenAlexEntity["type"], query: string, limit = 8): Promise<OpenAlexEntity[]> {
    if (!this.apiKey?.trim()) throw new ScholarlyProviderError(this.id, "Connect an OpenAlex API key in Connections to use scholarly search.", "unconfigured");
    const plural = ({ author: "authors", institution: "institutions", source: "sources", topic: "topics" } as const)[type];
    const url = new URL(`https://api.openalex.org/${plural}`);
    url.searchParams.set("api_key", this.apiKey.trim());
    url.searchParams.set("search", query.replace(/[|,]/g, " ").trim());
    url.searchParams.set("per-page", String(Math.min(25, Math.max(1, limit))));
    const payload = await fetchJson(this.id, url, this.fetcher);
    return asArray(asRecord(payload).results).map((raw) => {
      const entity = asRecord(raw);
      return {
        id: String(entity.id ?? "").replace(/^https?:\/\/openalex\.org\//, ""),
        name: stringValue(entity.display_name) ?? "Unnamed",
        type,
        ...(stringValue(entity.description) ? { description: stringValue(entity.description) } : {}),
        ...(numberValue(entity.works_count) !== undefined ? { worksCount: numberValue(entity.works_count) } : {}),
        ...(numberValue(entity.cited_by_count) !== undefined ? { citedByCount: numberValue(entity.cited_by_count) } : {}),
        ...(stringValue(entity.country_code) ? { countryCode: stringValue(entity.country_code) } : {}),
        ...(safeUrl(entity.homepage_url) ? { homepageUrl: safeUrl(entity.homepage_url) } : {}),
        ...(safeUrl(entity.orcid) ? { orcid: safeUrl(entity.orcid) } : {}),
      };
    }).filter((entity) => entity.id);
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

export function rankScholarlyWorks(works: NormalizedScholarlyWork[], query: string, sort: ScholarlySort) {
  if (sort === "citations") return [...works].sort((left, right) => (right.citedByCount ?? 0) - (left.citedByCount ?? 0));
  if (sort === "newest") {
    return [...works].sort((left, right) =>
      (Date.parse(right.publicationDate ?? "") || (right.year ?? 0) * 366 * 86_400_000)
      - (Date.parse(left.publicationDate ?? "") || (left.year ?? 0) * 366 * 86_400_000));
  }
  const terms = normalizedTitle(query).split(" ").filter((term) => term.length > 2);
  const score = (work: NormalizedScholarlyWork) => {
    const title = normalizedTitle(work.title);
    const abstract = normalizedTitle(work.abstract ?? "");
    const topics = normalizedTitle(work.topics.join(" "));
    const authors = normalizedTitle(work.authors.join(" "));
    const matches = terms.reduce((total, term) =>
      total + (title.includes(term) ? 5 : 0) + (topics.includes(term) ? 3 : 0) + (abstract.includes(term) ? 1 : 0) + (authors.includes(term) ? 1 : 0), 0);
    return matches + (work.abstract ? 0.5 : 0) + Math.log10((work.citedByCount ?? 0) + 1) * 0.1;
  };
  return works.map((work, index) => ({ work, index, score: score(work) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.work);
}

const fillerWords = /\b(?:please|can you|could you|would you|help me|find me|show me|papers? about|research about)\b/gi;
const topicSynonyms: Record<string, string[]> = {
  "machine learning": ["statistical learning"],
  "climate change": ["global warming"],
  "spatial transcriptomics": ["spatial gene expression"],
};

export function planScholarlyQuery(raw: string, selectedMode?: ScholarlySearchMode) {
  const doi = normalizeDoi(raw.match(/(?:10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i)?.[0]);
  const quoted = [...raw.matchAll(/"([^"]+)"/g)].map((match) => match[1]!.trim()).filter(Boolean);
  const year = raw.match(/\b(18|19|20|21)\d{2}\b/)?.[0];
  const author = raw.match(/\b(?:author|by)\s*:\s*([^,;]+)/i)?.[1]?.trim();
  const cleaned = raw.replace(fillerWords, " ").replace(/\s+/g, " ").trim();
  const inferredMode: ScholarlySearchMode = doi ? "doi" : author ? "author" : quoted.length ? "title" : selectedMode ?? "keywords";
  const preciseQuery = doi ?? author ?? quoted[0] ?? cleaned;
  const lower = cleaned.toLowerCase();
  const expansions = Object.entries(topicSynonyms).flatMap(([topic, synonyms]) => lower.includes(topic) ? synonyms : []);
  return {
    mode: selectedMode && selectedMode !== "keywords" ? selectedMode : inferredMode,
    preciseQuery,
    broadQuery: [cleaned, ...expansions].filter(Boolean).join(" "),
    ...(year ? { detectedYear: Number(year) } : {}),
    quotedPhrases: quoted,
    expansions,
  };
}
