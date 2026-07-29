"use client";

import {
  ArrowUpRight,
  BookmarkCheck,
  BookOpen,
  Building2,
  ChevronRight,
  CircleDot,
  ExternalLink,
  Library,
  LoaderCircle,
  Network,
  Search,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Badge, Button, Card, DataRegion, EmptyState, ErrorState, LoadingState, type RegionStatus } from "@/components/ui";
import type { NormalizedScholarlyWork } from "@/lib/scholarly";

export type ScholarlyKind = "works" | "authors" | "institutions" | "sources" | "topics";

export type ScholarlyEntity = {
  id: string;
  kind: ScholarlyKind;
  title: string;
  description?: string;
  worksCount?: number;
  citedByCount?: number;
  countryCode?: string;
  homepageUrl?: string;
  externalUrl: string;
  identifiers: Record<string, string>;
  summary: Record<string, unknown>;
};

export type SavedEntity = { id: string; entity_type: ScholarlyKind; external_id: string; title: string; metadata?: Record<string, unknown>; updated_at?: string };

type ApiError = { error?: string; detail?: string; code?: string };
type ResultPayload = ApiError & { results?: ScholarlyEntity[]; works?: NormalizedScholarlyWork[]; total?: number; nextCursor?: string; cache?: string; cachedAt?: string; keyless?: boolean };
type DetailPayload = ApiError & {
  entity?: ScholarlyEntity;
  work?: NormalizedScholarlyWork;
  relatedWorks?: NormalizedScholarlyWork[];
  totalWorks?: number;
  nextCursor?: string;
  zoteroMatches?: Array<Record<string, unknown>>;
  cache?: string;
  cachedAt?: string;
};

export const scholarlyKinds: Array<{ id: ScholarlyKind; label: string; icon: typeof BookOpen }> = [
  { id: "works", label: "Works", icon: BookOpen },
  { id: "authors", label: "Authors", icon: UserRound },
  { id: "institutions", label: "Institutions", icon: Building2 },
  { id: "sources", label: "Sources", icon: Library },
  { id: "topics", label: "Topics", icon: CircleDot },
];

const currentYear = new Date().getFullYear();

function relativeAge(iso?: string) {
  if (!iso) return undefined;
  const elapsed = Date.now() - Date.parse(iso);
  if (!Number.isFinite(elapsed) || elapsed < 0) return undefined;
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** A payload from `/api/openalex` never carries internals, so `detail` is safe to show. */
function failure(payload: ApiError, fallback: string) {
  return { message: payload.error ?? fallback, detail: payload.detail };
}

function WorkCard({ work, onOpen, saved, onToggleSave, action }: { work: NormalizedScholarlyWork; onOpen: () => void; saved?: boolean; onToggleSave?: () => void; action?: React.ReactNode }) {
  return (
    <div className="scholarly-card">
      <button className="scholarly-card-main" onClick={onOpen}>
        <div>
          <Badge tone={work.openAccess ? "green" : "neutral"}>{work.openAccess ? "Open access" : work.type ?? "Work"}</Badge>
          <strong>{work.title}</strong>
          <p>{work.authors.slice(0, 4).join(", ") || "Author metadata unavailable"}{work.year ? ` · ${work.year}` : ""}</p>
          <small>{work.citedByCount?.toLocaleString() ?? 0} citations · {work.venue ?? "Source unavailable"}</small>
        </div>
        <ChevronRight size={17} aria-hidden="true" />
      </button>
      <div className="scholarly-card-actions">
        {onToggleSave ? <button type="button" className={saved ? "scholarly-bookmark saved" : "scholarly-bookmark"} aria-pressed={saved} aria-label={saved ? `Remove ${work.title} from saved` : `Save ${work.title}`} onClick={onToggleSave}><BookmarkCheck size={15} /></button> : null}
        {action}
      </div>
    </div>
  );
}

/**
 * The single scholarly-search surface.
 *
 * `mode="explore"` is open-ended browsing in the Library; `mode="collect"` is
 * project-scoped acquisition in Research. Both render the same search bar,
 * entity tabs, filter row, result cards, detail panel, and citation graph, so
 * the two surfaces can never drift apart in behaviour, filters, or reliability
 * again.
 */
export function ScholarlySearch({
  mode,
  projectId,
  projectTitle,
  onCollect,
  savedEntities,
  onSavedChange,
  showToast,
  deepLinkBase,
  suggestions,
}: {
  mode: "explore" | "collect";
  projectId?: string;
  projectTitle?: string;
  onCollect?: (work: NormalizedScholarlyWork) => Promise<void> | void;
  savedEntities?: SavedEntity[];
  onSavedChange?: () => void;
  showToast: (message: string | null) => void;
  deepLinkBase?: string;
  /** Starting points drawn from the user's own goals and projects. */
  suggestions?: string[];
}) {
  const [kind, setKind] = useState<ScholarlyKind>("works");
  const [query, setQuery] = useState("");
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [openAccess, setOpenAccess] = useState(false);
  const [sort, setSort] = useState<"relevance" | "citations" | "newest">("relevance");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [listStatus, setListStatus] = useState<RegionStatus>("idle");
  const [listError, setListError] = useState<{ message: string; detail?: string }>();
  const [results, setResults] = useState<ScholarlyEntity[]>([]);
  const [works, setWorks] = useState<NormalizedScholarlyWork[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string>();
  const [listCache, setListCache] = useState<{ cache?: string; cachedAt?: string }>({});

  const [detailStatus, setDetailStatus] = useState<RegionStatus>("idle");
  const [detailError, setDetailError] = useState<{ message: string; detail?: string }>();
  const [detail, setDetail] = useState<DetailPayload>();
  const [selected, setSelected] = useState<{ kind: ScholarlyKind; id: string }>();

  const [graphDirection, setGraphDirection] = useState<"references" | "cited_by" | "related">("references");
  const [graph, setGraph] = useState<NormalizedScholarlyWork[]>([]);
  const [graphCursor, setGraphCursor] = useState<string>();
  const [graphStatus, setGraphStatus] = useState<RegionStatus>("idle");
  const [busy, setBusy] = useState("");
  const lastSearch = useRef<{ kind: ScholarlyKind; query: string } | undefined>(undefined);

  const savedIds = useMemo(() => new Set((savedEntities ?? []).map((entry) => `${entry.entity_type}:${entry.external_id}`)), [savedEntities]);
  const isSaved = useCallback((entityKind: ScholarlyKind, id: string) => savedIds.has(`${entityKind}:${id}`), [savedIds]);

  const pushDeepLink = useCallback((target?: { kind: ScholarlyKind; id: string }) => {
    if (!deepLinkBase || typeof window === "undefined") return;
    const next = target ? `${deepLinkBase}/${target.kind}/${target.id}` : deepLinkBase;
    if (window.location.pathname !== next) window.history.pushState({ scholarly: target ?? null }, "", next);
  }, [deepLinkBase]);

  const loadDetail = useCallback(async (target: { kind: ScholarlyKind; id: string }, options: { pushUrl?: boolean } = {}) => {
    setDetailStatus("loading");
    setDetailError(undefined);
    setSelected(target);
    setGraph([]);
    setGraphCursor(undefined);
    setGraphStatus("idle");
    try {
      const parameters = new URLSearchParams({ action: "detail", kind: target.kind, id: target.id });
      const response = await fetch(`/api/openalex?${parameters}`, { cache: "no-store" });
      const payload = await response.json() as DetailPayload;
      if (!response.ok) throw failure(payload, "Entity details are unavailable.");
      setDetail(payload);
      setDetailStatus("ready");
      if (options.pushUrl !== false) pushDeepLink(target);
    } catch (cause) {
      // The header reads from `detail`, so clearing it here stops the previously
      // selected entity from sitting above an error about a different one.
      setDetail(undefined);
      setDetailStatus("error");
      setDetailError(cause && typeof cause === "object" && "message" in cause ? cause as { message: string; detail?: string } : { message: "Entity details are unavailable." });
      if (options.pushUrl !== false) pushDeepLink(undefined);
    }
  }, [pushDeepLink]);

  // Deep links resolve on mount and on Back/Forward, so browser history moves
  // between entities instead of dropping the user out of the section. `/openalex`
  // links predate `/library` and still resolve.
  useEffect(() => {
    if (!deepLinkBase) return;
    const pattern = /^\/(?:library|openalex)\/(works|authors|institutions|sources|topics)\/([WASIT]\d+)$/i;
    const resolve = () => {
      const match = window.location.pathname.match(pattern);
      if (match) {
        const target = { kind: match[1]!.toLowerCase() as ScholarlyKind, id: match[2]!.toUpperCase() };
        setKind(target.kind);
        void loadDetail(target, { pushUrl: false });
        return;
      }
      setSelected(undefined);
      setDetail(undefined);
      setDetailStatus("idle");
    };
    resolve();
    window.addEventListener("popstate", resolve);
    return () => window.removeEventListener("popstate", resolve);
  }, [deepLinkBase, loadDetail]);

  const runSearch = useCallback(async (event?: FormEvent, cursor?: string, override?: string) => {
    event?.preventDefault();
    const trimmed = (override ?? query).trim();
    if (trimmed.length < 2) {
      setListStatus("error");
      setListError({ message: "Enter at least two search characters." });
      return;
    }
    setListStatus("loading");
    setListError(undefined);
    setBusy(cursor ? "more" : "search");
    try {
      const parameters = new URLSearchParams({ action: "search", kind, q: trimmed });
      if (cursor) parameters.set("cursor", cursor);
      if (sort !== "relevance") parameters.set("sort", sort);
      if (kind === "works") {
        if (fromYear) parameters.set("fromYear", fromYear);
        if (toYear) parameters.set("toYear", toYear);
        if (openAccess) parameters.set("openAccess", "true");
      }
      const response = await fetch(`/api/openalex?${parameters}`, { cache: "no-store" });
      const payload = await response.json() as ResultPayload;
      if (!response.ok) throw failure(payload, "Scholarly search failed.");
      const nextResults = cursor ? [...results, ...(payload.results ?? [])] : payload.results ?? [];
      const nextWorks = cursor ? [...works, ...(payload.works ?? [])] : payload.works ?? [];
      setResults(nextResults);
      setWorks(nextWorks);
      setTotal(payload.total ?? 0);
      setNextCursor(payload.nextCursor);
      setListCache({ cache: payload.cache, cachedAt: payload.cachedAt });
      lastSearch.current = { kind, query: trimmed };
      setListStatus((kind === "works" ? nextWorks.length : nextResults.length) ? "ready" : "empty");
      if (!cursor) {
        setSelected(undefined);
        setDetail(undefined);
        setDetailStatus("idle");
        pushDeepLink(undefined);
      }
    } catch (cause) {
      setListStatus("error");
      setListError(cause && typeof cause === "object" && "message" in cause ? cause as { message: string; detail?: string } : { message: "Scholarly search failed." });
    } finally { setBusy(""); }
  }, [query, kind, sort, fromYear, toYear, openAccess, results, works, pushDeepLink]);

  const loadGraph = useCallback(async (cursor?: string) => {
    if (!selected || selected.kind !== "works") return;
    setGraphStatus("loading");
    try {
      const parameters = new URLSearchParams({ action: "graph", kind: "works", id: selected.id, direction: graphDirection });
      if (cursor) parameters.set("cursor", cursor);
      const response = await fetch(`/api/openalex?${parameters}`, { cache: "no-store" });
      const payload = await response.json() as ResultPayload;
      if (!response.ok) throw failure(payload, "Citation links are unavailable.");
      const nextGraph = cursor ? [...graph, ...(payload.works ?? [])] : payload.works ?? [];
      setGraph(nextGraph);
      setGraphCursor(payload.nextCursor);
      setGraphStatus(nextGraph.length ? "ready" : "empty");
    } catch {
      setGraphStatus("error");
    }
  }, [selected, graphDirection, graph]);

  useEffect(() => {
    if (selected?.kind === "works" && detailStatus === "ready") void loadGraph();
    // Reload only when the selected work or the graph direction changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphDirection, selected?.id, detailStatus]);

  async function toggleSave(entityKind: ScholarlyKind, id: string, title: string, metadata: unknown) {
    const saved = isSaved(entityKind, id);
    setBusy(`save:${id}`);
    try {
      const response = await fetch("/api/openalex", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(saved ? { action: "unsave", kind: entityKind, id } : { action: "save", kind: entityKind, id, title, metadata: metadata ?? {} }),
      });
      const payload = await response.json() as ApiError;
      if (!response.ok) throw new Error(payload.error ?? "The entity could not be saved.");
      showToast(saved ? "Removed from your saved library." : "Saved to your Continuum library.");
      onSavedChange?.();
    } catch (cause) { showToast(cause instanceof Error ? cause.message : "The entity could not be saved."); }
    finally { setBusy(""); }
  }

  const selectedTitle = detail?.entity?.title ?? detail?.work?.title;
  const cacheAge = relativeAge(listCache.cachedAt);
  const listCount = kind === "works" ? works.length : results.length;

  return (
    <div className="scholarly-search">
      <Card className="scholarly-toolbar">
        <nav aria-label="Scholarly entity types" role="tablist" className="section-tabs">
          {scholarlyKinds.map((entry) => {
            const Icon = entry.icon;
            const active = kind === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? "active" : ""}
                onClick={() => {
                  setKind(entry.id);
                  setResults([]);
                  setWorks([]);
                  setTotal(0);
                  setNextCursor(undefined);
                  setSelected(undefined);
                  setDetail(undefined);
                  setDetailStatus("idle");
                  setListStatus("idle");
                  setListError(undefined);
                }}
              >
                <Icon size={15} aria-hidden="true" />
                {entry.label}
              </button>
            );
          })}
        </nav>
        <form onSubmit={(event) => void runSearch(event)}>
          <label><Search size={17} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={500} placeholder={`Search ${kind}`} aria-label={`Search ${kind}`} /></label>
          <Button type="submit" className="button-primary" disabled={busy === "search"}>{busy === "search" ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}Search</Button>
          <Button type="button" className="button-secondary" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>Filters</Button>
        </form>
        {filtersOpen ? (
          <div className="scholarly-filters">
            <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="relevance">Relevance</option><option value="citations">Most cited</option><option value="newest">Newest</option></select></label>
            {kind === "works" ? <>
              <label>From year<input type="number" min={1800} max={currentYear} value={fromYear} onChange={(event) => setFromYear(event.target.value)} placeholder="1800" /></label>
              <label>To year<input type="number" min={1800} max={currentYear} value={toYear} onChange={(event) => setToYear(event.target.value)} placeholder={String(currentYear)} /></label>
              <label className="scholarly-filter-check"><input type="checkbox" checked={openAccess} onChange={(event) => setOpenAccess(event.target.checked)} />Open access only</label>
            </> : null}
          </div>
        ) : null}
        {mode === "collect" && projectTitle ? <p className="scholarly-destination">Saving into <strong>{projectTitle}</strong></p> : null}
      </Card>

      <div className="scholarly-layout">
        <Card className="scholarly-results">
          <header>
            <strong>{listStatus === "ready" && total ? `${total.toLocaleString()} results` : listStatus === "idle" ? "Start a search" : "Search results"}</strong>
            {listStatus === "ready" && listCache.cache && listCache.cache !== "miss" && cacheAge ? <span className="cache-chip" title="Served from Continuum's scholarly cache">cached · updated {cacheAge}</span> : null}
            {nextCursor && listStatus === "ready" ? <Button className="button-secondary compact-button" disabled={Boolean(busy)} onClick={() => void runSearch(undefined, nextCursor)}>{busy === "more" ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : null}Load more</Button> : null}
          </header>
          <DataRegion
            status={listStatus}
            idle={<div className="scholarly-idle">
              <EmptyState icon={<Search size={20} />} title="Search the public scholarly graph" body={mode === "collect" ? "Find work to file into this project — by topic, author, institution, source, or field." : "Find works, authors, institutions, sources, and topics, then follow citations between them."} />
              {suggestions?.length ? <div className="scholarly-suggestions">
                <span>From your workspace</span>
                {suggestions.slice(0, 5).map((suggestion) => (
                  <button type="button" key={suggestion} onClick={() => { setQuery(suggestion); void runSearch(undefined, undefined, suggestion); }}>
                    <Search size={12} aria-hidden="true" />{suggestion}
                  </button>
                ))}
              </div> : null}
            </div>}
            loading={<LoadingState rows={4} label="Searching OpenAlex" />}
            error={<ErrorState title="We couldn't complete that search" body={listError?.message} detail={listError?.detail} action={<Button className="button-secondary compact-button" onClick={() => void runSearch()}>Try again</Button>} />}
            empty={<EmptyState title={`No ${kind} match “${lastSearch.current?.query ?? query}”`} body="Try a broader phrase, a different entity type, or clear the filters." action={fromYear || toYear || openAccess ? <Button className="button-secondary compact-button" onClick={() => { setFromYear(""); setToYear(""); setOpenAccess(false); }}>Clear filters</Button> : undefined} />}
          >
            {kind === "works"
              ? works.map((work) => (
                <WorkCard
                  key={work.providerId}
                  work={work}
                  onOpen={() => void loadDetail({ kind: "works", id: work.providerId })}
                  saved={isSaved("works", work.providerId)}
                  onToggleSave={() => void toggleSave("works", work.providerId, work.title, work)}
                  action={mode === "collect" && onCollect ? <Button className="button-secondary compact-button" onClick={() => void onCollect(work)}>Save to {projectTitle ? "project" : "project"}</Button> : undefined}
                />
              ))
              : results.map((entity) => (
                <div className={selected?.id === entity.id ? "scholarly-card active" : "scholarly-card"} key={entity.id}>
                  <button className="scholarly-card-main" onClick={() => void loadDetail({ kind, id: entity.id })}>
                    <div>
                      <Badge tone="neutral">{entity.kind.slice(0, -1)}</Badge>
                      <strong>{entity.title}</strong>
                      <p>{entity.description ?? entity.countryCode ?? "OpenAlex entity"}</p>
                      <small>{entity.worksCount?.toLocaleString() ?? 0} works · {entity.citedByCount?.toLocaleString() ?? 0} citations</small>
                    </div>
                    <ChevronRight size={17} aria-hidden="true" />
                  </button>
                  <div className="scholarly-card-actions">
                    <button type="button" className={isSaved(entity.kind, entity.id) ? "scholarly-bookmark saved" : "scholarly-bookmark"} aria-pressed={isSaved(entity.kind, entity.id)} aria-label={isSaved(entity.kind, entity.id) ? `Remove ${entity.title} from saved` : `Save ${entity.title}`} onClick={() => void toggleSave(entity.kind, entity.id, entity.title, entity)}><BookmarkCheck size={15} /></button>
                  </div>
                </div>
              ))}
          </DataRegion>
        </Card>

        <Card className="scholarly-detail">
          <DataRegion
            status={detailStatus}
            idle={<EmptyState icon={<Network size={20} />} title="Nothing selected" body="Open a result to inspect its identifiers, metrics, works, and citation relationships." />}
            loading={<LoadingState rows={5} label="Loading entity" />}
            error={<ErrorState title="We couldn't open that entity" body={detailError?.message} detail={detailError?.detail} action={selected ? <Button className="button-secondary compact-button" onClick={() => void loadDetail(selected)}>Try again</Button> : undefined} />}
          >
            {selectedTitle ? <>
              <header>
                <div><Badge tone="blue">{selected?.kind.slice(0, -1)}</Badge><h2>{selectedTitle}</h2></div>
                <Button
                  className={selected && isSaved(selected.kind, selected.id) ? "button-secondary" : "button-primary"}
                  disabled={busy.startsWith("save")}
                  onClick={() => selected ? void toggleSave(selected.kind, selected.id, selectedTitle, detail?.entity ?? detail?.work) : undefined}
                >
                  {busy.startsWith("save") ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <BookmarkCheck size={15} aria-hidden="true" />}
                  {selected && isSaved(selected.kind, selected.id) ? "Saved" : "Save"}
                </Button>
              </header>
              {detail?.work ? <>
                <p>{detail.work.authors.join(", ")}</p>
                <div className="scholarly-facts"><span>{detail.work.year ?? "Year unavailable"}</span><span>{detail.work.citedByCount?.toLocaleString() ?? 0} citations</span><span>{detail.work.openAccess ? "Open access" : "Access varies"}</span></div>
                {detail.work.abstract ? <section><h3>Abstract</h3><p>{detail.work.abstract}</p></section> : null}
                <div className="connection-actions">
                  {detail.work.landingPageUrl ? <a className="button button-secondary" href={detail.work.landingPageUrl} target="_blank" rel="noreferrer">Landing page<ExternalLink size={13} aria-hidden="true" /></a> : null}
                  {detail.work.fullTextUrl ? <a className="button button-secondary" href={detail.work.fullTextUrl} target="_blank" rel="noreferrer">Open full text<ArrowUpRight size={13} aria-hidden="true" /></a> : null}
                  {mode === "collect" && onCollect && detail.work ? <Button className="button-primary" onClick={() => void onCollect(detail.work!)}>Save to project</Button> : null}
                </div>
              </> : null}
              {detail?.entity && selected?.kind !== "works" ? <>
                <p>{detail.entity.description}</p>
                <dl>{Object.entries(detail.entity.identifiers).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                <div className="scholarly-facts"><span>{detail.entity.worksCount?.toLocaleString() ?? 0} works</span><span>{detail.entity.citedByCount?.toLocaleString() ?? 0} citations</span>{detail.entity.countryCode ? <span>{detail.entity.countryCode}</span> : null}</div>
              </> : null}
              {detail?.zoteroMatches?.length ? <div className="research-callout"><Library size={16} aria-hidden="true" /><span>In your Zotero — {detail.zoteroMatches.length} matching citation{detail.zoteroMatches.length === 1 ? "" : "s"} found by DOI.</span></div> : null}
              {selected?.kind !== "works" && detail?.relatedWorks?.length ? <section><h3>Highly cited works</h3>{detail.relatedWorks.map((work) => <WorkCard key={work.providerId} work={work} onOpen={() => void loadDetail({ kind: "works", id: work.providerId })} saved={isSaved("works", work.providerId)} onToggleSave={() => void toggleSave("works", work.providerId, work.title, work)} />)}</section> : null}
              {selected?.kind === "works" ? <section className="citation-graph">
                <div className="section-heading"><div><Network size={17} aria-hidden="true" /><h3>Citation graph</h3></div></div>
                <nav role="tablist" aria-label="Citation graph direction" className="segmented-navigation">{(["references", "cited_by", "related"] as const).map((direction) => <button type="button" role="tab" aria-selected={graphDirection === direction} className={graphDirection === direction ? "active" : ""} key={direction} onClick={() => setGraphDirection(direction)}>{direction.replaceAll("_", " ")}</button>)}</nav>
                <DataRegion
                  status={graphStatus}
                  idle={null}
                  loading={<LoadingState rows={3} label="Loading citation links" />}
                  error={<ErrorState title="Citation links are unavailable" body="The scholarly graph could not be reached for this work. The entity itself is unaffected." action={<Button className="button-secondary compact-button" onClick={() => void loadGraph()}>Try again</Button>} />}
                  empty={<EmptyState title={`No ${graphDirection.replaceAll("_", " ")} returned`} body="OpenAlex has no records in this direction for this work." />}
                >
                  {graph.map((work) => <WorkCard key={work.providerId} work={work} onOpen={() => void loadDetail({ kind: "works", id: work.providerId })} saved={isSaved("works", work.providerId)} onToggleSave={() => void toggleSave("works", work.providerId, work.title, work)} />)}
                  {graphCursor ? <Button className="button-secondary compact-button" onClick={() => void loadGraph(graphCursor)}>Load more graph nodes</Button> : null}
                </DataRegion>
              </section> : null}
              <a className="scholarly-external" href={`https://openalex.org/${selected?.id}`} target="_blank" rel="noreferrer">View on OpenAlex <ExternalLink size={12} aria-hidden="true" /></a>
            </> : null}
          </DataRegion>
        </Card>
      </div>
      {listStatus === "ready" && listCount === 0 ? null : null}
      {projectId ? <span className="sr-only">Collecting into project {projectId}</span> : null}
    </div>
  );
}
