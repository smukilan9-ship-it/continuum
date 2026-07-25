"use client";

import { Check, Clock3, GitBranch, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { PageIntro } from "./page-intro";
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

export function ActivityScreen({ state, timeZone, showToast, onRefresh }: { state: WorkspaceState; timeZone: string; showToast: Toast; onRefresh: () => Promise<void> }) {
  const [busyId, setBusyId] = useState("");
  const proposals = useMemo(() => state.proposals.filter((proposal) => ["pending", "confirmed"].includes(text(proposal, "status", "pending"))), [state.proposals]);

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
      <PageIntro eyebrow="REVIEW" title="Nothing consequential changes behind your back." description="Assistant writes are auditable. High-impact changes begin as proposals, and schedule changes require a separate confirmation and commit." />

      <section className="activity-trust-strip" aria-label="Review summary">
        <div><span><ShieldCheck size={17} /></span><strong>{proposals.length}</strong><small>changes needing attention</small></div>
        <div><span><GitBranch size={17} /></span><strong>{state.modelRoutes.length}</strong><small>AI assists audited</small></div>
        <div><span><Clock3 size={17} /></span><strong>{state.events.length}</strong><small>durable audit events</small></div>
      </section>

      <section className="activity-section">
        <div className="section-heading"><div><p className="eyebrow">REVIEW QUEUE</p><h2>Proposed assistant updates</h2></div></div>
        <div className="proposal-list">
          {proposals.map((proposal) => {
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
                {status === "pending" ? <><Button className="button-secondary" disabled={busyId === id} onClick={() => void review(proposal, "reject")}><X size={15} />Reject</Button><Button className="button-primary" disabled={busyId === id} onClick={() => void review(proposal, "confirm")}><Check size={15} />{busyId === id ? "Applying…" : kind === "schedule_change" ? "Confirm proposal" : "Confirm and apply"}</Button></> : <Button className="button-primary" disabled={busyId === id} onClick={() => void review(proposal, "commit_schedule")}><Check size={15} />{busyId === id ? "Committing…" : "Commit confirmed schedule"}</Button>}
              </div>
            </Card>;
          })}
          {!proposals.length ? <div className="review-empty-state"><ShieldCheck size={23} /><div><h3>No change needs approval</h3><p>New high-impact proposals from authorized assistants will appear here before they affect current state.</p></div></div> : null}
        </div>
      </section>

      <div className="activity-ledger-layout">
        {state.modelRoutes.length ? <section className="activity-section activity-ai-ledger"><div className="section-heading"><div><p className="eyebrow">AI ASSISTANCE</p><h2>Why a cloud route was used</h2></div></div><div>{state.modelRoutes.slice(0, 20).map((route) => <article key={text(route, "id")}><div><Badge tone="blue">{formatLabel(text(route, "taskClass", "assistance"))}</Badge><time>{formatDate(route.createdAt, undefined, timeZone)}</time></div><h3>{text(route, "reason", "Selected by task capability, reliability, context, and cost policy.")}</h3><p>Provider choice and fallback use are retained in the audit record.</p></article>)}</div></section> : null}

        <section className="activity-section activity-event-ledger"><div className="section-heading"><div><p className="eyebrow">AUDIT TRAIL</p><h2>Recent durable events</h2></div></div><div>{state.events.slice(0, 20).map((event) => <article key={text(event, "id")}><i /><div><Badge tone="neutral">{eventTypeLabel(text(event, "type", "event"))}</Badge><h3>{text(event, "summary")}</h3><time>{formatDate(event.occurredAt, undefined, timeZone)}</time></div></article>)}{!state.events.length ? <div className="review-empty-state"><Clock3 size={23} /><div><h3>No durable event yet</h3><p>Completed work, accepted decisions, learning evidence, and assistant updates will appear here with provenance.</p></div></div> : null}</div></section>
      </div>
    </div>
  );
}
