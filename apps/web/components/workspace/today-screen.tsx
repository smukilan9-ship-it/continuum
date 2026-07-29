"use client";

import { ArrowRight, CalendarClock, Check, Clock3, FileCheck2, Link2, Play, Target } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { OnboardingFlow } from "./onboarding-flow";
import { PageHeader } from "./page-header";
import { formatDate, list, number, text, type Row, type WorkspaceState } from "./types";
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

/** Calendar day in the user's zone, so "today" means their today. */
function dayKey(instant: string | number | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
}

function clockTime(instant: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant));
}

const blockStart = (block: Row) => text(block, "start", text(block, "startsAt", ""));
const blockEnd = (block: Row) => text(block, "end", text(block, "endsAt", ""));

type BlockState = "done" | "now" | "upcoming" | "missed";

function blockState(block: Row, now: number): BlockState {
  if (text(block, "status") === "done") return "done";
  const start = Date.parse(blockStart(block));
  const end = Date.parse(blockEnd(block));
  if (Number.isFinite(start) && Number.isFinite(end) && now >= start && now < end) return "now";
  return Number.isFinite(end) && end <= now ? "missed" : "upcoming";
}

const STATE_LABEL: Record<BlockState, string> = { done: "Done", now: "Now", upcoming: "Queued", missed: "Missed" };

function durationMinutes(block: Row) {
  const minutes = Math.round((Date.parse(blockEnd(block)) - Date.parse(blockStart(block))) / 60_000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : undefined;
}

function daysUntil(target: string, now: number) {
  const days = Math.ceil((Date.parse(target) - now) / 86_400_000);
  return Number.isFinite(days) ? days : undefined;
}

export function TodayScreen({ state, userName, timeZone, serverNow, onNavigate, onRefresh }: { state: WorkspaceState; userName: string; timeZone: string; serverNow: string; onNavigate: (view: WorkspaceView) => void; onRefresh: () => Promise<void> }) {
  const now = Date.parse(serverNow);
  const nextTask = state.tasks.find((task) => text(task, "status") !== "done");
  const latestReceipt = state.receipts[0];
  const recentExternal = state.resourceActivities.find((activity) => !["verified", "abandoned"].includes(text(activity, "status")));

  // This screen used to render only `upcoming[0]` — one block out of a full
  // day's plan. The point of Today is the shape of the day, so every block on
  // the user's current calendar day is shown, in order, with its real state.
  const today = dayKey(serverNow, timeZone);
  const dayBlocks = state.schedule
    .filter((block) => blockStart(block) && dayKey(blockStart(block), timeZone) === today)
    .sort((left, right) => Date.parse(blockStart(left)) - Date.parse(blockStart(right)));
  const doneCount = dayBlocks.filter((block) => blockState(block, now) === "done").length;
  const plannedMinutes = dayBlocks.reduce((total, block) => total + (durationMinutes(block) ?? 0), 0);
  const nextBlock = dayBlocks.find((block) => blockState(block, now) === "now")
    ?? dayBlocks.find((block) => blockState(block, now) === "upcoming");

  const activeGoals = state.goals.filter((goal) => text(goal, "status", "active") === "active").slice(0, 4);

  if (!state.goals.length) return <OnboardingFlow userName={userName} onRefresh={onRefresh} onNavigate={onNavigate} />;

  return (
    <div className="screen">
      <PageHeader
        title={`Good ${greetingAt(serverNow, timeZone)}, ${userName}`}
        description="Resume from verified state, not from a blank chat. Your plan and connected assistants use the same current context."
        stats={[
          { label: "active goals", value: activeGoals.length },
          { label: "open tasks", value: state.tasks.filter((task) => text(task, "status") !== "done").length },
          { label: "projects", value: state.projects.length },
          { label: "receipts", value: state.receipts.length },
        ]}
      />

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

      <section className="today-grid">
        <Card className="day-card">
          <div className="card-heading-row">
            <div><p className="eyebrow">TODAY&apos;S PLAN</p><h2>{dayBlocks.length ? `${doneCount} of ${dayBlocks.length} done` : "Nothing scheduled"}</h2></div>
            <CalendarClock size={20} aria-hidden="true" />
          </div>

          {dayBlocks.length ? <>
            <p className="day-summary">
              <Clock3 size={13} aria-hidden="true" />
              {Math.round(plannedMinutes / 6) / 10}h planned
              {nextBlock
                ? ` · next at ${clockTime(blockStart(nextBlock), timeZone)}`
                : doneCount === dayBlocks.length ? " · all blocks finished" : " · nothing left scheduled today"}
            </p>
            <ol className="day-timeline">
              {dayBlocks.map((block) => {
                const status = blockState(block, now);
                const minutes = durationMinutes(block);
                return (
                  <li key={text(block, "id")} className={`day-block is-${status}`}>
                    <span className="day-time">{clockTime(blockStart(block), timeZone)}</span>
                    <span className="day-mark" aria-hidden="true">{status === "done" ? <Check size={10} /> : null}</span>
                    <div className="day-body">
                      <strong>{text(block, "title")}</strong>
                      <small>{text(block, "goalTitle", "Unlinked block")}{minutes ? ` · ${minutes} min` : ""}</small>
                    </div>
                    <span className={`day-state day-state-${status}`}>{STATE_LABEL[status]}</span>
                  </li>
                );
              })}
            </ol>
          </> : <>
            <p>No block is saved yet. Tell Continuum when you are actually free, then edit the draft before saving it.</p>
            <Button className="button-secondary" disabled={!nextTask} onClick={() => onNavigate("goals")}>Build my week<ArrowRight size={15} /></Button>
          </>}
        </Card>

        <Card className="goal-progress-card">
          <div className="card-heading-row">
            <div><p className="eyebrow">GOALS</p><h2>Where you stand</h2></div>
            <Target size={20} aria-hidden="true" />
          </div>
          {activeGoals.length ? <>
            <ul className="goal-progress-list">
              {activeGoals.map((goal) => {
                const progress = Math.round(number(goal, "progress") * 100);
                const days = daysUntil(text(goal, "targetDate", ""), now);
                return (
                  <li key={text(goal, "id")}>
                    <div className="goal-progress-head">
                      <strong>{text(goal, "title")}</strong>
                      <b>{progress}%</b>
                    </div>
                    <div className="goal-progress-bar"><i style={{ width: `${Math.max(2, progress)}%` }} /></div>
                    {days !== undefined ? <small className={days <= 14 ? "is-soon" : ""}>{days > 0 ? `${days} days left` : days === 0 ? "Due today" : `${Math.abs(days)} days overdue`}</small> : null}
                  </li>
                );
              })}
            </ul>
            <Button className="button-secondary" onClick={() => onNavigate("goals")}>Open plan<ArrowRight size={15} /></Button>
          </> : <p>No active goal. Add one so Continuum can choose a next action for you.</p>}
        </Card>
      </section>

      <Card className="resume-card">
        <div className="card-heading-row"><div><p className="eyebrow">RESUME WHERE YOU STOPPED</p><h2>{recentExternal ? "External work is waiting" : latestReceipt ? "Latest checkpoint" : "No checkpoint yet"}</h2></div><Link2 size={20} /></div>
        {recentExternal ? <><p>You started an external resource and have not completed its return check.</p><Button className="button-secondary" onClick={() => onNavigate("learn")}>Resume handoff<ArrowRight size={15} /></Button></> : latestReceipt ? <><p>{text(latestReceipt, "summary")}</p>{list(latestReceipt, "nextActions").length ? <ul>{list(latestReceipt, "nextActions").slice(0, 3).map((action) => <li key={action}>{action}</li>)}</ul> : null}<span className="subtle-meta">Saved {formatDate(latestReceipt.createdAt, undefined, timeZone)}</span></> : <p>Completing a session in Continuum or through MCP creates a compact receipt with decisions, evidence, unresolved questions, and next actions.</p>}
      </Card>
    </div>
  );
}
