"use client";

import {
  Archive,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Clock3,
  Database,
  Download,
  FileJson,
  FileText,
  FolderKanban,
  Link2,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { contextPackMarkdown, type ContextPack, type ContextPackMetadata } from "@/lib/context-packs";
import { conceptLabel, eventTypeLabel, formatLabel, masteryLabel, statusTone } from "@/lib/labels";
import { PageHeader } from "./page-header";
import { formatDate, list, text, type Row, type WorkspaceState } from "./types";

type Toast = (message: string | null) => void;
type MemoryView = "overview" | "packs" | "history";

function recordSummary(record: Row) {
  const value = record.value;
  if (value && typeof value === "object" && typeof (value as Row).summary === "string") return String((value as Row).summary);
  return text(record, "content") || text(record, "summary") || formatLabel(text(record, "type", "memory"));
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function MemoryScreen({ state, showToast }: { state: WorkspaceState; showToast: Toast }) {
  const [view, setView] = useState<MemoryView>("overview");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Row[]>();
  const [packs, setPacks] = useState<ContextPackMetadata[]>([]);
  const [pack, setPack] = useState<ContextPack>();
  const [packBusy, setPackBusy] = useState(false);

  const preferences = state.memoryRecords.filter((record) => text(record, "type").includes("preference"));
  const decisions = state.decisions.filter((decision) => ["accepted", "active", ""].includes(text(decision, "status"))).slice(0, 6);
  const misconceptions = state.learningStates.filter((item) => ["misconception_detected", "needs_review", "in_progress"].includes(text(item, "status")));
  const verifiedKnowledge = state.learningStates.filter((item) => ["mastered", "verified", "retained"].includes(text(item, "status")));
  const openQuestions = state.receipts.flatMap((receipt) => list(receipt, "unresolvedQuestions")).slice(0, 8);
  const deadlines = state.goals.filter((goal) => text(goal, "targetDate")).sort((left, right) => text(left, "targetDate").localeCompare(text(right, "targetDate"))).slice(0, 5);

  useEffect(() => {
    let active = true;
    fetch("/api/memory", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { packs?: ContextPackMetadata[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Context packs could not be listed");
        if (active) setPacks(body.packs ?? []);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/memory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "search", query, limit: 10 }) });
      const body = await response.json() as { results?: Row[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Memory search failed");
      setResults(body.results ?? []);
    } catch (error) { showToast(error instanceof Error ? error.message : "Memory search failed"); }
    finally { setBusy(false); }
  }

  async function openPack(metadata: ContextPackMetadata) {
    setPackBusy(true);
    setView("packs");
    try {
      const response = await fetch("/api/memory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "context_pack", packId: metadata.id, maxTokens: 1800 }) });
      const body = await response.json() as { pack?: ContextPack; error?: string };
      if (!response.ok || !body.pack) throw new Error(body.error ?? "Context pack could not be loaded");
      setPack(body.pack);
    } catch (error) { showToast(error instanceof Error ? error.message : "Context pack could not be loaded"); }
    finally { setPackBusy(false); }
  }

  async function copyPack() {
    if (!pack) return;
    await navigator.clipboard.writeText(contextPackMarkdown(pack));
    showToast("Context pack copied as Markdown.");
  }

  function exportMemory() {
    const payload = { exportedAt: new Date().toISOString(), goals: state.goals, projects: state.projects, decisions: state.decisions, claims: state.claims, learningStates: state.learningStates, receipts: state.receipts, memoryRecords: state.memoryRecords, events: state.events };
    download(`continuum-memory-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json");
    showToast("A private memory export was created locally in your browser.");
  }

  return (
    <div className="screen memory-screen premium-screen">
      <PageHeader
        title="Memory"
        description="Continuum keeps current goals, evidence, decisions, and outcomes canonical in your account. Canonical memory is the durable state assistants retrieve from — a small relevant pack, never a transcript dump."
        actions={<Button className="button-secondary compact-button" onClick={exportMemory}><Download size={15} aria-hidden="true" />Export all</Button>}
      >
        <nav className="section-tabs" role="tablist" aria-label="Memory sections">{(["overview", "packs", "history"] as MemoryView[]).map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item === "packs" ? "Context packs" : formatLabel(item)}</button>)}</nav>
      </PageHeader>

      <Card className="memory-search-card"><form onSubmit={search}><Search size={19} /><label htmlFor="memory-query" className="sr-only">Search academic memory</label><input id="memory-query" value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={2000} placeholder="Find a decision, misconception, result, or unresolved question" /><Button className="button-primary" disabled={busy || query.trim().length < 2}>{busy ? <LoaderCircle className="spin" size={15} /> : null}{busy ? "Searching…" : "Search memory"}</Button></form><div><ShieldCheck size={15} /><span>Private account scope · semantic + lexical retrieval · relevance and token budget applied</span></div></Card>

      {results ? <section className="memory-search-results"><header><div><p className="eyebrow">SEARCH RESULTS</p><h2>{results.length} relevant record{results.length === 1 ? "" : "s"}</h2></div><button onClick={() => setResults(undefined)}><X size={15} />Clear</button></header>{results.length ? <div>{results.map((result) => <article key={text(result, "id")}><Badge tone="blue">{formatLabel(text(result, "kind", "memory"))}</Badge><strong>{text(result, "content")}</strong><span>{formatDate(result.occurredAt)}{typeof result.score === "number" ? ` · ${Math.round(Number(result.score) * 100)}% match` : ""}</span></article>)}</div> : <p>No related record was returned. Continuum does not pad results with unrelated history.</p>}</section> : null}

      {view === "overview" ? <div className="memory-overview-layout">
        <section className="memory-current-state">
          <div className="memory-state-heading"><div><p className="eyebrow">CURRENT STATE</p><h2>What Continuum will carry forward</h2></div><span><Database size={15} />Postgres canonical</span></div>
          <div className="memory-priority-strip">
            <div><Target size={18} /><span><strong>{state.goals.filter((goal) => text(goal, "status") !== "completed").length}</strong> active goals</span></div>
            <div><FolderKanban size={18} /><span><strong>{state.projects.length}</strong> projects</span></div>
            <div><CheckCircle2 size={18} /><span><strong>{state.receipts.length}</strong> outcome receipts</span></div>
            <div><Link2 size={18} /><span><strong>{state.sources.length + state.claims.length}</strong> evidence records</span></div>
          </div>

          <div className="memory-domain-grid">
            <section><header><Target size={17} /><div><h3>Current goals</h3><p>Outcomes and next commitments</p></div></header>{state.goals.slice(0, 4).map((goal) => <article key={text(goal, "id")}><div><strong>{text(goal, "title")}</strong><span>{text(goal, "outcome")}</span></div><Badge tone={statusTone(text(goal, "status", "active"))}>{formatLabel(text(goal, "status", "active"))}</Badge></article>)}</section>
            <section><header><FolderKanban size={17} /><div><h3>Active projects</h3><p>Questions, decisions, and blockers</p></div></header>{state.projects.slice(0, 4).map((project) => <article key={text(project, "id")}><div><strong>{text(project, "title")}</strong><span>{text(project, "purpose")}</span></div><small>{text(project, "phase", "Active")}</small></article>)}</section>
            <section><header><BrainCircuit size={17} /><div><h3>Learning signals</h3><p>Evidence—not content views</p></div></header>{[...misconceptions, ...verifiedKnowledge].slice(0, 5).map((item) => <article key={text(item, "id") || text(item, "conceptId")}><div><strong>{conceptLabel(text(item, "conceptId"))}</strong><span>{text(item, "explanation")}</span></div><Badge tone={statusTone(text(item, "status"))}>{masteryLabel(text(item, "status"))}</Badge></article>)}{!state.learningStates.length ? <p className="memory-empty-line">No verified learning signal yet.</p> : null}</section>
            <section><header><Sparkles size={17} /><div><h3>Preferences</h3><p>How support should adapt</p></div></header>{preferences.slice(0, 4).map((record) => <article key={text(record, "id")}><div><strong>Learning preference</strong><span>{recordSummary(record)}</span></div></article>)}{!preferences.length ? <p className="memory-empty-line">No durable preference has been saved.</p> : null}</section>
            <section><header><Archive size={17} /><div><h3>Research decisions</h3><p>Accepted interpretation boundaries</p></div></header>{decisions.map((decision) => <article key={text(decision, "id")}><div><strong>{text(decision, "text", "Decision")}</strong><span>{text(decision, "reasoning")}</span></div></article>)}{!decisions.length ? <p className="memory-empty-line">No accepted research decision yet.</p> : null}</section>
            <section><header><Clock3 size={17} /><div><h3>Deadlines & open questions</h3><p>Constraints that change the next action</p></div></header>{deadlines.map((goal) => <article key={text(goal, "id")}><div><strong>{text(goal, "title")}</strong><span>{formatDate(text(goal, "targetDate"), { dateStyle: "medium" })}</span></div></article>)}{openQuestions.slice(0, 3).map((question) => <article key={question}><div><strong>Open question</strong><span>{question}</span></div></article>)}</section>
          </div>
        </section>

        <aside className="memory-resume-panel"><p className="eyebrow">RECENT PROGRESS</p><h2>Resume from an outcome</h2>{state.receipts.slice(0, 4).map((receipt) => <article key={text(receipt, "id")}><span>{formatDate(receipt.createdAt, { dateStyle: "medium" })}</span><strong>{text(receipt, "summary")}</strong>{list(receipt, "nextActions")[0] ? <p><ChevronRight size={13} />{list(receipt, "nextActions")[0]}</p> : null}</article>)}<button onClick={() => setView("history")}>Open receipts and audit history <ChevronRight size={14} /></button></aside>
      </div> : null}

      {view === "packs" ? <div className="context-pack-workspace">
        <aside><div><p className="eyebrow">CONTEXT PACKS</p><h2>Choose only what the next tool needs</h2><p>Every pack is private, token-estimated, provenance-labelled, and available through MCP.</p></div>{packs.map((metadata) => <button key={metadata.id} className={pack?.metadata.id === metadata.id ? "active" : ""} onClick={() => void openPack(metadata)}><span className={`pack-kind ${metadata.category}`}>{metadata.category === "project" ? <FolderKanban size={15} /> : metadata.category === "learning" ? <BrainCircuit size={15} /> : <FileText size={15} />}</span><span><strong>{metadata.title}</strong><small>{metadata.recordCount} records · ~{metadata.estimatedTokens.toLocaleString()} tokens</small></span><ChevronRight size={15} /></button>)}</aside>
        <section className="context-pack-detail">{packBusy ? <div className="context-pack-empty"><LoaderCircle className="spin" size={25} /><h2>Building the smallest useful pack…</h2></div> : pack ? <><header><div><Badge tone="blue">{formatLabel(pack.metadata.category)} pack</Badge><h2>{pack.metadata.title}</h2><p>{pack.metadata.description}</p></div><div><Button className="button-secondary" onClick={() => void copyPack()}><Clipboard size={14} />Copy</Button><Button className="button-secondary" onClick={() => download(`${pack.metadata.id.replace(/[^a-z0-9._-]+/gi, "-")}.md`, contextPackMarkdown(pack), "text/markdown")}><FileText size={14} />Markdown</Button><Button className="button-secondary" onClick={() => download(`${pack.metadata.id.replace(/[^a-z0-9._-]+/gi, "-")}.json`, JSON.stringify(pack, null, 2), "application/json")}><FileJson size={14} />JSON</Button></div></header><div className="context-pack-trust"><span><ShieldCheck size={15} />Private account</span><span><Database size={15} />{pack.metadata.recordCount} records</span><span><Sparkles size={15} />~{pack.metadata.estimatedTokens.toLocaleString()} tokens</span><span><Link2 size={15} />MCP: {pack.metadata.mcpTool}</span></div><div className="context-pack-policy">{pack.contextPolicy}</div><div className="context-pack-provenance"><strong>Provenance</strong>{pack.metadata.provenance.map((item) => <code key={item}>{item}</code>)}</div><pre>{JSON.stringify(pack.content, null, 2)}</pre><p className="obsidian-pack-note">Obsidian Sync mirrors this into <code>Continuum/Context Packs/</code>. It never gives the hosted browser arbitrary filesystem access.</p></> : <div className="context-pack-empty"><FileText size={26} /><h2>Select a context pack</h2><p>Use Current week for planning, Current misconceptions for tutoring, or a goal/project pack for a focused handoff.</p></div>}</section>
      </div> : null}

      {view === "history" ? <div className="memory-history-layout"><section><div className="section-heading"><div><p className="eyebrow">OUTCOME RECEIPTS</p><h2>Compact checkpoints across sessions</h2></div></div>{state.receipts.map((receipt) => <article className="history-receipt" key={text(receipt, "id")}><div><Badge tone="green">Outcome receipt</Badge><time>{formatDate(receipt.createdAt)}</time></div><h3>{text(receipt, "summary")}</h3>{list(receipt, "nextActions").length ? <p><strong>Next:</strong> {list(receipt, "nextActions").join(" · ")}</p> : null}</article>)}</section><section><div className="section-heading"><div><p className="eyebrow">OPTIONAL AUDIT HISTORY</p><h2>Where the current state came from</h2></div></div><div className="memory-event-timeline">{state.events.slice(0, 40).map((event) => <article key={text(event, "id")}><i /><div><Badge tone="neutral">{eventTypeLabel(text(event, "type"))}</Badge><h3>{text(event, "summary")}</h3><time>{formatDate(event.occurredAt)}</time></div></article>)}</div></section></div> : null}
    </div>
  );
}
