"use client";

import { Database, Download, FileCheck2, Link2, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, Progress } from "@/components/ui";
import { PageIntro } from "./page-intro";
import { formatDate, list, number, text, type Row, type WorkspaceState } from "./types";

type Toast = (message: string | null) => void;

export function MemoryScreen({ state, showToast }: { state: WorkspaceState; showToast: Toast }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Row[]>();
  const mastery = state.learningStates[0];

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/memory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, limit: 10 }) });
      const body = await response.json() as { results?: Row[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Memory search failed");
      setResults(body.results ?? []);
    } catch (error) { showToast(error instanceof Error ? error.message : "Memory search failed"); }
    finally { setBusy(false); }
  }

  function exportMemory() {
    const payload = { exportedAt: new Date().toISOString(), goals: state.goals, projects: state.projects, decisions: state.decisions, learningStates: state.learningStates, receipts: state.receipts, memoryRecords: state.memoryRecords, events: state.events };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `continuum-memory-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast("A human-readable memory export was created locally in your browser.");
  }

  return (
    <div className="screen">
      <PageIntro eyebrow="MEMORY" title="Everything remains searchable. Only relevance is loaded." description="Continuum keeps structured current state, durable events, and compact outcome receipts. Semantic search retrieves the smallest useful context pack instead of replaying every chat." action={<Button className="button-secondary" onClick={exportMemory}><Download size={16} />Export memory</Button>} />

      <Card className="memory-search-card"><form onSubmit={search}><Search size={19} /><label htmlFor="memory-query" className="sr-only">Search academic memory</label><input id="memory-query" value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={2000} placeholder="Search a decision, misconception, unresolved question, or previous result" /><Button className="button-primary" disabled={busy || query.trim().length < 2}>{busy ? "Searching…" : "Search memory"}</Button></form><div><ShieldCheck size={15} /><span>Hybrid semantic + lexical search · user scoped · token budgeted</span></div></Card>

      <section className="memory-overview">
        <Card><span><Sparkles size={18} /></span><div><strong>{state.memoryRecords.length || state.events.length}</strong><small>current durable records</small></div></Card>
        <Card><span><FileCheck2 size={18} /></span><div><strong>{state.receipts.length}</strong><small>outcome receipts</small></div></Card>
        <Card><span><Link2 size={18} /></span><div><strong>{state.events.length}</strong><small>audited events</small></div></Card>
        <Card><span><Database size={18} /></span><div><strong>{state.sources.length}</strong><small>indexed sources</small></div></Card>
      </section>

      {mastery ? <Card className="mastery-summary"><div className="card-heading-row"><div><p className="eyebrow">CURRENT LEARNING STATE</p><h2>{text(mastery, "conceptId", "Tracked concept")}</h2><p>{text(mastery, "explanation")}</p></div><Badge tone={text(mastery, "status").includes("misconception") ? "orange" : "blue"}>{text(mastery, "status", "not started").replaceAll("_", " ")}</Badge></div><div className="mastery-bars">{([{ label: "Exposure", key: "exposure" }, { label: "Understanding", key: "understanding" }, { label: "Transfer", key: "transfer" }, { label: "Retention", key: "retention" }]).map((metric) => <div key={metric.key}><div><span>{metric.label}</span><strong>{Math.round(number(mastery, metric.key) * 100)}%</strong></div><Progress value={number(mastery, metric.key) * 100} label={`${metric.label} mastery`} /></div>)}</div><small>{list(mastery, "evidenceIds").length} evidence item{list(mastery, "evidenceIds").length === 1 ? "" : "s"} linked</small></Card> : null}

      {results ? <section className="memory-section"><div className="section-heading"><div><p className="eyebrow">SEARCH RESULTS</p><h2>{results.length} relevant record{results.length === 1 ? "" : "s"}</h2></div><button onClick={() => setResults(undefined)}>Clear search</button></div><div className="memory-list">{results.map((result) => <Card className="memory-row" key={text(result, "id")}><div><Badge tone="blue">{text(result, "kind", "memory").replaceAll("_", " ")}</Badge><h3>{text(result, "content")}</h3><p>{formatDate(result.occurredAt)} · {Math.round(number(result, "tokenEstimate"))} estimated tokens</p></div>{typeof result.score === "number" ? <span>{Math.round(number(result, "score") * 100)}% match</span> : null}</Card>)}{!results.length ? <Card className="empty-record"><Search size={23} /><h2>No relevant memory found</h2><p>Try a broader phrase. Continuum does not return unrelated history just to fill the screen.</p></Card> : null}</div></section> : null}

      <section className="memory-section"><div className="section-heading"><div><p className="eyebrow">OUTCOME RECEIPTS</p><h2>Compact checkpoints across sessions</h2></div></div><div className="memory-list">{state.receipts.map((receipt) => <Card className="memory-row receipt-row" key={text(receipt, "id")}><div><Badge tone="green">Outcome receipt</Badge><h3>{text(receipt, "summary")}</h3><p>{formatDate(receipt.createdAt)}</p></div><div className="receipt-next"><strong>Next</strong><span>{list(receipt, "nextActions").join(" · ") || "No next action recorded"}</span></div></Card>)}{!state.receipts.length ? <Card className="empty-record"><FileCheck2 size={23} /><h2>No receipt yet</h2><p>Finish a verified learning activity or call sync_session from an authorized assistant.</p></Card> : null}</div></section>

      <section className="memory-section"><div className="section-heading"><div><p className="eyebrow">RECENT DURABLE EVENTS</p><h2>Where the current state came from</h2></div></div><div className="memory-list">{state.events.slice(0, 30).map((event) => <Card className="memory-row" key={text(event, "id")}><div><Badge tone="neutral">{text(event, "type").replaceAll(".", " ")}</Badge><h3>{text(event, "summary")}</h3><p>{formatDate(event.occurredAt)}</p></div></Card>)}</div></section>
    </div>
  );
}
