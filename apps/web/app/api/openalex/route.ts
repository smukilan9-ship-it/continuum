import { randomUUID } from "node:crypto";
import { getDatabase, sql } from "@continuum/db";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import {
  openAlexCitationGraph,
  openAlexDetail,
  openAlexEntityKinds,
  OpenAlexUpstreamError,
  openAlexWorksForEntity,
  publicationYearFilter,
  searchOpenAlex,
  validOpenAlexId,
  zoteroMatches,
  type OpenAlexEntityKind,
} from "@/lib/openalex";
import { getOpenAlexApiKeyForUser } from "@/lib/provider-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const writeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    kind: z.enum(openAlexEntityKinds),
    id: z.string().min(4).max(50),
    title: z.string().min(1).max(1000),
    metadata: z.record(z.string(), z.unknown()).default({}),
  }),
  z.object({ action: z.literal("unsave"), kind: z.enum(openAlexEntityKinds), id: z.string().min(4).max(50) }),
]);

/**
 * A Zotero cross-reference is an enrichment. It must never be able to take down
 * scholarly browsing, so a failure here degrades to "no matches" and is logged.
 */
async function safeZoteroMatches(userId: string, dois: string[]) {
  try {
    return await zoteroMatches(userId, dois);
  } catch (error) {
    console.warn("zotero_match_failed", JSON.stringify({ userId, message: error instanceof Error ? error.name : "unknown" }));
    return [];
  }
}

function send(payload: Record<string, unknown> & { refresh?: () => Promise<void> }) {
  const { refresh, ...body } = payload;
  if (refresh) after(async () => { try { await refresh(); } catch { /* Stale data remains safe until expiry. */ } });
  return NextResponse.json(body, {
    headers: {
      "cache-control": "private, no-store",
      "x-continuum-cache": typeof body.cache === "string" ? body.cache : "none",
    },
  });
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "openalex-read", 60, 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Scholarly lookup limit reached. Try again in a minute." }, { status: 429 });
  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "search";
  const kind = z.enum(openAlexEntityKinds).catch("works").parse(url.searchParams.get("kind")) as OpenAlexEntityKind;
  try {
    if (action === "saved") {
      const saved = await getDatabase().execute(sql`
        select id, entity_type, external_id, title, metadata, created_at, updated_at
        from saved_external_entities
        where user_id = ${user.id} and provider = 'openalex' and deleted = false
        order by updated_at desc limit 500
      `);
      return send({ saved: saved.rows });
    }
    // An OpenAlex key is an enhancement (higher rate limits), never a hard gate:
    // the public API answers unauthenticated requests from the polite pool.
    const apiKey = await getOpenAlexApiKeyForUser(user.id);
    if (action === "detail") {
      const id = url.searchParams.get("id") ?? "";
      const detail = await openAlexDetail(kind, id, apiKey);
      const works = kind === "works" ? undefined : await openAlexWorksForEntity(kind, id, apiKey, url.searchParams.get("cursor") ?? undefined);
      const dois = [detail.work?.doi, ...(works?.works ?? []).map((work) => work.doi)].filter((doi): doi is string => Boolean(doi));
      const matches = await safeZoteroMatches(user.id, dois);
      return send({
        ...detail,
        relatedWorks: works?.works,
        totalWorks: works?.total,
        nextCursor: works?.nextCursor,
        zoteroMatches: matches,
        keyless: !apiKey,
        refresh: detail.refresh ?? works?.refresh,
      });
    }
    if (action === "graph") {
      const id = url.searchParams.get("id") ?? "";
      const direction = z.enum(["references", "cited_by", "related"]).catch("references").parse(url.searchParams.get("direction"));
      const graph = await openAlexCitationGraph(id, direction, apiKey, url.searchParams.get("cursor") ?? undefined);
      const matches = await safeZoteroMatches(user.id, graph.works.map((work) => work.doi).filter((doi): doi is string => Boolean(doi)));
      return send({ ...graph, zoteroMatches: matches, keyless: !apiKey });
    }
    const query = url.searchParams.get("q")?.trim();
    if (!query || query.length < 2) return NextResponse.json({ error: "Enter at least two search characters." }, { status: 400 });
    // `Number(null)` is 0, so an absent `toYear` used to satisfy `toYear <= 2200`
    // and emit `to_publication_date:0-12-31` on *every* works search. OpenAlex
    // rejected the whole request with HTTP 400 — the outage behind F-01. Parse
    // each bound only when it is actually present and in range.
    const filters = [];
    const fromYear = publicationYearFilter(url.searchParams.get("fromYear"));
    const toYear = publicationYearFilter(url.searchParams.get("toYear"));
    if (kind === "works" && fromYear !== undefined) filters.push(`from_publication_date:${fromYear}-01-01`);
    if (kind === "works" && toYear !== undefined) filters.push(`to_publication_date:${toYear}-12-31`);
    if (kind === "works" && url.searchParams.get("openAccess") === "true") filters.push("open_access.is_oa:true");
    const sortParameter = url.searchParams.get("sort");
    const result = await searchOpenAlex({
      kind,
      query,
      apiKey,
      filters,
      cursor: url.searchParams.get("cursor") ?? undefined,
      sort: sortParameter === "citations" ? "cited_by_count:desc" : sortParameter === "newest" ? "publication_date:desc" : undefined,
    });
    // AC-Z3: "In your Zotero" must be right on the first render of the results.
    // The client used to answer it by crawling up to 500 Zotero items once per
    // session and matching locally — expensive, and only ever approximate,
    // because absence past the crawl limit was indistinguishable from a real
    // miss. One indexed DOI join over the page that is actually being returned
    // is both cheaper and exact, and `detail` and `graph` already did it.
    const matches = await safeZoteroMatches(user.id, result.works.map((work) => work.doi).filter((doi): doi is string => Boolean(doi)));
    return send({ ...result, zoteroMatches: matches, keyless: !apiKey });
  } catch (error) {
    // Never return `error.message` verbatim — it has leaked raw SQL, parameter
    // placeholders, and internal user ids straight into the UI.
    console.error("openalex_request_failed", JSON.stringify({ userId: user.id, action, kind, message: error instanceof Error ? error.message : "unknown" }));
    if (error instanceof OpenAlexUpstreamError) {
      return NextResponse.json(
        { error: "OpenAlex could not complete this request.", detail: error.publicDetail, code: "openalex_upstream" },
        { status: error.status === 429 ? 429 : 502 },
      );
    }
    if (error instanceof Error && error.message === "Invalid OpenAlex entity ID.") {
      return NextResponse.json({ error: "That OpenAlex identifier is not valid.", code: "invalid_id" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Something went wrong loading scholarly data. Your saved work is unaffected.", code: "internal" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin scholarly writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "openalex-write", 120, 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Too many saved-entity changes." }, { status: 429 });
  const parsed = writeSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid saved-entity action", issues: parsed.error.issues }, { status: 400 });
  try {
    const externalId = validOpenAlexId(parsed.data.kind, parsed.data.id);
    if (parsed.data.action === "unsave") {
      const result = await getDatabase().execute(sql`
        update saved_external_entities set deleted = true, updated_at = now(), version = version + 1
        where user_id = ${user.id} and provider = 'openalex' and entity_type = ${parsed.data.kind}
          and external_id = ${externalId} returning id
      `);
      return NextResponse.json({ unsaved: result.rows.length > 0 });
    }
    await getDatabase().execute(sql`
      insert into saved_external_entities (
        id, user_id, provider, entity_type, external_id, title, metadata, created_at, updated_at
      ) values (
        ${`external_entity_${randomUUID().replaceAll("-", "").slice(0, 24)}`},
        ${user.id}, 'openalex', ${parsed.data.kind}, ${externalId}, ${parsed.data.title},
        ${JSON.stringify(parsed.data.metadata)}::jsonb, now(), now()
      )
      on conflict (user_id, provider, entity_type, external_id) do update set
        title = excluded.title, metadata = excluded.metadata, deleted = false,
        updated_at = now(), version = saved_external_entities.version + 1
    `);
    return NextResponse.json({ saved: true, externalId }, { status: 201 });
  } catch (error) {
    console.error("openalex_save_failed", JSON.stringify({ userId: user.id, message: error instanceof Error ? error.message : "unknown" }));
    if (error instanceof Error && error.message === "Invalid OpenAlex entity ID.") {
      return NextResponse.json({ error: "That OpenAlex identifier is not valid.", code: "invalid_id" }, { status: 400 });
    }
    return NextResponse.json({ error: "The entity could not be saved. Your saved work is unaffected.", code: "internal" }, { status: 500 });
  }
}
