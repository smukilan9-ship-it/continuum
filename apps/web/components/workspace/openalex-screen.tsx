"use client";

import { ArrowUpRight, BookOpen, Building2, ChevronRight, CircleDot, ExternalLink, GraduationCap, Library, LoaderCircle, Network, Save, Search, UserRound } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import type { NormalizedScholarlyWork } from "@/lib/scholarly";
import { PageIntro } from "./page-intro";

type Kind = "works" | "authors" | "institutions" | "sources" | "topics";
type Entity = {
  id: string;
  kind: Kind;
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
type ResultPayload = { results?: Entity[]; works?: NormalizedScholarlyWork[]; total?: number; nextCursor?: string; error?: string; cache?: string };
type DetailPayload = { entity?: Entity; work?: NormalizedScholarlyWork; relatedWorks?: NormalizedScholarlyWork[]; totalWorks?: number; nextCursor?: string; zoteroMatches?: Array<Record<string, unknown>>; error?: string; cache?: string };

const kinds: Array<{ id: Kind; label: string; icon: typeof BookOpen }> = [
  { id: "works", label: "Works", icon: BookOpen },
  { id: "authors", label: "Authors", icon: UserRound },
  { id: "institutions", label: "Institutions", icon: Building2 },
  { id: "sources", label: "Sources", icon: Library },
  { id: "topics", label: "Topics", icon: CircleDot },
];

function WorkCard({ work, onOpen }: { work: NormalizedScholarlyWork; onOpen: () => void }) {
  return <button className="openalex-result-card" onClick={onOpen}><div><Badge tone={work.openAccess ? "green" : "neutral"}>{work.openAccess ? "Open access" : work.type ?? "Work"}</Badge><strong>{work.title}</strong><p>{work.authors.slice(0, 4).join(", ") || "Author metadata unavailable"}{work.year ? ` · ${work.year}` : ""}</p><small>{work.citedByCount?.toLocaleString() ?? 0} citations · {work.venue ?? "Source unavailable"}</small></div><ChevronRight size={17} /></button>;
}

export function OpenAlexScreen({ showToast }: { showToast: (message: string | null) => void }) {
  const [kind, setKind] = useState<Kind>("works");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entity[]>([]);
  const [works, setWorks] = useState<NormalizedScholarlyWork[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string>();
  const [selected, setSelected] = useState<{ kind: Kind; id: string }>();
  const [detail, setDetail] = useState<DetailPayload>();
  const [graphDirection, setGraphDirection] = useState<"references" | "cited_by" | "related">("references");
  const [graph, setGraph] = useState<NormalizedScholarlyWork[]>([]);
  const [graphCursor, setGraphCursor] = useState<string>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadDetail = useCallback(async (target: { kind: Kind; id: string }) => {
    setBusy("detail");
    setError("");
    setSelected(target);
    try {
      const parameters = new URLSearchParams({ action: "detail", kind: target.kind, id: target.id });
      const response = await fetch(`/api/openalex?${parameters}`, { cache: "no-store" });
      const payload = await response.json() as DetailPayload;
      if (!response.ok) throw new Error(payload.error ?? "Entity details are unavailable.");
      setDetail(payload);
      setGraph([]);
      setGraphCursor(undefined);
      const nextUrl = `/openalex/${target.kind}/${target.id}`;
      if (window.location.pathname !== nextUrl) window.history.replaceState({}, "", nextUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Entity details are unavailable."); }
    finally { setBusy(""); }
  }, []);

  useEffect(() => {
    const match = window.location.pathname.match(/^\/openalex\/(works|authors|institutions|sources|topics)\/([WASIT]\d+)$/i);
    if (match) {
      const target = { kind: match[1]!.toLowerCase() as Kind, id: match[2]!.toUpperCase() };
      setKind(target.kind);
      void loadDetail(target);
    }
  }, [loadDetail]);

  async function search(event?: FormEvent, cursor?: string) {
    event?.preventDefault();
    if (query.trim().length < 2) return;
    setBusy("search");
    setError("");
    try {
      const parameters = new URLSearchParams({ action: "search", kind, q: query.trim(), cursor: cursor ?? "*", sort: "citations" });
      const response = await fetch(`/api/openalex?${parameters}`, { cache: "no-store" });
      const payload = await response.json() as ResultPayload;
      if (!response.ok) throw new Error(payload.error ?? "OpenAlex search failed.");
      setResults((current) => cursor ? [...current, ...(payload.results ?? [])] : payload.results ?? []);
      setWorks((current) => cursor ? [...current, ...(payload.works ?? [])] : payload.works ?? []);
      setTotal(payload.total ?? 0);
      setNextCursor(payload.nextCursor);
      if (!cursor) {
        setSelected(undefined);
        setDetail(undefined);
        window.history.replaceState({}, "", "/openalex");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "OpenAlex search failed."); }
    finally { setBusy(""); }
  }

  async function loadGraph(cursor?: string) {
    if (!selected || selected.kind !== "works") return;
    setBusy("graph");
    try {
      const parameters = new URLSearchParams({ action: "graph", kind: "works", id: selected.id, direction: graphDirection, cursor: cursor ?? "*" });
      const response = await fetch(`/api/openalex?${parameters}`, { cache: "no-store" });
      const payload = await response.json() as ResultPayload & { zoteroMatches?: Array<Record<string, unknown>> };
      if (!response.ok) throw new Error(payload.error ?? "Citation links are unavailable.");
      setGraph((current) => cursor ? [...current, ...(payload.works ?? [])] : payload.works ?? []);
      setGraphCursor(payload.nextCursor);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Citation links are unavailable."); }
    finally { setBusy(""); }
  }

  useEffect(() => {
    if (selected?.kind === "works") void loadGraph();
    // Reload only when the selected graph direction changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphDirection, selected?.id]);

  async function saveEntity() {
    const entity = detail?.entity;
    const work = detail?.work;
    if (!selected || (!entity && !work)) return;
    const title = entity?.title ?? work!.title;
    setBusy("save");
    try {
      const response = await fetch("/api/openalex", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save", kind: selected.kind, id: selected.id, title, metadata: entity ?? work }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The entity could not be saved.");
      showToast("Saved to your Continuum scholarly library.");
    } catch (cause) { showToast(cause instanceof Error ? cause.message : "The entity could not be saved."); }
    finally { setBusy(""); }
  }

  const selectedTitle = detail?.entity?.title ?? detail?.work?.title;
  return <div className="page-stack openalex-browser">
    <PageIntro eyebrow="SCHOLARLY GRAPH" title="OpenAlex" description="Search works, authors, institutions, sources, and topics; follow citation relationships progressively; and preserve selected entities." />
    <Card className="openalex-search-shell">
      <nav aria-label="OpenAlex entity types" role="tablist">
        {kinds.map((entry) => {
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
              }}
            >
              <Icon size={15} />
              {entry.label}
            </button>
          );
        })}
      </nav>
      <form onSubmit={(event) => void search(event)}><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} required minLength={2} maxLength={500} placeholder={`Search ${kind}`} aria-label={`Search OpenAlex ${kind}`} /></label><Button className="button-primary" disabled={busy === "search"}>{busy === "search" ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}Search</Button></form>
    </Card>
    {error ? <div className="banner banner-error" role="alert">{error}</div> : null}
    <div className="openalex-layout">
      <Card className="openalex-results">
        <header><strong>{total ? `${total.toLocaleString()} results` : "Search results"}</strong>{nextCursor ? <Button className="button-secondary" disabled={Boolean(busy)} onClick={() => void search(undefined, nextCursor)}>Load more</Button> : null}</header>
        {kind === "works"
          ? works.map((work) => <WorkCard key={work.providerId} work={work} onOpen={() => void loadDetail({ kind: "works", id: work.providerId })} />)
          : results.map((entity) => <button key={entity.id} className={selected?.id === entity.id ? "openalex-result-card active" : "openalex-result-card"} onClick={() => void loadDetail({ kind, id: entity.id })}><div><Badge tone="neutral">{entity.kind.slice(0, -1)}</Badge><strong>{entity.title}</strong><p>{entity.description ?? entity.countryCode ?? "OpenAlex entity"}</p><small>{entity.worksCount?.toLocaleString() ?? 0} works · {entity.citedByCount?.toLocaleString() ?? 0} citations</small></div><ChevronRight size={17} /></button>)}
        {!works.length && !results.length && busy !== "search" ? <div className="empty-state"><GraduationCap size={27} /><p>Search the public scholarly graph to begin.</p></div> : null}
      </Card>
      <Card className="openalex-detail">
        {busy === "detail" ? <div className="screen-loading"><span /><span /><span /></div> : selectedTitle ? <>
          <header><div><Badge tone="blue">{selected?.kind.slice(0, -1)}</Badge><h2>{selectedTitle}</h2></div><Button className="button-primary" disabled={busy === "save"} onClick={() => void saveEntity()}>{busy === "save" ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}Save</Button></header>
          {detail?.work ? <><p>{detail.work.authors.join(", ")}</p><div className="openalex-facts"><span>{detail.work.year ?? "Year unavailable"}</span><span>{detail.work.citedByCount?.toLocaleString() ?? 0} citations</span><span>{detail.work.openAccess ? "Open access" : "Access varies"}</span></div>{detail.work.abstract ? <section><h3>Abstract</h3><p>{detail.work.abstract}</p></section> : null}<div className="connection-actions">{detail.work.landingPageUrl ? <a className="button button-secondary" href={detail.work.landingPageUrl} target="_blank" rel="noreferrer">Landing page<ExternalLink size={13} /></a> : null}{detail.work.fullTextUrl ? <a className="button button-secondary" href={detail.work.fullTextUrl} target="_blank" rel="noreferrer">Open full text<ArrowUpRight size={13} /></a> : null}</div></> : null}
          {detail?.entity ? <><p>{detail.entity.description}</p><dl>{Object.entries(detail.entity.identifiers).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="openalex-facts"><span>{detail.entity.worksCount?.toLocaleString() ?? 0} works</span><span>{detail.entity.citedByCount?.toLocaleString() ?? 0} citations</span>{detail.entity.countryCode ? <span>{detail.entity.countryCode}</span> : null}</div></> : null}
          {detail?.zoteroMatches?.length ? <div className="research-callout"><Library size={16} /><span>{detail.zoteroMatches.length} matching Zotero citation{detail.zoteroMatches.length === 1 ? "" : "s"} found by DOI.</span></div> : null}
          {selected?.kind !== "works" && detail?.relatedWorks?.length ? <section><h3>Highly cited works</h3>{detail.relatedWorks.map((work) => <WorkCard key={work.providerId} work={work} onOpen={() => void loadDetail({ kind: "works", id: work.providerId })} />)}</section> : null}
          {selected?.kind === "works" ? <section className="citation-graph"><div className="section-heading"><div><Network size={17} /><h3>Citation graph</h3></div></div><nav role="tablist" aria-label="Citation graph direction">{(["references", "cited_by", "related"] as const).map((direction) => <button type="button" role="tab" aria-selected={graphDirection === direction} className={graphDirection === direction ? "active" : ""} key={direction} onClick={() => setGraphDirection(direction)}>{direction.replaceAll("_", " ")}</button>)}</nav>{graph.map((work) => <WorkCard key={work.providerId} work={work} onOpen={() => void loadDetail({ kind: "works", id: work.providerId })} />)}{graphCursor ? <Button className="button-secondary" disabled={busy === "graph"} onClick={() => void loadGraph(graphCursor)}>{busy === "graph" ? <LoaderCircle className="spin" size={14} /> : null}Load more graph nodes</Button> : null}{!graph.length && busy !== "graph" ? <p>No {graphDirection.replaceAll("_", " ")} returned for this work.</p> : null}</section> : null}
          <a href={`https://openalex.org/${selected?.id}`} target="_blank" rel="noreferrer">View on OpenAlex <ExternalLink size={12} /></a>
        </> : <div className="empty-state"><Network size={28} /><p>Select an entity to inspect its identifiers, metrics, works, and relationships.</p></div>}
      </Card>
    </div>
  </div>;
}
