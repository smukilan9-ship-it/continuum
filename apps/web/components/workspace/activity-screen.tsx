"use client";

import { Check, Clock3, GitBranch, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { PageHeader } from "./page-header";
import { eventTypeLabel, formatLabel, humanize } from "@/lib/labels";
import { formatDate, text, type Row, type WorkspaceState } from "./types";

type Toast = (message: string | null) => void;

function changes(proposal: Row) {
  const payload = proposal.payload;
  if (!payload || typeof payload !== "object") return [];
  const next = (payload as Row).changes;
  return next && typeof next === "object" ? Object.entries(next as Row) : [];
}

function scheduleBlocks(proposal: Row) {
  const blocks = changes(proposal).find(([key]) => key === "blocks")?.[1];
  return Array.isArray(blocks) ? blocks.filter((block): block is Row => Boolean(block) && typeof block === "object") : [];
}

function compactValue(key: string, value: unknown) {
  if (Array.isArray(value)) {
    if (!value.length) return "None";
    return `${value.length} ${key === "blocks" ? "study blocks" : humanize(key).toLowerCase()}`;
  }
  if (value && typeof value === "object") return `${Object.keys(value).length} structured fields`;
  if (typeof value === "string") return value.length > 180 ? `${value.slice(0, 177)}…` : formatLabel(value, value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "Not specified";
}

/** Same kind, same status, same summary — a repeat of an earlier proposal. */
function proposalSignature(proposal: Row) {
  return `${text(proposal, "kind", "change")}::${text(proposal, "status", "pending")}::${text(proposal, "summary", "")}`;
}

export function ActivityScreen({ state, timeZone, showToast, onRefresh }: { state: WorkspaceState; timeZone: string; showToast: Toast; onRefresh: () => Promise<void> }) {
  const [busyId, setBusyId] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [eventFilter, setEventFilter] = useState("all");
  const proposals = useMemo(() => state.proposals.filter((proposal) => ["pending", "confirmed"].includes(text(proposal, "status", "pending"))), [state.proposals]);

  // The demo queue carried four byte-identical "Commit the generated academic
  // plan" proposals differing only by timestamp. Group them, show the newest,
  // and offer one action to clear the superseded ones.
  const groups = useMemo(() => {
    const bySignature = new Map<string, Row[]>();
    for (const proposal of proposals) {
      const key = proposalSignature(proposal);
      bySignature.set(key, [...(bySignature.get(key) ?? []), proposal]);
    }
    return [...bySignature.entries()].map(([key, entries]) => {
      const sorted = [...entries].sort((left, right) => Date.parse(String(right.createdAt ?? 0)) - Date.parse(String(left.createdAt ?? 0)));
      return { key, current: sorted[0]!, superseded: sorted.slice(1) };
    });
  }, [proposals]);

  const eventTypes = useMemo(() => [...new Set(state.events.map((event) => text(event, "type", "event")))].sort(), [state.events]);
  const visibleEvents = useMemo(
    () => (eventFilter === "all" ? state.events : state.events.filter((event) => text(event, "type", "event") === eventFilter)),
    [state.events, eventFilter],
  );

  async function rejectSuperseded(entries: Row[]) {
    for (const entry of entries) await review(entry, "reject");
  }

  async function review(proposal: Row, action: "confirm" | "reject" | "commit_schedule") {
    const proposalId = text(proposal, "id");
    if (!proposalId) return;
    setBusyId(proposalId);
    try {
      const response = await fetch("/api/proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, proposalId }) });
      const body = await response.json() as { changeSummary?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "The proposal could not be reviewed");
      setBusyId("");
      showToast(body.changeSummary ?? "Proposal reviewed.");
      await onRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The proposal could not be reviewed");
      setBusyId("");
    }
  }

  return (
    <div className="screen">
      <PageHeader title="Review" description="Nothing consequential changes behind your back. Assistant writes are auditable, high-impact changes begin as proposals, and schedule changes require a separate confirmation and commit." stats={[{ label: "awaiting you", value: groups.length }, { label: "AI assists audited", value: state.modelRoutes.length }, { label: "audit events", value: state.events.length }]} />

      <section className="activity-section">
        <div className="section-heading"><div><h2>Proposed assistant updates</h2></div></div>
        <div className="proposal-list">
          {groups.map((group) => {
            const proposal = group.current;
            const status = text(proposal, "status", "pending");
            const kind = text(proposal, "kind", "change");
            const id = text(proposal, "id");
            const blocks = scheduleBlocks(proposal);
            return <Card className="proposal-card" key={id}>
              <div className="proposal-header"><div><Badge tone={text(proposal, "risk") === "high" ? "orange" : "blue"}>{formatLabel(text(proposal, "risk", "medium"))} risk</Badge><Badge tone="neutral">{formatLabel(kind)}</Badge></div><span>{formatDate(proposal.createdAt, undefined, timeZone)}</span></div>
              <h3>{text(proposal, "summary", "Assistant-proposed update")}</h3>
              {changes(proposal).length ? <dl>{changes(proposal).slice(0, 8).map(([key, value]) => <div key={key}><dt>{humanize(key)}</dt><dd>{compactValue(key, value)}</dd></div>)}</dl> : <p>The proposed payload is preserved in the audit ledger. Review the summary before applying it.</p>}
              {blocks.length ? <div className="review-schedule-preview"><header><strong>First {Math.min(5, blocks.length)} blocks</strong><span>{blocks.length > 5 ? `${blocks.length - 5} more in the proposal` : "Complete proposal"}</span></header>{blocks.slice(0, 5).map((block, index) => { const taskId = text(block, "taskId"); const task = state.tasks.find((candidate) => text(candidate, "id") === taskId); const startsAt = text(block, "start") || text(block, "startsAt"); const endsAt = text(block, "end") || text(block, "endsAt"); const duration = Math.max(0, Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000)); const taskLabel = text(task, "title") || humanize(taskId.replace(/^task_(?:demo_)?/, "")) || "Study block"; return <div key={text(block, "id", `${id}-${index}`)}><span>{formatDate(startsAt, { weekday: "short", hour: "numeric", minute: "2-digit" }, timeZone)}</span><strong>{taskLabel}</strong><small>{Number.isFinite(duration) ? `${duration} min` : "Duration unavailable"}</small></div>; })}</div> : null}
              <div className="proposal-actions">
                {status === "pending" ? <><Button className="button-secondary" disabled={busyId === id} onClick={() => void review(proposal, "reject")}><X size={15} aria-hidden="true" />Reject</Button><Button className="button-primary" disabled={busyId === id} onClick={() => void review(proposal, "confirm")}><Check size={15} aria-hidden="true" />{busyId === id ? "Applying…" : kind === "schedule_change" ? "Confirm proposal" : "Confirm and apply"}</Button></> : <Button className="button-primary" disabled={busyId === id} onClick={() => void review(proposal, "commit_schedule")}><Check size={15} aria-hidden="true" />{busyId === id ? "Committing…" : "Commit confirmed schedule"}</Button>}
              </div>
              {group.superseded.length ? <div className="proposal-superseded">
                <button type="button" onClick={() => setExpandedGroups((current) => { const next = new Set(current); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; })} aria-expanded={expandedGroups.has(group.key)}>
                  {group.superseded.length} earlier version{group.superseded.length === 1 ? "" : "s"}
                </button>
                <Button className="button-quiet compact-button" disabled={Boolean(busyId)} onClick={() => void rejectSuperseded(group.superseded)}>Reject superseded</Button>
                {expandedGroups.has(group.key) ? <ul>{group.superseded.map((entry) => <li key={text(entry, "id")}>{formatDate(entry.createdAt, undefined, timeZone)}</li>)}</ul> : null}
              </div> : null}
            </Card>;
          })}
          {!groups.length ? <div className="review-empty-state"><ShieldCheck size={23} aria-hidden="true" /><div><h3>No change needs approval</h3><p>New high-impact proposals from authorized assistants will appear here before they affect current state.</p></div></div> : null}
        </div>
      </section>

      <div className="activity-ledger-layout">
        {state.modelRoutes.length ? <section className="activity-section activity-ai-ledger"><div className="section-heading"><div><h2>Why a cloud route was used</h2></div><GitBranch size={16} aria-hidden="true" /></div><div>{state.modelRoutes.slice(0, 20).map((route) => <article key={text(route, "id")}><div><Badge tone="blue">{formatLabel(text(route, "taskClass", "assistance"))}</Badge><time>{formatDate(route.createdAt, undefined, timeZone)}</time></div><h3>{text(route, "reason", "Selected by task capability, reliability, context, and cost policy.")}</h3><p>Provider choice and fallback use are retained in the audit record.</p></article>)}</div></section> : null}

        <section className="activity-section activity-event-ledger">
          <div className="section-heading">
            <div><h2>Recent durable events</h2></div>
            <label className="event-filter"><span className="sr-only">Filter events by type</span><select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}><option value="all">All event types</option>{eventTypes.map((type) => <option key={type} value={type}>{eventTypeLabel(type)}</option>)}</select></label>
          </div>
          <div>
            {visibleEvents.slice(0, 20).map((event) => <article key={text(event, "id")}><i /><div><Badge tone="neutral">{eventTypeLabel(text(event, "type", "event"))}</Badge><h3>{text(event, "summary")}</h3><time>{formatDate(event.occurredAt, undefined, timeZone)}</time></div></article>)}
            {!visibleEvents.length ? <div className="review-empty-state"><Clock3 size={23} aria-hidden="true" /><div><h3>{state.events.length ? "No event of that type yet" : "No durable event yet"}</h3><p>{state.events.length ? "Choose a different event type, or clear the filter to see everything." : "Completed work, accepted decisions, learning evidence, and assistant updates will appear here with provenance."}</p></div>{state.events.length ? <Button className="button-secondary compact-button" onClick={() => setEventFilter("all")}>Clear filter</Button> : null}</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
