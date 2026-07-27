import { randomUUID } from "node:crypto";
import { getDatabase, sql } from "@continuum/db";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import {
  openAlexCitationGraph,
  openAlexDetail,
  openAlexEntityKinds,
  openAlexWorksForEntity,
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
    const apiKey = await getOpenAlexApiKeyForUser(user.id);
    if (!apiKey) return NextResponse.json({ error: "Connect an OpenAlex API key in Connections to use scholarly search.", code: "openalex_not_configured" }, { status: 503 });
    if (action === "detail") {
      const id = url.searchParams.get("id") ?? "";
      const detail = await openAlexDetail(kind, id, apiKey);
      const works = kind === "works" ? undefined : await openAlexWorksForEntity(kind, id, apiKey, url.searchParams.get("cursor") ?? undefined);
      const dois = [detail.work?.doi, ...(works?.works ?? []).map((work) => work.doi)].filter((doi): doi is string => Boolean(doi));
      const matches = await zoteroMatches(user.id, dois);
      return send({
        ...detail,
        relatedWorks: works?.works,
        totalWorks: works?.total,
        nextCursor: works?.nextCursor,
        zoteroMatches: matches,
        refresh: detail.refresh ?? works?.refresh,
      });
    }
    if (action === "graph") {
      const id = url.searchParams.get("id") ?? "";
      const direction = z.enum(["references", "cited_by", "related"]).catch("references").parse(url.searchParams.get("direction"));
      const graph = await openAlexCitationGraph(id, direction, apiKey, url.searchParams.get("cursor") ?? undefined);
      const matches = await zoteroMatches(user.id, graph.works.map((work) => work.doi).filter((doi): doi is string => Boolean(doi)));
      return send({ ...graph, zoteroMatches: matches });
    }
    const query = url.searchParams.get("q")?.trim();
    if (!query || query.length < 2) return NextResponse.json({ error: "Enter at least two search characters." }, { status: 400 });
    const filters = [];
    const fromYear = Number(url.searchParams.get("fromYear"));
    const toYear = Number(url.searchParams.get("toYear"));
    if (kind === "works" && Number.isInteger(fromYear) && fromYear >= 1800) filters.push(`from_publication_date:${fromYear}-01-01`);
    if (kind === "works" && Number.isInteger(toYear) && toYear <= 2200) filters.push(`to_publication_date:${toYear}-12-31`);
    if (kind === "works" && url.searchParams.get("openAccess") === "true") filters.push("open_access.is_oa:true");
    const result = await searchOpenAlex({
      kind,
      query,
      apiKey,
      filters,
      cursor: url.searchParams.get("cursor") ?? undefined,
      sort: url.searchParams.get("sort") === "citations" ? "cited_by_count:desc" : undefined,
    });
    return send(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenAlex request failed.";
    return NextResponse.json({ error: message }, { status: message.includes("Connect an OpenAlex API key") ? 503 : 502 });
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Save failed" }, { status: 400 });
  }
}
