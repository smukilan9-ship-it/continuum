"use client";

import { Clipboard, Download, FileText, Search } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Button, DataRegion, EmptyState, Field, Input, LoadingState, StatusChip, Tabs, type RegionStatus } from "@/components/ui";
import { contextPackMarkdown, renderPackSections, type ContextPack, type ContextPackMetadata } from "@/lib/context-packs";
import { conceptLabel, eventTypeLabel, formatLabel } from "@/lib/labels";
import { plainCopy } from "@/lib/user-copy";

import { formatDate, list, text, type Row, type WorkspaceState } from "../workspace/types";
import "./context.css";

type Toast = (message: string | null) => void;
type ContextView = "overview" | "packs" | "history";

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

function recordSummary(record: Row) {
  const value = record.value;
  if (value && typeof value === "object" && typeof (value as Row).summary === "string") return String((value as Row).summary);
  return text(record, "content") || text(record, "summary") || formatLabel(text(record, "type", "memory"));
}

/** Each row states where it came from — the provenance story in the user's language. */
function ContextRow({ title, detail, origin }: { title: string; detail?: string; origin?: string }) {
  return (
    <li className="context-row">
      <div>
        <strong>{plainCopy(title)}</strong>
        {detail ? <span>{plainCopy(detail)}</span> : null}
      </div>
      {origin ? <small>From: {origin}</small> : null}
    </li>
  );
}

function ContextSection({ heading, description, children, empty }: { heading: string; description: string; children: React.ReactNode; empty: boolean }) {
  return (
    <section className="context-section" aria-labelledby={`ctx-${heading.replace(/\s+/g, "-").toLowerCase()}`}>
      <header>
        <h2 id={`ctx-${heading.replace(/\s+/g, "-").toLowerCase()}`}>{heading}</h2>
        <p>{description}</p>
      </header>
      {empty ? <p className="context-empty">Nothing here yet.</p> : <ul className="context-list">{children}</ul>}
    </section>
  );
}

export function ContextPage({ state, showToast }: { state: WorkspaceState; showToast: Toast }) {
  const [view, setView] = useState<ContextView>("overview");
  const [query, setQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<RegionStatus>("idle");
  const [results, setResults] = useState<Row[]>([]);
  const [packs, setPacks] = useState<ContextPackMetadata[]>([]);
  const [pack, setPack] = useState<ContextPack>();
  const [packBusy, setPackBusy] = useState(false);

  const preferences = state.memoryRecords.filter((record) => text(record, "type").includes("preference"));
  const decisions = state.decisions.filter((decision) => ["accepted", "active", ""].includes(text(decision, "status"))).slice(0, 6);
  const learning = state.learningStates.slice(0, 6);
  const openQuestions = state.receipts.flatMap((receipt) => list(receipt, "unresolvedQuestions").map((question) => ({ question, receipt }))).slice(0, 6);
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

  const sections = useMemo(() => (pack ? renderPackSections(pack) : []), [pack]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchStatus("loading");
    try {
      const response = await fetch("/api/memory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "search", query, limit: 10 }) });
      const body = await response.json() as { results?: Row[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "That search could not be completed");
      setResults(body.results ?? []);
      setSearchStatus((body.results ?? []).length ? "ready" : "empty");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "That search could not be completed");
      setSearchStatus("error");
    }
  }

  async function openPack(metadata: ContextPackMetadata) {
    setPackBusy(true);
    setView("packs");
    try {
      const response = await fetch("/api/memory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "context_pack", packId: metadata.id, maxTokens: 1800 }) });
      const body = await response.json() as { pack?: ContextPack; error?: string };
      if (!response.ok || !body.pack) throw new Error(body.error ?? "That pack could not be opened");
      setPack(body.pack);
    } catch (error) { showToast(error instanceof Error ? error.message : "That pack could not be opened"); }
    finally { setPackBusy(false); }
  }

  const safeName = (id: string) => id.replace(/[^a-z0-9._-]+/gi, "-");

  return (
    <div className="context-page">
      <header className="context-head">
        <h1>Context</h1>
        {/* §9.9 bans Postgres, canonical, vector, embedding, retrieval, token
            budget, chunk, MCP tool, and pack ID from this page. The old copy
            used five of them in two sentences. */}
        <p>Everything Continuum remembers about your work, in your words. You can see where each item came from.</p>
        <Tabs
          label="Context sections"
          value={view}
          onChange={setView}
          options={[
            { value: "overview" as const, label: "Overview" },
            { value: "packs" as const, label: "Packs" },
            { value: "history" as const, label: "History" },
          ]}
        />
      </header>

      {view === "overview" ? (
        <>
          <form className="context-search" onSubmit={search}>
            <Field label="Search everything Continuum remembers">
              {({ id }) => (
                <div className="context-search-row">
                  <Search size={16} aria-hidden="true" />
                  <Input id={id} value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={2000} placeholder="A decision, a result, an open question…" />
                  <Button variant="primary" type="submit" disabled={query.trim().length < 2}>Search</Button>
                </div>
              )}
            </Field>
          </form>

          {searchStatus !== "idle" ? (
            <DataRegion
              status={searchStatus}
              loading={<LoadingState rows={3} label="Searching" />}
              empty={<EmptyState title={`Nothing matched “${query}”`} body="Continuum doesn't pad results with unrelated history." />}
              error={<EmptyState title="That search didn't complete" body="Try again in a moment." />}
            >
              <section className="context-section">
                <header><h2>{results.length} match{results.length === 1 ? "" : "es"}</h2><p>Ranked by how closely each one relates to your words.</p></header>
                <ul className="context-list">
                  {results.map((result) => (
                    <ContextRow key={text(result, "id")} title={text(result, "content")} origin={formatLabel(text(result, "kind", "your workspace"))} />
                  ))}
                </ul>
              </section>
            </DataRegion>
          ) : null}

          <div className="context-grid">
            <ContextSection heading="Your goals" description="What you're working toward." empty={!state.goals.length}>
              {state.goals.slice(0, 6).map((goal) => <ContextRow key={text(goal, "id")} title={text(goal, "title")} detail={text(goal, "outcome")} origin="A goal you set" />)}
            </ContextSection>

            <ContextSection heading="What you've decided" description="Decisions Continuum will not quietly reverse." empty={!decisions.length}>
              {decisions.map((decision) => <ContextRow key={text(decision, "id")} title={text(decision, "text", "Decision")} detail={text(decision, "reasoning")} origin={text(state.projects.find((project) => text(project, "id") === text(decision, "projectId")), "title") || "A conversation"} />)}
            </ContextSection>

            <ContextSection heading="What you're learning" description="Only what you've shown, not what you've read." empty={!learning.length}>
              {learning.map((item) => <ContextRow key={text(item, "id") || text(item, "conceptId")} title={conceptLabel(text(item, "conceptId"))} detail={text(item, "explanation")} origin="Your practice results" />)}
            </ContextSection>

            <ContextSection heading="How you like to work" description="Preferences Continuum applies without asking." empty={!preferences.length}>
              {preferences.slice(0, 6).map((record) => <ContextRow key={text(record, "id")} title={recordSummary(record)} origin="Something you told Continuum" />)}
            </ContextSection>

            <ContextSection heading="Open questions" description="Things you left unresolved." empty={!openQuestions.length}>
              {openQuestions.map(({ question, receipt }) => <ContextRow key={question} title={question} origin={`A session on ${formatDate(receipt.createdAt, { dateStyle: "medium" })}`} />)}
            </ContextSection>

            <ContextSection heading="Deadlines" description="Dates that change what comes next." empty={!deadlines.length}>
              {deadlines.map((goal) => <ContextRow key={text(goal, "id")} title={text(goal, "title")} detail={formatDate(text(goal, "targetDate"), { dateStyle: "full" })} origin="A goal you set" />)}
            </ContextSection>
          </div>
        </>
      ) : null}

      {view === "packs" ? (
        <div className="pack-layout">
          <aside className="pack-list">
            <p className="pack-intro">Give Claude just this slice of your work.</p>
            {packs.map((metadata) => (
              <button key={metadata.id} type="button" className={pack?.metadata.id === metadata.id ? "active" : ""} onClick={() => void openPack(metadata)}>
                <strong>{metadata.title}</strong>
                <small>{metadata.description}</small>
                <span>Updated {formatDate(metadata.updatedAt, { dateStyle: "medium" })}</span>
              </button>
            ))}
            {!packs.length ? <EmptyState title="No packs yet" body="Packs appear as your goals and projects gain content." /> : null}
          </aside>

          <section className="pack-detail">
            {packBusy ? (
              <LoadingState rows={4} label="Opening pack" />
            ) : pack ? (
              <article>
                <header>
                  <div>
                    <h2>{pack.metadata.title}</h2>
                    <p>{pack.metadata.description}</p>
                  </div>
                  <div className="pack-actions">
                    <Button variant="secondary" size="sm" onClick={() => { void navigator.clipboard.writeText(contextPackMarkdown(pack)); showToast("Copied."); }}><Clipboard size={14} />Copy</Button>
                    <Button variant="secondary" size="sm" onClick={() => download(`${safeName(pack.metadata.id)}.md`, contextPackMarkdown(pack), "text/markdown")}><FileText size={14} />Markdown</Button>
                    {/* JSON is an explicit action, no longer the default view (C21). */}
                    <Button variant="quiet" size="sm" onClick={() => download(`${safeName(pack.metadata.id)}.json`, JSON.stringify(pack.content, null, 2), "application/json")}><Download size={14} />JSON</Button>
                  </div>
                </header>

                <p className="pack-policy">{pack.contextPolicy}</p>

                {sections.length ? (
                  <div className="pack-sections">
                    {sections.map((section) => (
                      <section key={section.heading}>
                        <h3>{section.heading}</h3>
                        <ul>
                          {section.items.map((item, index) => <li key={`${section.heading}-${index}`}>{plainCopy(item)}</li>)}
                          {section.remaining ? <li className="pack-more">…and {section.remaining} more</li> : null}
                        </ul>
                      </section>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="This pack is empty" body="It will fill in as you add work to this goal or project." />
                )}
              </article>
            ) : (
              <EmptyState title="Choose a pack" body="Each one is a slice of your work you can hand to Claude." />
            )}
          </section>
        </div>
      ) : null}

      {view === "history" ? (
        <div className="context-history">
          <section className="context-section">
            <header><h2>Session summaries</h2><p>What you and Continuum worked out, session by session.</p></header>
            {state.receipts.length ? (
              <ul className="context-list">
                {state.receipts.map((receipt) => (
                  <li key={text(receipt, "id")} className="context-row">
                    <div>
                      <strong>{plainCopy(text(receipt, "summary"))}</strong>
                      {list(receipt, "nextActions").length ? <span>Next: {list(receipt, "nextActions").join(" · ")}</span> : null}
                    </div>
                    <small>{formatDate(receipt.createdAt, { dateStyle: "medium" })}</small>
                  </li>
                ))}
              </ul>
            ) : <p className="context-empty">No session summary yet.</p>}
          </section>

          <details className="context-audit">
            <summary>Show the full activity log</summary>
            <ul className="context-list">
              {state.events.slice(0, 40).map((event) => (
                <li key={text(event, "id")} className="context-row">
                  <div>
                    <StatusChip tone="neutral" label={eventTypeLabel(text(event, "type", "event"))} />
                    <span>{plainCopy(text(event, "summary"))}</span>
                  </div>
                  <small>{formatDate(event.occurredAt, { dateStyle: "medium", timeStyle: "short" })}</small>
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}
    </div>
  );
}
