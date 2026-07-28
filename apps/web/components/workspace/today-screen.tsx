"use client";

import { ArrowRight, CalendarClock, Clock3, FileCheck2, Link2, Play, Target } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { OnboardingFlow } from "./onboarding-flow";
import { PageHeader } from "./page-header";
import { formatDate, list, text, type Row, type WorkspaceState } from "./types";
import type { WorkspaceView } from "@/lib/workspace-routes";

// Raw internal ids leaked into user copy ("…after verified resource activity
// activity_d61e36a01a9e4275aa1c3368"). They belong in the technical disclosure.
const INTERNAL_ID = /\b(?:activity|task|goal|receipt|block|concept|project|record|event)_[a-z0-9]{8,}\b/gi;

function humanReason(value: string) {
  return value.replace(INTERNAL_ID, "").replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
}

function technicalIds(row: Row) {
  const source = `${text(row, "description")} ${text(row, "completionEvidence")} ${text(row, "id")}`;
  return [...new Set(source.match(INTERNAL_ID) ?? [])];
}

function greetingAt(instant: string, timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(new Date(instant)));
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

export function TodayScreen({ state, userName, timeZone, serverNow, onNavigate, onRefresh }: { state: WorkspaceState; userName: string; timeZone: string; serverNow: string; onNavigate: (view: WorkspaceView) => void; onRefresh: () => Promise<void> }) {
  const nextTask = state.tasks.find((task) => text(task, "status") !== "done");
  const upcoming = state.schedule.filter((block) => new Date(text(block, "end", text(block, "endsAt", "0"))).valueOf() > Date.parse(serverNow));
  const nextBlock = upcoming[0];
  const latestReceipt = state.receipts[0];
  const recentExternal = state.resourceActivities.find((activity) => !["verified", "abandoned"].includes(text(activity, "status")));
  if (!state.goals.length) return <OnboardingFlow userName={userName} onRefresh={onRefresh} onNavigate={onNavigate} />;

  return (
    <div className="screen">
      <PageHeader
        title={`Good ${greetingAt(serverNow, timeZone)}, ${userName}`}
        description="Resume from verified state, not from a blank chat. Your plan and connected assistants use the same current context."
        stats={[
          { label: "active goals", value: state.goals.filter((goal) => text(goal, "status", "active") === "active").length },
          { label: "open tasks", value: state.tasks.filter((task) => text(task, "status") !== "done").length },
          { label: "projects", value: state.projects.length },
          { label: "receipts", value: state.receipts.length },
        ]}
      />

      <section className="today-grid">
        {/* The single primary element on this screen. "At a glance" moved into the
            page header so it no longer competes with the next action. */}
        <Card className="next-action-card">
          <div className="card-kicker"><Target size={16} aria-hidden="true" /><span>Best next action</span></div>
          <h2>{nextTask ? text(nextTask, "title") : "Choose the next outcome"}</h2>
          <p>{humanReason(nextTask ? text(nextTask, "description", text(nextTask, "completionEvidence", "Complete the task and record evidence.")) : "No unfinished task is recorded. Add a task to an active goal.")}</p>
          {nextTask ? <div className="action-evidence"><FileCheck2 size={15} aria-hidden="true" /><span>{humanReason(text(nextTask, "completionEvidence", "Record completion evidence"))}</span></div> : null}
          <Button className="button-primary button-large" onClick={() => onNavigate(nextTask ? "learn" : "goals")}><Play size={16} aria-hidden="true" />{nextTask ? "Find the best resource" : "Open goals"}</Button>
          {nextTask && technicalIds(nextTask).length ? <details className="today-technical"><summary>Technical details</summary><p>{technicalIds(nextTask).join(" · ")}</p></details> : null}
        </Card>

        <Card className="schedule-card">
          <div className="card-heading-row"><div><p className="eyebrow">SCHEDULE</p><h2>{nextBlock ? "Next block" : "Plan your work"}</h2></div><CalendarClock size={20} /></div>
          {nextBlock ? <div className="next-block"><strong>{text(nextBlock, "title")}</strong><span><Clock3 size={14} />{formatDate(nextBlock.start ?? nextBlock.startsAt, undefined, timeZone)}</span><small>{text(nextBlock, "completionEvidence", "Completion evidence required")}</small></div> : <p>No block is saved yet. Tell Continuum when you are actually free, then edit the draft before saving it.</p>}
          {!nextBlock ? <Button className="button-secondary" disabled={!nextTask} onClick={() => onNavigate("goals")}>Build my week<ArrowRight size={15} /></Button> : null}
        </Card>

        <Card className="resume-card">
          <div className="card-heading-row"><div><p className="eyebrow">RESUME WHERE YOU STOPPED</p><h2>{recentExternal ? "External work is waiting" : latestReceipt ? "Latest checkpoint" : "No checkpoint yet"}</h2></div><Link2 size={20} /></div>
          {recentExternal ? <><p>You started an external resource and have not completed its return check.</p><Button className="button-secondary" onClick={() => onNavigate("learn")}>Resume handoff<ArrowRight size={15} /></Button></> : latestReceipt ? <><p>{text(latestReceipt, "summary")}</p>{list(latestReceipt, "nextActions").length ? <ul>{list(latestReceipt, "nextActions").slice(0, 3).map((action) => <li key={action}>{action}</li>)}</ul> : null}<span className="subtle-meta">Saved {formatDate(latestReceipt.createdAt, undefined, timeZone)}</span></> : <p>Completing a session in Continuum or through MCP creates a compact receipt with decisions, evidence, unresolved questions, and next actions.</p>}
        </Card>
      </section>
    </div>
  );
}
