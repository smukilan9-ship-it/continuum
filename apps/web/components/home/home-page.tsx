"use client";

import { ArrowRight, CalendarClock, Check, CircleDot, MessageSquare, Play, SquareTerminal } from "lucide-react";
import { useMemo, useState } from "react";

import { Button, EmptyState, Menu, ProgressBar, StatusChip } from "@/components/ui";
import { plainCopy as plain } from "@/lib/user-copy";
import type { WorkspaceView } from "@/lib/workspace-routes";

import { OnboardingFlow } from "../workspace/onboarding-flow";
import { formatDate, list, number, text, type Row, type WorkspaceState } from "../workspace/types";
import "./home.css";

function greetingAt(instant: string, timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(new Date(instant)));
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

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
const STATE_TONE = { done: "success", now: "info", upcoming: "neutral", missed: "warning" } as const;

function durationMinutes(block: Row | undefined) {
  if (!block) return undefined;
  const minutes = Math.round((Date.parse(blockEnd(block)) - Date.parse(blockStart(block))) / 60_000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : undefined;
}

function daysUntil(target: string, now: number) {
  const days = Math.ceil((Date.parse(target) - now) / 86_400_000);
  return Number.isFinite(days) ? days : undefined;
}

function deadlineLabel(days: number | undefined) {
  if (days === undefined) return undefined;
  if (days > 1) return `${days} days left`;
  if (days === 1) return "Due tomorrow";
  if (days === 0) return "Due today";
  return `${Math.abs(days)} days overdue`;
}

/**
 * §9.4: the next action states which goal it belongs to and gives one reason.
 * The reason is derived from real state — a named weak concept, a deadline, or
 * a scheduled block — and is omitted entirely rather than invented when none of
 * those hold.
 */
function reasonFor(task: Row, goal: Row | undefined, block: Row | undefined, timeZone: string) {
  const clauses: string[] = [];
  const weakest = text(task, "weakestDimension");
  if (weakest) clauses.push(`${weakest} is your weakest area`);
  const days = daysUntil(text(task, "deadline", text(goal, "targetDate", "")), Date.now());
  if (days !== undefined && days <= 7) clauses.push(days <= 0 ? "it is due now" : `it is due in ${days} day${days === 1 ? "" : "s"}`);
  if (block) clauses.push(`it is scheduled at ${clockTime(blockStart(block), timeZone)}`);
  if (!clauses.length) return undefined;
  const sentence = clauses.length === 1 ? clauses[0] : `${clauses.slice(0, -1).join(", ")} and ${clauses.at(-1)}`;
  return `Because ${sentence}.`;
}

type ResumeItem = { id: string; icon: React.ReactNode; label: string; detail: string; view: WorkspaceView };

export function HomePage({
  state,
  userName,
  timeZone,
  serverNow,
  onNavigate,
  onRefresh,
}: {
  state: WorkspaceState;
  userName: string;
  timeZone: string;
  serverNow: string;
  onNavigate: (view: WorkspaceView) => void;
  onRefresh: () => Promise<void>;
}) {
  const now = Date.parse(serverNow);
  const [snoozed, setSnoozed] = useState<string[]>([]);

  const openTasks = useMemo(
    () => state.tasks.filter((task) => text(task, "status") !== "done" && !snoozed.includes(text(task, "id"))),
    [state.tasks, snoozed],
  );
  const nextTask = openTasks[0];
  const nextGoal = state.goals.find((goal) => text(goal, "id") === text(nextTask, "goalId"));

  const today = dayKey(serverNow, timeZone);
  const dayBlocks = useMemo(
    () => state.schedule
      .filter((block) => blockStart(block) && dayKey(blockStart(block), timeZone) === today)
      .sort((left, right) => Date.parse(blockStart(left)) - Date.parse(blockStart(right))),
    [state.schedule, timeZone, today],
  );

  const doneCount = dayBlocks.filter((block) => blockState(block, now) === "done").length;
  const plannedMinutes = dayBlocks.reduce((total, block) => total + (durationMinutes(block) ?? 0), 0);
  const taskBlock = dayBlocks.find((block) => text(block, "taskId") === text(nextTask, "id"));

  const activeGoals = useMemo(
    () => state.goals
      .filter((goal) => text(goal, "status", "active") === "active")
      .sort((left, right) => Date.parse(text(left, "targetDate", "9999")) - Date.parse(text(right, "targetDate", "9999"))),
    [state.goals],
  );

  /** §9.4: three sources, newest first, capped at three rows. */
  const resumeItems = useMemo<ResumeItem[]>(() => {
    const items: ResumeItem[] = [];
    const activity = state.resourceActivities.find((entry) => !["verified", "abandoned"].includes(text(entry, "status")));
    if (activity) {
      items.push({ id: text(activity, "id"), icon: <Play size={15} />, label: text(activity, "title", "Material you started"), detail: "You started this and haven't recorded what came of it", view: "learn" });
    }
    const conversation = state.assistantSessions.find((session) => number(session, "messageCount", 1) >= 1);
    if (conversation) {
      items.push({ id: text(conversation, "id"), icon: <MessageSquare size={15} />, label: text(conversation, "title", "A conversation"), detail: "Continue where the thread left off", view: "assistant" });
    }
    const receipt = state.receipts.find((entry) => list(entry, "unresolvedQuestions").length);
    if (receipt) {
      const question = list(receipt, "unresolvedQuestions")[0] ?? "";
      items.push({ id: text(receipt, "id"), icon: <CircleDot size={15} />, label: plain(question) || "An open question", detail: `From your session on ${formatDate(receipt.createdAt, { dateStyle: "medium" }, timeZone)}`, view: "research" });
    }
    const codeSession = state.events.find((event) => text(event, "type").startsWith("code"));
    if (codeSession && items.length < 3) {
      items.push({ id: text(codeSession, "id"), icon: <SquareTerminal size={15} />, label: plain(text(codeSession, "summary", "Your last code session")), detail: "Pick the file back up", view: "code" });
    }
    return items.slice(0, 3);
  }, [state.resourceActivities, state.assistantSessions, state.receipts, state.events, timeZone]);

  if (!state.goals.length) return <OnboardingFlow userName={userName} onRefresh={onRefresh} onNavigate={onNavigate} />;

  /** Route by task type (§9.4) rather than always sending the user to Learn. */
  function startNext() {
    if (!nextTask) return onNavigate("goals");
    const kind = `${text(nextTask, "kind")} ${text(nextTask, "title")}`.toLowerCase();
    if (/code|program|script|implement|debug/.test(kind)) return onNavigate("code");
    if (/paper|research|read|source|cite/.test(kind)) return onNavigate("research");
    return onNavigate("learn");
  }

  const everythingDone = !nextTask && dayBlocks.length > 0 && doneCount === dayBlocks.length;
  const reason = nextTask ? reasonFor(nextTask, nextGoal, taskBlock, timeZone) : undefined;

  return (
    <div className="home">
      {/* No stat strip. The four-number header competed with the work (C20). */}
      <header className="home-head">
        <h1>Good {greetingAt(serverNow, timeZone)}, {userName}</h1>
        <p>{new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date(serverNow))}</p>
      </header>

      <div className="home-layout">
        <div className="home-main">
          {/* The ONLY accent element on this page (AC-H1). */}
          <section className="next-action" aria-labelledby="next-action-heading">
            <p className="eyebrow" id="next-action-heading">Next</p>
            {nextTask ? (
              <>
                <h2>{plain(text(nextTask, "title"))}</h2>
                <p className="next-action-context">
                  {[text(nextGoal, "title"), durationMinutes(taskBlock) ? `${durationMinutes(taskBlock)} min` : undefined, deadlineLabel(daysUntil(text(nextTask, "deadline", ""), now))]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {reason ? <p className="next-action-reason">{reason}</p> : null}
                <div className="next-action-actions">
                  <Button variant="primary" onClick={startNext}><Play size={15} aria-hidden="true" />Start</Button>
                  <Menu
                    label="Other options for this task"
                    align="start"
                    trigger={<Button variant="quiet">Not now</Button>}
                    items={[
                      { label: "Snooze to tonight", onSelect: () => setSnoozed((current) => [...current, text(nextTask, "id")]) },
                      { label: "Do something else", onSelect: () => onNavigate("goals") },
                      { label: "Mark done", onSelect: () => onNavigate("goals") },
                    ]}
                  />
                </div>
              </>
            ) : everythingDone ? (
              <>
                <h2>You&apos;re done for today.</h2>
                <p className="next-action-context">{dayBlocks.length} block{dayBlocks.length === 1 ? "" : "s"} finished.</p>
                <div className="next-action-actions"><Button variant="secondary" onClick={() => onNavigate("goals")}>Look at tomorrow<ArrowRight size={15} /></Button></div>
              </>
            ) : (
              <>
                <h2>Nothing scheduled.</h2>
                <p className="next-action-context">Tell Continuum when you&apos;re free and it will draft a week from your real deadlines.</p>
                <div className="next-action-actions"><Button variant="secondary" onClick={() => onNavigate("goals")}>Build my week<ArrowRight size={15} /></Button></div>
              </>
            )}
          </section>

          {resumeItems.length ? (
            <section className="home-section" aria-labelledby="resume-heading">
              <h2 id="resume-heading">Pick up where you left off</h2>
              <ul className="resume-list">
                {resumeItems.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => onNavigate(item.view)}>
                      <span className="resume-icon" aria-hidden="true">{item.icon}</span>
                      <span className="resume-copy">
                        <strong>{item.label}</strong>
                        <small>{item.detail}</small>
                      </span>
                      <ArrowRight size={15} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="home-section" aria-labelledby="week-heading">
            <div className="home-section-head">
              <h2 id="week-heading">This week</h2>
              <button type="button" className="home-link" onClick={() => onNavigate("goals")}>Open plan<ArrowRight size={13} /></button>
            </div>
            <p className="week-summary">
              {Math.round(plannedMinutes / 6) / 10}h scheduled today · {doneCount} of {dayBlocks.length} done
            </p>
          </section>
        </div>

        <aside className="home-rail">
          <section aria-labelledby="today-heading">
            <div className="home-section-head">
              <h2 id="today-heading">Today</h2>
              <CalendarClock size={16} aria-hidden="true" />
            </div>
            {dayBlocks.length ? (
              <ol className="day-agenda">
                {dayBlocks.slice(0, 4).map((block) => {
                  const status = blockState(block, now);
                  return (
                    <li key={text(block, "id")} className={`agenda-block is-${status}`}>
                      <span className="agenda-time">{clockTime(blockStart(block), timeZone)}</span>
                      <span className="agenda-copy">
                        <strong>{plain(text(block, "title"))}</strong>
                        <small>{text(block, "goalTitle", "Unlinked")}</small>
                      </span>
                      <StatusChip tone={STATE_TONE[status]} label={STATE_LABEL[status]} icon={status === "done" ? <Check size={11} /> : undefined} />
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState title="Nothing scheduled today" body="Build a week from your real deadlines." action={<Button variant="secondary" size="sm" onClick={() => onNavigate("goals")}>Build my week</Button>} />
            )}
            {dayBlocks.length > 4 ? <button type="button" className="home-link" onClick={() => onNavigate("goals")}>See all {dayBlocks.length}<ArrowRight size={13} /></button> : null}
          </section>

          <section aria-labelledby="goals-heading">
            <div className="home-section-head">
              <h2 id="goals-heading">Goals</h2>
            </div>
            <ul className="goal-rail">
              {activeGoals.map((goal) => {
                const progress = Math.round(number(goal, "progress") * 100);
                const label = deadlineLabel(daysUntil(text(goal, "targetDate", ""), now));
                return (
                  <li key={text(goal, "id")}>
                    <button type="button" onClick={() => onNavigate("goals")}>
                      <span className="goal-rail-head">
                        <strong>{text(goal, "title")}</strong>
                        <b>{progress}%</b>
                      </span>
                      <ProgressBar value={progress} label={`${text(goal, "title")} progress`} size={2} />
                      {label ? <small>{label}</small> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
