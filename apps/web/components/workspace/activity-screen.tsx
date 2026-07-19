"use client";

import { Check, Clock3, GitBranch, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";
import { PageIntro } from "./page-intro";
import { formatDate, text, type Row, type WorkspaceState } from "./types";

type Toast = (message: string | null) => void;

function changes(proposal: Row) {
  const payload = proposal.payload;
  if (!payload || typeof payload !== "object") return [];
  const next = (payload as Row).changes;
  return next && typeof next === "object" ? Object.entries(next as Row) : [];
}

export function ActivityScreen({ state, showToast }: { state: WorkspaceState; showToast: Toast }) {
  const router = useRouter();
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
      router.refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The proposal could not be reviewed");
      setBusyId("");
    }
  }

  return (
    <div className="screen">
      <PageIntro eyebrow="ACTIVITY" title="Review changes and understand every automated decision." description="Assistant writes are auditable. High-impact changes begin as proposals, and schedule changes require a separate confirmation and commit." />

      <section className="activity-summary">
        <Card><span><ShieldCheck size={18} /></span><div><strong>{proposals.length}</strong><small>changes needing attention</small></div></Card>
        <Card><span><GitBranch size={18} /></span><div><strong>{state.modelRoutes.length}</strong><small>recorded model routes</small></div></Card>
        <Card><span><Clock3 size={18} /></span><div><strong>{state.events.length}</strong><small>durable audit events</small></div></Card>
      </section>

      <section className="activity-section">
        <div className="section-heading"><div><p className="eyebrow">REVIEW QUEUE</p><h2>Proposed assistant updates</h2></div></div>
        <div className="proposal-list">
          {proposals.map((proposal) => {
            const status = text(proposal, "status", "pending");
            const kind = text(proposal, "kind", "change");
            const id = text(proposal, "id");
            return <Card className="proposal-card" key={id}>
              <div className="proposal-header"><div><Badge tone={text(proposal, "risk") === "high" ? "orange" : "blue"}>{text(proposal, "risk", "medium")} risk</Badge><Badge tone="neutral">{kind.replaceAll("_", " ")}</Badge></div><span>{formatDate(proposal.createdAt)}</span></div>
              <h3>{text(proposal, "summary", "Assistant-proposed update")}</h3>
              {changes(proposal).length ? <dl>{changes(proposal).slice(0, 8).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value)}</dd></div>)}</dl> : <p>The proposed payload is preserved in the audit ledger. Review the summary before applying it.</p>}
              <div className="proposal-actions">
                {status === "pending" ? <><Button className="button-secondary" disabled={busyId === id} onClick={() => void review(proposal, "reject")}><X size={15} />Reject</Button><Button className="button-primary" disabled={busyId === id} onClick={() => void review(proposal, "confirm")}><Check size={15} />{busyId === id ? "Applying…" : kind === "schedule_change" ? "Confirm proposal" : "Confirm and apply"}</Button></> : <Button className="button-primary" disabled={busyId === id} onClick={() => void review(proposal, "commit_schedule")}><Check size={15} />{busyId === id ? "Committing…" : "Commit confirmed schedule"}</Button>}
              </div>
            </Card>;
          })}
          {!proposals.length ? <Card className="empty-record"><ShieldCheck size={24} /><h3>No change needs approval</h3><p>New high-impact proposals from authorized assistants will appear here before they affect current state.</p></Card> : null}
        </div>
      </section>

      {state.modelRoutes.length ? <section className="activity-section"><div className="section-heading"><div><p className="eyebrow">MODEL ROUTING</p><h2>Why each model was selected</h2></div></div><div className="memory-list">{state.modelRoutes.slice(0, 20).map((route) => <Card className="memory-row" key={text(route, "id")}><div><Badge tone="blue">{text(route, "provider")}</Badge><h3>{text(route, "model")}</h3><p>{text(route, "reason", "Selected by task capability, reliability, context, and cost policy.")}</p></div><span>{formatDate(route.createdAt)}</span></Card>)}</div></section> : null}

      <section className="activity-section"><div className="section-heading"><div><p className="eyebrow">AUDIT TRAIL</p><h2>Recent durable events</h2></div></div><div className="memory-list">{state.events.slice(0, 50).map((event) => <Card className="memory-row" key={text(event, "id")}><div><Badge tone="neutral">{text(event, "type", "event").replaceAll(".", " ")}</Badge><h3>{text(event, "summary")}</h3><p>{formatDate(event.occurredAt)}</p></div></Card>)}{!state.events.length ? <Card className="empty-record"><Clock3 size={24} /><h3>No durable event yet</h3><p>Completed work, accepted decisions, learning evidence, and assistant updates will appear here with provenance.</p></Card> : null}</div></section>
    </div>
  );
}
