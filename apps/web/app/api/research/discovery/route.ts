import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import {
  CrossrefProvider,
  deduplicateScholarlyWorks,
  OpenAlexProvider,
  planScholarlyQuery,
  rankScholarlyWorks,
  ScholarlyProviderError,
  type NormalizedScholarlyWork,
} from "@/lib/scholarly";
import { getUserProviderSecret } from "@/lib/provider-credentials";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 30;

const querySchema = z.object({
  q: z.string().trim().min(2).max(500).optional(),
  mode: z.enum(["keywords", "title", "author", "doi"]).default("keywords"),
  provider: z.enum(["all", "openalex", "crossref"]).default("openalex"),
  openAccess: z.enum(["true", "false"]).optional(),
  fromYear: z.coerce.number().int().min(1800).max(2200).optional(),
  toYear: z.coerce.number().int().min(1800).max(2200).optional(),
  sort: z.enum(["relevance", "citations", "newest"]).default("relevance"),
  cursor: z.string().max(2_000).optional(),
  authorId: z.string().max(100).optional(),
  institutionId: z.string().max(100).optional(),
  sourceId: z.string().max(100).optional(),
  topicId: z.string().max(100).optional(),
  language: z.string().max(20).optional(),
  relation: z.enum(["related", "cited_by", "references"]).optional(),
  workId: z.string().max(100).optional(),
  referenceIds: z.string().max(5_000).optional(),
  entityType: z.enum(["author", "institution", "source", "topic"]).optional(),
});

const saveSchema = z.object({
  action: z.literal("save"),
  projectId: z.string().min(3).max(200),
  work: z.object({
    providerId: z.string().min(1).max(500),
    doi: z.string().max(500).optional(),
    title: z.string().min(2).max(1000),
    authors: z.array(z.string().max(300)).max(100),
    year: z.number().int().min(1800).max(2200).optional(),
    venue: z.string().max(500).optional(),
    abstract: z.string().max(20_000).optional(),
    citedByCount: z.number().int().min(0).optional(),
    openAccess: z.boolean(),
    landingPageUrl: z.string().url().optional(),
    fullTextUrl: z.string().url().optional(),
    topics: z.array(z.string().max(300)).max(20),
    institutions: z.array(z.string().max(500)).max(20),
    type: z.string().max(100).optional(),
    sourceProvider: z.enum(["openalex", "crossref"]),
    retrievedAt: z.string().datetime({ offset: true }),
    relatedWorkIds: z.array(z.string()).max(200),
    referenceIds: z.array(z.string()).max(500),
    publicationDate: z.string().optional(),
    openAccessStatus: z.string().optional(),
    language: z.string().optional(),
    retracted: z.boolean().optional(),
    version: z.string().optional(),
    sourceId: z.string().optional(),
    metadataIncomplete: z.boolean().optional(),
    authorDetails: z.array(z.object({ id: z.string().optional(), name: z.string(), orcid: z.string().optional(), institutions: z.array(z.string()) })).optional(),
  }),
});

type CacheEntry = { expiresAt: number; payload: unknown };
const cache = new Map<string, CacheEntry>();

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "research-discovery", 30, 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Discovery limit reached. Try again in a minute." }, { status: 429 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success || (parsed.data?.fromYear && parsed.data?.toYear && parsed.data.fromYear > parsed.data.toYear)) return NextResponse.json({ error: "Check the search query and date range." }, { status: 400 });
  if (!parsed.data.q && !parsed.data.relation) return NextResponse.json({ error: "Enter a search query." }, { status: 400 });
  // Provider configuration is per-user. Never let one student's provider
  // result or connection status populate another student's in-memory cache.
  const cacheKey = `${user.id}:${JSON.stringify(parsed.data)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json(cached.payload, { headers: { "x-continuum-cache": "hit" } });

  const plan = planScholarlyQuery(parsed.data.q ?? "", parsed.data.mode);
  const input = {
    query: plan.mode === "keywords" ? plan.broadQuery : plan.preciseQuery,
    mode: plan.mode,
    openAccessOnly: parsed.data.openAccess === "true",
    fromYear: parsed.data.fromYear ?? plan.detectedYear,
    toYear: parsed.data.toYear ?? plan.detectedYear,
    limit: 12,
    cursor: parsed.data.cursor,
    sort: parsed.data.sort,
    authorId: parsed.data.authorId,
    institutionId: parsed.data.institutionId,
    sourceId: parsed.data.sourceId,
    topicId: parsed.data.topicId,
    language: parsed.data.language,
  };
  const userOpenAlex = await getUserProviderSecret(user.id, "openalex").catch(() => undefined);
  const openalex = new OpenAlexProvider(userOpenAlex?.secret ?? process.env.OPENALEX_API_KEY);
  if (parsed.data.relation) {
    if (!parsed.data.workId && parsed.data.relation !== "references") return NextResponse.json({ error: "A valid OpenAlex work is required." }, { status: 400 });
    try {
      const results = parsed.data.relation === "related"
        ? await openalex.related(parsed.data.workId!, 12)
        : parsed.data.relation === "cited_by"
          ? await openalex.citedBy(parsed.data.workId!, 12)
          : await openalex.references((parsed.data.referenceIds ?? "").split(",").filter(Boolean), 25);
      return NextResponse.json({ results, providers: [{ provider: "openalex", status: "live" }], attribution: ["OpenAlex"] }, { headers: { "cache-control": "private, max-age=0" } });
    } catch (error) {
      const message = error instanceof ScholarlyProviderError ? error.message : "OpenAlex relation lookup failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }
  if (parsed.data.entityType) {
    try {
      const entities = await openalex.searchEntities(parsed.data.entityType, parsed.data.q ?? "", 10);
      return NextResponse.json({ entities, attribution: ["OpenAlex"] }, { headers: { "cache-control": "private, max-age=0" } });
    } catch (error) {
      const message = error instanceof ScholarlyProviderError ? error.message : "OpenAlex entity lookup failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }
  const providers = {
    openalex,
    crossref: new CrossrefProvider(process.env.CROSSREF_MAILTO),
  };
  const requested = parsed.data.provider === "all" ? ["openalex", "crossref"] as const : [parsed.data.provider] as const;
  let nextCursor: string | undefined;
  let total: number | undefined;
  let cost: number | undefined;
  const settled = await Promise.all(requested.map(async (provider) => {
    try {
      if (provider === "openalex") {
        const page = await providers.openalex.searchPage(input);
        nextCursor = page.nextCursor;
        total = page.total;
        cost = page.cost;
        return { provider, status: "live" as const, results: page.results };
      }
      return { provider, status: "live" as const, results: await providers.crossref.search(input) };
    }
    catch (error) {
      const known = error instanceof ScholarlyProviderError ? error : new ScholarlyProviderError(provider, `${provider} failed`, "upstream");
      return { provider, status: known.code === "unconfigured" ? "unconfigured" as const : "failed" as const, message: known.message, results: [] as NormalizedScholarlyWork[] };
    }
  }));
  const results = rankScholarlyWorks(
    deduplicateScholarlyWorks(settled.flatMap((entry) => entry.results)),
    input.query,
    parsed.data.sort,
  );
  const providerStatuses = settled.map((entry) => ({ provider: entry.provider, status: entry.status, ...("message" in entry ? { message: entry.message } : {}) }));
  const payload = { results, providers: providerStatuses, attribution: requested.map((provider) => provider === "openalex" ? "OpenAlex" : "Crossref"), nextCursor, total, cost, queryPlan: { mode: plan.mode, detectedYear: plan.detectedYear, expansions: plan.expansions } };
  if (cache.size > 100) cache.delete(cache.keys().next().value as string);
  cache.set(cacheKey, { expiresAt: Date.now() + 10 * 60_000, payload });
  return NextResponse.json(payload, { headers: { "cache-control": "private, max-age=0", "x-continuum-cache": "miss" } });
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin research writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = saveSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "The selected paper metadata is invalid." }, { status: 400 });
  const rate = await enforceRateLimit(request, "research-save", 60, 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Paper save limit reached." }, { status: 429 });
  const id = `paper_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  const saved = await getStore(user.id).savePaper({ id, userId: user.id, projectId: parsed.data.projectId, title: parsed.data.work.title, authors: parsed.data.work.authors, doi: parsed.data.work.doi, year: parsed.data.work.year });
  if (!saved.duplicate) await getStore(user.id).appendEvent({ type: "research.paper.saved", summary: `Saved ${parsed.data.work.title} to a research project.`, entityIds: [id], projectId: parsed.data.projectId, payload: { paper: parsed.data.work, provider: parsed.data.work.sourceProvider, metadataOnly: !parsed.data.work.fullTextUrl }, source: { surface: "standalone_app" }, importance: 0.72 });
  return NextResponse.json({ ...saved, message: saved.duplicate ? "This paper is already saved in the project." : "Paper saved with provider provenance." }, { status: saved.duplicate ? 200 : 201 });
}
