"use client";

import { ArrowLeft, ExternalLink, Library, Network, Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Badge,
  Banner,
  Button,
  Card,
  DataRegion,
  EmptyState,
  ErrorState,
  Input,
  LoadingButton,
  LoadingState,
  Menu,
  Select,
  StatusChip,
  Tabs,
  type RegionStatus,
} from "@/components/ui";
import { formatCitation, type CitationFormat } from "@/components/library/citation";
import { ResultRow } from "@/components/library/result-row";
import {
  failureFromNetwork,
  failureFromResponse,
  type ScholarlyFailure,
} from "@/components/library/scholarly-errors";
import { normalizeDoi, unfiledDestination, type Destination } from "@/components/library/types";
import { VirtualList } from "@/components/library/virtual-list";
import type { NormalizedScholarlyWork } from "@/lib/scholarly";
// The search surface is shared with Research, which never imports the Library
// page — so it carries the Phase 6 stylesheet itself rather than rendering
// unstyled outside `/library`. Next deduplicates the import.
import "@/components/library/library.css";

export type ScholarlyKind = "works" | "authors" | "institutions" | "sources" | "topics";
export type SearchBy = "auto" | "title" | "author" | "doi";
export type ProviderChoice = "openalex" | "all";

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
type ProviderStatus = { provider: string; status: string; message?: string };
type ResultPayload = ApiError & {
  results?: ScholarlyEntity[] | NormalizedScholarlyWork[];
  works?: NormalizedScholarlyWork[];
  providers?: ProviderStatus[];
  total?: number;
  nextCursor?: string;
  cache?: string;
  cachedAt?: string;
  keyless?: boolean;
  zoteroMatches?: ZoteroMatch[];
};
/** One row of the server-side DOI join against `zotero_items`. */
type ZoteroMatch = { doi?: unknown; title?: unknown };
type DetailPayload = ApiError & {
  entity?: ScholarlyEntity;
  work?: NormalizedScholarlyWork;
  relatedWorks?: NormalizedScholarlyWork[];
  totalWorks?: number;
  nextCursor?: string;
  zoteroMatches?: ZoteroMatch[];
  cache?: string;
  cachedAt?: string;
};

export const scholarlyKinds: Array<{ id: ScholarlyKind; label: string }> = [
  { id: "works", label: "Works" },
  { id: "authors", label: "Authors" },
  { id: "institutions", label: "Institutions" },
  { id: "sources", label: "Sources" },
  { id: "topics", label: "Topics" },
];

const currentYear = new Date().getFullYear();

/**
 * Results are cached per query+cursor for the session (§13.2 Performance), so
 * paging back to a previous entity type or re-running the same search does not
 * spend another unit of the OpenAlex rate limit the error banner exists to
 * explain.
 */
const sessionCache = new Map<string, ResultPayload>();

/**
 * "In your Zotero" (§13.2, AC-Z3, finding S6).
 *
 * Every response that carries works also carries the exact DOI matches for
 * *those* works, joined server-side against `zotero_items`. This replaced a
 * session-wide client index that crawled up to 500 Zotero items on the first
 * Discover visit: expensive, and only ever approximate — past the crawl limit,
 * "no chip" meant "not indexed", not "not in your library". Matches accumulate
 * across pages because paging appends works rather than replacing them.
 */
function mergeZoteroMatches(current: Map<string, string>, incoming: ZoteroMatch[] | undefined) {
  if (!incoming?.length) return current;
  const next = new Map(current);
  for (const match of incoming) {
    const doi = normalizeDoi(typeof match.doi === "string" ? match.doi : undefined);
    if (doi) next.set(doi, typeof match.title === "string" ? match.title : "In your Zotero");
  }
  return next.size === current.size ? current : next;
}

function relativeAge(iso?: string) {
  if (!iso) return undefined;
  const elapsed = Date.now() - Date.parse(iso);
  if (!Number.isFinite(elapsed) || elapsed < 0) return undefined;
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The single scholarly-search surface (§13.2, AC-LB1).
 *
 * `mode="explore"` is the Library's Discover tab; `mode="collect"` is the
 * project-scoped acquisition surface Research still renders. Both get the same
 * search bar, the same one-line filter set, the same result row, the same
 * detail pane and the same error handling, so the two can never drift apart in
 * behaviour or reliability again.
 *
 * What changed in Phase 6: the six-control filter wall collapsed into one
 * collapsible line; results became a two-pane layout with a virtualised list;
 * every row reaches save, cite, open and ask; failures are classified into the
 * three recoveries a person can actually perform; and a DOI already in the
 * user's Zotero is finally advertised on the row.
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
  destinations,
  target,
  onChangeTarget,
  onSaveWork,
  onAsk,
  seed,
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
  /** Where a save can land: a project, or the unfiled library. */
  destinations?: Destination[];
  /** The destination the user arrived with, via `?target=`. */
  target?: Destination;
  onChangeTarget?: (destination?: Destination) => void;
  onSaveWork?: (work: NormalizedScholarlyWork, destination: Destination) => Promise<void> | void;
  onAsk?: (work: NormalizedScholarlyWork) => void;
  /**
   * A search handed in from elsewhere — currently the Zotero tab's "Find in
   * OpenAlex". `token` changes per request so the same DOI can be sent twice.
   */
  seed?: { query: string; searchBy?: SearchBy; token: number };
}) {
  const [kind, setKind] = useState<ScholarlyKind>("works");
  const [query, setQuery] = useState("");
  const [searchBy, setSearchBy] = useState<SearchBy>("auto");
  const [provider, setProvider] = useState<ProviderChoice>("openalex");
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [openAccess, setOpenAccess] = useState(false);
  const [sort, setSort] = useState<"relevance" | "citations" | "newest">("relevance");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [listStatus, setListStatus] = useState<RegionStatus>("idle");
  const [listFailure, setListFailure] = useState<ScholarlyFailure>();
  const [results, setResults] = useState<ScholarlyEntity[]>([]);
  const [works, setWorks] = useState<NormalizedScholarlyWork[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string>();
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [listCache, setListCache] = useState<{ cache?: string; cachedAt?: string }>({});
  const [zoteroByDoi, setZoteroByDoi] = useState<Map<string, string>>(() => new Map());

  const [detailStatus, setDetailStatus] = useState<RegionStatus>("idle");
  const [detailFailure, setDetailFailure] = useState<ScholarlyFailure>();
  const [detail, setDetail] = useState<DetailPayload>();
  const [selected, setSelected] = useState<{ kind: ScholarlyKind; id: string }>();

  const [graphDirection, setGraphDirection] = useState<"references" | "cited_by" | "related">("references");
  const [graph, setGraph] = useState<NormalizedScholarlyWork[]>([]);
  const [graphCursor, setGraphCursor] = useState<string>();
  const [graphStatus, setGraphStatus] = useState<RegionStatus>("idle");
  const [busy, setBusy] = useState("");
  const [wide, setWide] = useState(true);
  const lastSearch = useRef<{ kind: ScholarlyKind; query: string } | undefined>(undefined);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);

  // ≥1000px is two-pane; below it, selecting a result becomes a full-page
  // detail (§13.2 Responsive) rather than a 320px column nobody can read.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(min-width: 1000px)");
    const apply = () => setWide(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const savedIds = useMemo(() => new Set((savedEntities ?? []).map((entry) => `${entry.entity_type}:${entry.external_id}`)), [savedEntities]);
  const isSaved = useCallback((entityKind: ScholarlyKind, id: string) => savedIds.has(`${entityKind}:${id}`), [savedIds]);

  /**
   * In collect mode the destination is the project the caller is already
   * standing in, so the picker still exists and still names where the work is
   * going — it simply has one entry.
   */
  const saveTargets = useMemo<Destination[]>(() => {
    if (mode === "collect") return projectId ? [{ id: projectId, label: projectTitle ?? "This project", projectId }] : [];
    const all = destinations?.length ? destinations : [unfiledDestination];
    // A `?target=` destination leads the picker, so the banner's promise and
    // the primary Save button cannot disagree about where a work lands.
    return target ? [target, ...all.filter((entry) => entry.id !== target.id)] : all;
  }, [destinations, mode, projectId, projectTitle, target]);

  const pushDeepLink = useCallback((entry?: { kind: ScholarlyKind; id: string }) => {
    if (!deepLinkBase || typeof window === "undefined") return;
    const next = entry ? `${deepLinkBase}/${entry.kind}/${entry.id}` : deepLinkBase;
    if (window.location.pathname !== next) window.history.pushState({ scholarly: entry ?? null }, "", next);
  }, [deepLinkBase]);

  const loadDetail = useCallback(async (entry: { kind: ScholarlyKind; id: string }, options: { pushUrl?: boolean } = {}) => {
    setDetailStatus("loading");
    setDetailFailure(undefined);
    setSelected(entry);
    setGraph([]);
    setGraphCursor(undefined);
    setGraphStatus("idle");
    try {
      const parameters = new URLSearchParams({ action: "detail", kind: entry.kind, id: entry.id });
      const response = await fetch(`/api/openalex?${parameters}`, { cache: "no-store" });
      const payload = await response.json() as DetailPayload;
      if (!response.ok) throw failureFromResponse(response.status, payload);
      setDetail(payload);
      setZoteroByDoi((current) => mergeZoteroMatches(current, payload.zoteroMatches));
      setDetailStatus("ready");
      if (options.pushUrl !== false) pushDeepLink(entry);
    } catch (cause) {
      // The header reads from `detail`, so clearing it here stops the previously
      // selected entity from sitting above an error about a different one.
      setDetail(undefined);
      setDetailStatus("error");
      setDetailFailure(cause && typeof cause === "object" && "title" in cause ? cause as ScholarlyFailure : failureFromNetwork(cause));
      if (options.pushUrl !== false) pushDeepLink(entry);
    }
  }, [pushDeepLink]);

  // Focus moves to the detail heading on selection (§13.2 Accessibility), so a
  // keyboard user is not left in the list wondering what changed.
  useEffect(() => {
    if (detailStatus === "ready") detailHeadingRef.current?.focus();
  }, [detailStatus, selected?.id]);

  // Deep links resolve on mount and on Back/Forward, so browser history moves
  // between entities instead of dropping the user out of the section. `/openalex`
  // links predate `/library` and still resolve.
  useEffect(() => {
    if (!deepLinkBase) return;
    const pattern = /^\/(?:library|openalex)\/(works|authors|institutions|sources|topics)\/([WASIT]\d+)$/i;
    const resolve = () => {
      const match = window.location.pathname.match(pattern);
      if (match) {
        const entry = { kind: match[1]!.toLowerCase() as ScholarlyKind, id: match[2]!.toUpperCase() };
        setKind(entry.kind);
        void loadDetail(entry, { pushUrl: false });
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

  /**
   * Which endpoint answers a works search:
   *
   * `/api/openalex` owns the five entity types, cursor paging and the
   * scholarly cache. `/api/research/discovery` owns the precise search modes
   * (exact title, author, DOI) and the Crossref merge. Works go to whichever is
   * actually needed, so nothing is lost by having one search surface.
   */
  const runSearch = useCallback(async (event?: FormEvent, cursor?: string, override?: { query?: string; searchBy?: SearchBy }) => {
    event?.preventDefault();
    const trimmed = (override?.query ?? query).trim();
    // A seeded search carries its own mode: the state setter that would have
    // supplied it has not been applied yet when this runs in the same tick.
    const activeSearchBy = override?.searchBy ?? searchBy;
    if (trimmed.length < 2) {
      setListStatus("error");
      setListFailure({ title: "That search could not run", body: "Enter at least two search characters.", retryable: false });
      return;
    }
    // Paging keeps the results that are already on screen (§13.2 Loading);
    // only a first page has nothing to preserve and earns the skeletons.
    if (!cursor) setListStatus("loading");
    setListFailure(undefined);
    setBusy(cursor ? "more" : "search");

    const parameters = new URLSearchParams();
    const viaDiscovery = kind === "works" && (provider === "all" || activeSearchBy !== "auto");
    let url: string;
    if (viaDiscovery) {
      parameters.set("q", trimmed);
      parameters.set("mode", activeSearchBy === "auto" ? "keywords" : activeSearchBy);
      parameters.set("provider", provider === "all" ? "all" : "openalex");
      parameters.set("sort", sort);
      if (fromYear) parameters.set("fromYear", fromYear);
      if (toYear) parameters.set("toYear", toYear);
      if (openAccess) parameters.set("openAccess", "true");
      if (cursor) parameters.set("cursor", cursor);
      url = `/api/research/discovery?${parameters}`;
    } else {
      parameters.set("action", "search");
      parameters.set("kind", kind);
      parameters.set("q", trimmed);
      if (cursor) parameters.set("cursor", cursor);
      if (sort !== "relevance") parameters.set("sort", sort);
      if (kind === "works") {
        if (fromYear) parameters.set("fromYear", fromYear);
        if (toYear) parameters.set("toYear", toYear);
        if (openAccess) parameters.set("openAccess", "true");
      }
      url = `/api/openalex?${parameters}`;
    }

    try {
      let payload = sessionCache.get(url);
      if (!payload) {
        const response = await fetch(url, { cache: "no-store" });
        payload = await response.json() as ResultPayload;
        if (!response.ok) throw failureFromResponse(response.status, payload);
        if (sessionCache.size > 60) sessionCache.delete(sessionCache.keys().next().value as string);
        sessionCache.set(url, payload);
      }
      const incomingWorks = viaDiscovery
        ? (payload.results as NormalizedScholarlyWork[] | undefined) ?? []
        : payload.works ?? [];
      const incomingEntities = viaDiscovery ? [] : (payload.results as ScholarlyEntity[] | undefined) ?? [];
      const nextWorks = cursor ? [...works, ...incomingWorks] : incomingWorks;
      const nextResults = cursor ? [...results, ...incomingEntities] : incomingEntities;
      setWorks(nextWorks);
      setResults(nextResults);
      setTotal(payload.total ?? (kind === "works" ? nextWorks.length : nextResults.length));
      setNextCursor(payload.nextCursor);
      setProviderStatuses(payload.providers ?? []);
      setListCache({ cache: payload.cache, cachedAt: payload.cachedAt });
      setZoteroByDoi((current) => mergeZoteroMatches(current, payload.zoteroMatches));
      lastSearch.current = { kind, query: trimmed };
      setListStatus((kind === "works" ? nextWorks.length : nextResults.length) ? "ready" : "empty");
      if (!cursor) {
        setSelected(undefined);
        setDetail(undefined);
        setDetailStatus("idle");
        pushDeepLink(undefined);
      }
    } catch (cause) {
      // A failed *next* page must not delete the pages that already loaded, so
      // the failure is reported beside the list instead of replacing it. Either
      // way the page never blanks (AC-LB3).
      if (!cursor) setListStatus("error");
      setListFailure(cause && typeof cause === "object" && "title" in cause ? cause as ScholarlyFailure : failureFromNetwork(cause));
    } finally { setBusy(""); }
  }, [fromYear, kind, openAccess, provider, pushDeepLink, query, results, searchBy, sort, toYear, works]);

  // A DOI handed over from the Zotero tab runs immediately, so "Find in
  // OpenAlex" completes the crossing instead of dropping the user on an empty
  // Discover tab with the DOI in their clipboard.
  useEffect(() => {
    if (!seed) return;
    setKind("works");
    setQuery(seed.query);
    if (seed.searchBy) setSearchBy(seed.searchBy);
    void runSearch(undefined, undefined, { query: seed.query, searchBy: seed.searchBy });
    // Re-runs only when a new seed is handed in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.token]);

  const loadGraph = useCallback(async (cursor?: string) => {
    if (!selected || selected.kind !== "works") return;
    setGraphStatus("loading");
    try {
      const parameters = new URLSearchParams({ action: "graph", kind: "works", id: selected.id, direction: graphDirection });
      if (cursor) parameters.set("cursor", cursor);
      const response = await fetch(`/api/openalex?${parameters}`, { cache: "no-store" });
      const payload = await response.json() as ResultPayload;
      if (!response.ok) throw failureFromResponse(response.status, payload);
      const nextGraph = cursor ? [...graph, ...(payload.works ?? [])] : payload.works ?? [];
      setGraph(nextGraph);
      setZoteroByDoi((current) => mergeZoteroMatches(current, payload.zoteroMatches));
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

  async function saveWork(work: NormalizedScholarlyWork, destination: Destination) {
    setBusy(`save:${work.providerId}`);
    try {
      if (mode === "collect" && onCollect) await onCollect(work);
      else if (onSaveWork) await onSaveWork(work, destination);
      else await toggleSave("works", work.providerId, work.title, work);
    } finally { setBusy(""); }
  }

  async function copyCitation(work: NormalizedScholarlyWork, format: CitationFormat) {
    const text = formatCitation(work, format);
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Citation copied as ${format === "plain" ? "plain text" : format.toUpperCase()}.`);
    } catch {
      showToast("Your browser blocked the clipboard. Open the work to copy its details.");
    }
  }

  function findRelated(work: NormalizedScholarlyWork) {
    setKind("works");
    void loadDetail({ kind: "works", id: work.providerId });
    setGraphDirection("related");
  }

  const zoteroFor = useCallback((work: NormalizedScholarlyWork) => {
    const doi = normalizeDoi(work.doi);
    return doi ? zoteroByDoi.get(doi) : undefined;
  }, [zoteroByDoi]);

  const selectedTitle = detail?.entity?.title ?? detail?.work?.title;
  const cacheAge = relativeAge(listCache.cachedAt);
  const listCount = kind === "works" ? works.length : results.length;
  const crossrefFailed = providerStatuses.find((entry) => entry.provider === "crossref" && entry.status !== "live");
  const filtersActive = searchBy !== "auto" || provider !== "openalex" || sort !== "relevance" || Boolean(fromYear) || Boolean(toYear) || openAccess;
  const showDetailFullPage = !wide && Boolean(selected);

  function resetSearchState(nextKind: ScholarlyKind) {
    setKind(nextKind);
    setResults([]);
    setWorks([]);
    setTotal(0);
    setNextCursor(undefined);
    setSelected(undefined);
    setDetail(undefined);
    setDetailStatus("idle");
    setListStatus("idle");
    setListFailure(undefined);
    setProviderStatuses([]);
  }

  const errorState = (failure: ScholarlyFailure | undefined, retry: () => void) => (
    <ErrorState
      title={failure?.title ?? "OpenAlex is unavailable"}
      body={failure?.body ?? "OpenAlex is unavailable. Your saved sources still work."}
      detail={failure?.detail}
      action={
        <>
          {failure?.retryable !== false ? <Button variant="secondary" size="sm" onClick={retry}>Retry</Button> : null}
          {failure?.hint ? <span className="scholarly-hint">{failure.hint}</span> : null}
        </>
      }
    />
  );

  return (
    <div className="scholarly-search">
      {target ? (
        <div className="scholarly-target" role="status">
          <span>Saving to: <strong>{target.label}</strong></span>
          {onChangeTarget ? (
            <>
              <span aria-hidden="true">—</span>
              <Menu
                label="Change where saves land"
                align="start"
                items={[
                  ...saveTargets.map((entry) => ({ label: entry.goalTitle ? `${entry.label} — ${entry.goalTitle}` : entry.label, onSelect: () => onChangeTarget(entry) })),
                  { label: "No fixed destination", onSelect: () => onChangeTarget(undefined) },
                ]}
                trigger={<Button variant="quiet" size="sm">change</Button>}
              />
            </>
          ) : null}
        </div>
      ) : null}

      <div className="scholarly-toolbar">
        <form onSubmit={(event) => void runSearch(event)} className="scholarly-bar">
          <label className="scholarly-query">
            <Search size={16} aria-hidden="true" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={500}
              placeholder="Search 250M+ works from OpenAlex"
              aria-label={`Search ${kind}`}
            />
          </label>
          <Select value={kind} onChange={(event) => resetSearchState(event.target.value as ScholarlyKind)} aria-label="What to search" className="scholarly-kind">
            {scholarlyKinds.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </Select>
          <LoadingButton type="submit" variant="primary" loading={busy === "search"} loadingLabel="Searching…">Search</LoadingButton>
          <Button type="button" variant="secondary" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>
            <SlidersHorizontal size={14} aria-hidden="true" />
            Filters
            {filtersActive ? <span className="library-filter-dot" aria-label="filters applied" /> : null}
          </Button>
        </form>

        {/* One line, not six controls always on screen (§13.2). Defaults stay
            hidden until the user asks for them. */}
        {filtersOpen ? (
          <div className="scholarly-filter-line" role="group" aria-label="Search filters">
            <label>Search by
              <Select value={searchBy} onChange={(event) => setSearchBy(event.target.value as SearchBy)} disabled={kind !== "works"}>
                <option value="auto">Auto</option>
                <option value="title">Title</option>
                <option value="author">Author</option>
                <option value="doi">DOI</option>
              </Select>
            </label>
            <label>Source
              <Select value={provider} onChange={(event) => setProvider(event.target.value as ProviderChoice)} disabled={kind !== "works"}>
                <option value="openalex">OpenAlex</option>
                <option value="all">OpenAlex + Crossref</option>
              </Select>
            </label>
            <label>Sort
              <Select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
                <option value="relevance">Relevance</option>
                <option value="citations">Most cited</option>
                <option value="newest">Newest</option>
              </Select>
            </label>
            <label>Years
              <span className="scholarly-years">
                <Input type="number" min={1800} max={currentYear} value={fromYear} onChange={(event) => setFromYear(event.target.value)} placeholder="1800" aria-label="From year" />
                <Input type="number" min={1800} max={currentYear} value={toYear} onChange={(event) => setToYear(event.target.value)} placeholder={String(currentYear)} aria-label="To year" />
              </span>
            </label>
            <label className="library-filter-check">
              <input type="checkbox" checked={openAccess} onChange={(event) => setOpenAccess(event.target.checked)} />
              Open access only
            </label>
          </div>
        ) : null}

        {crossrefFailed ? (
          <StatusChip tone="warning" label="Crossref unavailable — showing OpenAlex only" className="scholarly-degraded" />
        ) : null}
        {/* The old client-side index could only see its first 500 items and had
            to admit it here. The match is now an exact join over the whole
            library, so there is nothing left to qualify. */}
      </div>

      <div className={showDetailFullPage ? "scholarly-layout scholarly-layout-detail" : "scholarly-layout"}>
        {showDetailFullPage ? null : (
          <Card className="scholarly-results">
            <header>
              <strong aria-live="polite">
                {listStatus === "ready"
                  ? `${listCount.toLocaleString()} of ${(total || listCount).toLocaleString()}`
                  : listStatus === "idle" ? "Start a search" : "Search results"}
              </strong>
              {listStatus === "ready" && listCache.cache && listCache.cache !== "miss" && cacheAge ? (
                <span className="cache-chip" title="Served from Continuum's scholarly cache">cached · updated {cacheAge}</span>
              ) : null}
            </header>
            <DataRegion
              status={listStatus}
              idle={
                <div className="scholarly-idle">
                  <EmptyState
                    icon={<Search size={20} />}
                    title="Search 250M+ works from OpenAlex"
                    body={mode === "collect"
                      ? "Find work to file into this project — by topic, author, institution, source, or field."
                      : "Find works, authors, institutions, sources, and topics, then follow citations between them."}
                  />
                  {suggestions?.length ? (
                    <div className="scholarly-suggestions">
                      <span>From your workspace</span>
                      {suggestions.slice(0, 5).map((suggestion) => (
                        <button type="button" key={suggestion} onClick={() => { setQuery(suggestion); void runSearch(undefined, undefined, { query: suggestion }); }}>
                          <Search size={12} aria-hidden="true" />{suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              }
              loading={<LoadingState rows={6} label="Searching OpenAlex" />}
              error={errorState(listFailure, () => void runSearch())}
              empty={
                <EmptyState
                  title={`No results for “${lastSearch.current?.query ?? query}”`}
                  body="Three things usually fix this: broaden the phrase, remove a filter, or paste the DOI instead."
                  action={filtersActive ? <Button variant="secondary" size="sm" onClick={() => { setFromYear(""); setToYear(""); setOpenAccess(false); setSearchBy("auto"); setProvider("openalex"); setSort("relevance"); }}>Clear filters</Button> : undefined}
                />
              }
            >
              {kind === "works" ? (
                <VirtualList
                  items={works}
                  rowHeight={72}
                  label="Search results"
                  className="scholarly-result-viewport"
                  renderItem={(work, position) => (
                    <ResultRow
                      key={`${work.sourceProvider}:${work.providerId}`}
                      work={work}
                      position={position}
                      selected={selected?.id === work.providerId}
                      saved={isSaved("works", work.providerId)}
                      zoteroMatch={zoteroFor(work)}
                      destinations={saveTargets}
                      busy={busy === `save:${work.providerId}`}
                      actions={{
                        onOpen: () => void loadDetail({ kind: "works", id: work.providerId }),
                        onSave: (destination) => void saveWork(work, destination),
                        onCopyCitation: (format) => void copyCitation(work, format),
                        onFindRelated: () => findRelated(work),
                        onAsk: () => onAsk?.(work),
                      }}
                    />
                  )}
                />
              ) : (
                <ul className="list">
                  {results.map((entity) => (
                    <li className={selected?.id === entity.id ? "row row-comfortable row-interactive row-selected" : "row row-comfortable row-interactive"} key={entity.id}>
                      <button type="button" className="row-hit" aria-pressed={selected?.id === entity.id} onClick={() => void loadDetail({ kind, id: entity.id })}>
                        <span className="row-copy">
                          <span className="row-title">{entity.title}</span>
                          <span className="row-meta">{entity.description ?? entity.countryCode ?? "OpenAlex entity"} · {entity.worksCount?.toLocaleString() ?? 0} works</span>
                        </span>
                      </button>
                      <span className="row-actions">
                        <Button
                          variant={isSaved(entity.kind, entity.id) ? "secondary" : "quiet"}
                          size="sm"
                          onClick={() => void toggleSave(entity.kind, entity.id, entity.title, entity)}
                        >
                          {isSaved(entity.kind, entity.id) ? "Saved" : "Save"}
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {listStatus === "ready" && listFailure ? (
                <Banner tone="warning" title={listFailure.title} action={<Button variant="secondary" size="sm" onClick={() => void runSearch(undefined, nextCursor)}>Retry</Button>}>
                  {listFailure.body}
                </Banner>
              ) : null}
              {nextCursor ? (
                <LoadingButton variant="secondary" size="sm" className="scholarly-more" loading={busy === "more"} loadingLabel="Loading…" onClick={() => void runSearch(undefined, nextCursor)}>Load more</LoadingButton>
              ) : null}
            </DataRegion>
          </Card>
        )}

        <Card className="scholarly-detail">
          {showDetailFullPage ? (
            <Button variant="quiet" size="sm" className="scholarly-back" onClick={() => { window.history.back(); setSelected(undefined); setDetail(undefined); setDetailStatus("idle"); }}>
              <ArrowLeft size={14} aria-hidden="true" />Back to results
            </Button>
          ) : null}
          <DataRegion
            status={detailStatus}
            idle={<EmptyState icon={<Network size={20} />} title="Nothing selected" body="Open a result to read its abstract, identifiers, and citation relationships." />}
            loading={<LoadingState rows={5} label="Loading entity" />}
            error={errorState(detailFailure, () => { if (selected) void loadDetail(selected); })}
          >
            {selectedTitle ? (
              <>
                <header>
                  <div>
                    <Badge tone="blue">{selected?.kind.slice(0, -1)}</Badge>
                    <h2 tabIndex={-1} ref={detailHeadingRef}>{selectedTitle}</h2>
                  </div>
                  {detail?.work ? (
                    <Button
                      variant={selected && isSaved(selected.kind, selected.id) ? "secondary" : "primary"}
                      size="sm"
                      disabled={busy.startsWith("save")}
                      onClick={() => { const first = saveTargets[0]; if (detail.work && first) void saveWork(detail.work, first); }}
                    >
                      Save to {saveTargets[0]?.label ?? "library"}
                    </Button>
                  ) : (
                    <Button
                      variant={selected && isSaved(selected.kind, selected.id) ? "secondary" : "primary"}
                      size="sm"
                      disabled={busy.startsWith("save")}
                      onClick={() => selected ? void toggleSave(selected.kind, selected.id, selectedTitle, detail?.entity) : undefined}
                    >
                      {selected && isSaved(selected.kind, selected.id) ? "Saved" : "Save"}
                    </Button>
                  )}
                </header>

                {detail?.work ? (
                  <>
                    <p>{detail.work.authors.join(", ")}</p>
                    <div className="scholarly-facts">
                      <span>{detail.work.year ?? "Year unavailable"}</span>
                      <span>{detail.work.citedByCount?.toLocaleString() ?? 0} citations</span>
                      <span>{detail.work.venue ?? "Venue unavailable"}</span>
                    </div>
                    <div className="scholarly-facts">
                      <StatusChip
                        tone={detail.work.fullTextUrl ? "success" : "neutral"}
                        label={detail.work.fullTextUrl ? "Open-access PDF available" : detail.work.landingPageUrl ? "Landing page only — no open file" : "Metadata only — no file located"}
                      />
                      {zoteroFor(detail.work) ? <StatusChip tone="info" icon={<Library size={12} />} label="In your Zotero" /> : null}
                    </div>
                    {detail.work.abstract ? <section><h3>Abstract</h3><p>{detail.work.abstract}</p></section> : null}
                    {detail.work.topics.length ? (
                      <section>
                        <h3>Topics</h3>
                        <div className="scholarly-topics">{detail.work.topics.slice(0, 8).map((topic) => <StatusChip key={topic} tone="neutral" label={topic} />)}</div>
                      </section>
                    ) : null}
                    <div className="connection-actions">
                      {detail.work.landingPageUrl ? <a className="button button-secondary button-sm" href={detail.work.landingPageUrl} target="_blank" rel="noreferrer">Landing page<ExternalLink size={13} aria-hidden="true" /></a> : null}
                      {detail.work.fullTextUrl ? <a className="button button-secondary button-sm" href={detail.work.fullTextUrl} target="_blank" rel="noreferrer">Open full text<ExternalLink size={13} aria-hidden="true" /></a> : null}
                      <Button variant="secondary" size="sm" onClick={() => detail.work && void copyCitation(detail.work, "bibtex")}>Copy BibTeX</Button>
                      {onAsk ? <Button variant="secondary" size="sm" onClick={() => detail.work && onAsk(detail.work)}>Ask about this</Button> : null}
                    </div>
                  </>
                ) : null}

                {detail?.entity && selected?.kind !== "works" ? (
                  <>
                    <p>{detail.entity.description}</p>
                    <dl>{Object.entries(detail.entity.identifiers).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                    <div className="scholarly-facts">
                      <span>{detail.entity.worksCount?.toLocaleString() ?? 0} works</span>
                      <span>{detail.entity.citedByCount?.toLocaleString() ?? 0} citations</span>
                      {detail.entity.countryCode ? <span>{detail.entity.countryCode}</span> : null}
                    </div>
                  </>
                ) : null}

                {detail?.zoteroMatches?.length ? (
                  <div className="scholarly-zotero-note">
                    <Library size={15} aria-hidden="true" />
                    <span>In your Zotero — {detail.zoteroMatches.length} matching item{detail.zoteroMatches.length === 1 ? "" : "s"} found by DOI.</span>
                  </div>
                ) : null}

                {selected?.kind !== "works" && detail?.relatedWorks?.length ? (
                  <section>
                    <h3>Highly cited works</h3>
                    <ul className="list">
                      {detail.relatedWorks.map((work, index) => (
                        <ResultRow
                          key={work.providerId}
                          work={work}
                          position={{ index, setSize: detail.relatedWorks?.length ?? 0 }}
                          selected={false}
                          saved={isSaved("works", work.providerId)}
                          zoteroMatch={zoteroFor(work)}
                          destinations={saveTargets}
                          actions={{
                            onOpen: () => void loadDetail({ kind: "works", id: work.providerId }),
                            onSave: (destination) => void saveWork(work, destination),
                            onCopyCitation: (format) => void copyCitation(work, format),
                            onFindRelated: () => findRelated(work),
                            onAsk: () => onAsk?.(work),
                          }}
                        />
                      ))}
                    </ul>
                  </section>
                ) : null}

                {selected?.kind === "works" ? (
                  <section className="citation-graph">
                    <h3>Citation graph</h3>
                    <Tabs
                      variant="segmented"
                      label="Citation graph direction"
                      value={graphDirection}
                      onChange={(next) => setGraphDirection(next)}
                      options={[
                        { value: "references" as const, label: "References" },
                        { value: "cited_by" as const, label: "Cited by" },
                        { value: "related" as const, label: "Related" },
                      ]}
                    />
                    <DataRegion
                      status={graphStatus}
                      idle={null}
                      loading={<LoadingState rows={3} label="Loading citation links" />}
                      error={<ErrorState title="Citation links are unavailable" body="The scholarly graph could not be reached for this work. The entity itself is unaffected." action={<Button variant="secondary" size="sm" onClick={() => void loadGraph()}>Retry</Button>} />}
                      empty={<EmptyState title={`No ${graphDirection.replaceAll("_", " ")} returned`} body="OpenAlex has no records in this direction for this work." />}
                    >
                      <ul className="list">
                        {graph.map((work, index) => (
                          <ResultRow
                            key={work.providerId}
                            work={work}
                            position={{ index, setSize: graph.length }}
                            selected={false}
                            saved={isSaved("works", work.providerId)}
                            zoteroMatch={zoteroFor(work)}
                            destinations={saveTargets}
                            actions={{
                              onOpen: () => void loadDetail({ kind: "works", id: work.providerId }),
                              onSave: (destination) => void saveWork(work, destination),
                              onCopyCitation: (format) => void copyCitation(work, format),
                              onFindRelated: () => findRelated(work),
                              onAsk: () => onAsk?.(work),
                            }}
                          />
                        ))}
                      </ul>
                      {graphCursor ? <Button variant="secondary" size="sm" onClick={() => void loadGraph(graphCursor)}>Load more</Button> : null}
                    </DataRegion>
                  </section>
                ) : null}

                <a className="scholarly-external" href={`https://openalex.org/${selected?.id}`} target="_blank" rel="noreferrer">View on OpenAlex <ExternalLink size={12} aria-hidden="true" /></a>
              </>
            ) : null}
          </DataRegion>
        </Card>
      </div>
      {projectId ? <span className="sr-only">Collecting into project {projectId}</span> : null}
    </div>
  );
}
