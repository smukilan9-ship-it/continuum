"use client";

import type { ScheduleProposal } from "@continuum/schemas";
import { AlertTriangle, CalendarClock, CalendarDays, Check, Circle, Clock3, Flag, ListTodo, LockKeyhole, Plus, Sparkles, Target, WandSparkles } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { PageIntro } from "./page-intro";
import { formatLabel, priorityLabel, statusTone } from "@/lib/labels";
import { formatDate, number, postState, text, type Row, type WorkspaceState } from "./types";

type Toast = (message: string | null) => void;
type PlanView = "week" | "goals" | "backlog";
type ScheduleItem = { id: string; taskId: string; time: string; end: string; duration: number; title: string; status: string; evidence: string; reason: string };
type ProposalResponse = { proposal: ScheduleProposal; proposalId?: string; items: ScheduleItem[]; assumptions: string[]; error?: string };

function isoValue(row: Row, key: string) {
  const value = row[key];
  return value instanceof Date ? value.toISOString() : typeof value === "string" ? value : "";
}

function dayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dateRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => new Date(start.getTime() + index * 24 * 3600_000));
}

export function GoalsScreen({ state, showToast, onRefresh }: { state: WorkspaceState; showToast: Toast; onRefresh: () => Promise<void> }) {
  const [form, setForm] = useState<"goal" | "task">();
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<PlanView>("week");
  const [selectedGoalId, setSelectedGoalId] = useState(text(state.goals[0], "id"));
  const [proposal, setProposal] = useState<ProposalResponse>();
  const [proposalBusy, setProposalBusy] = useState(false);
  const week = useMemo(dateRange, []);
  const selectedGoal = state.goals.find((goal) => text(goal, "id") === selectedGoalId) ?? state.goals[0];
  const activeTasks = state.tasks.filter((task) => text(task, "status") !== "done");
  const committedMinutes = state.schedule.reduce((total, item) => {
    const start = Date.parse(isoValue(item, "startsAt") || isoValue(item, "start"));
    const end = Date.parse(isoValue(item, "endsAt") || isoValue(item, "end"));
    return total + (Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 60_000)) : 0);
  }, 0);

  async function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await postState("goal.created", "Created a goal in the standalone app.", { title: String(data.get("title")), outcome: String(data.get("outcome")), date: String(data.get("date")) });
      setForm(undefined);
      showToast("Goal saved to the shared academic state.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The goal could not be saved"); }
    finally { setBusy(false); }
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const deadline = String(data.get("deadline"));
    try {
      await postState("task.created", "Created a goal-linked task in the standalone app.", { goalId: String(data.get("goalId")), title: String(data.get("title")), description: String(data.get("description")) || undefined, estimatedMinutes: Number(data.get("estimatedMinutes")), deadline: deadline ? new Date(deadline).toISOString() : undefined, priority: Number(data.get("priority")), completionEvidence: String(data.get("completionEvidence")) || undefined });
      setForm(undefined);
      showToast("Task saved. It is available to the scheduler and connected assistants.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The task could not be saved"); }
    finally { setBusy(false); }
  }

  async function completeTask(taskId: string) {
    setBusy(true);
    try {
      await postState("task.progress.recorded", "Marked a task complete in the standalone app.", { entityId: taskId, status: "done" });
      showToast("Task completed and recorded in shared state.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The task could not be updated"); }
    finally { setBusy(false); }
  }

  async function generatePlan() {
    setProposalBusy(true);
    try {
      const response = await fetch("/api/schedule", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "propose" }) });
      const body = await response.json() as ProposalResponse;
      if (!response.ok) throw new Error(body.error ?? "A schedule proposal could not be generated.");
      setProposal(body);
      showToast("Draft generated. Nothing changed until you confirm it.");
    } catch (error) { showToast(error instanceof Error ? error.message : "A schedule proposal could not be generated."); }
    finally { setProposalBusy(false); }
  }

  async function commitPlan() {
    if (!proposal?.proposalId) return;
    setProposalBusy(true);
    try {
      const response = await fetch("/api/schedule", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "commit", proposalId: proposal.proposalId, confirmedAt: new Date().toISOString() }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The proposed schedule could not be committed.");
      setProposal(undefined);
      showToast("Schedule committed after your explicit confirmation.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The proposed schedule could not be committed."); }
    finally { setProposalBusy(false); }
  }

  return (
    <div className="screen plan-screen premium-screen">
      <PageIntro eyebrow="PLAN" title="A week that respects real life." description="See commitments and study blocks together, keep every task tied to an outcome, and approve schedule changes before they become current." action={<><Button className="button-secondary" onClick={() => setForm(form === "task" ? undefined : "task")} disabled={!state.goals.length}><Plus size={16} />New task</Button><Button className="button-primary" onClick={() => setForm(form === "goal" ? undefined : "goal")}><Plus size={16} />New goal</Button></>} />

      <div className="plan-toolbar"><div className="plan-view-tabs" aria-label="Plan views"><button className={view === "week" ? "active" : ""} onClick={() => setView("week")}><CalendarDays size={15} />Week</button><button className={view === "goals" ? "active" : ""} onClick={() => setView("goals")}><Target size={15} />Goals</button><button className={view === "backlog" ? "active" : ""} onClick={() => setView("backlog")}><ListTodo size={15} />Backlog</button></div><div className="plan-toolbar-meta"><span><strong>{Math.round(committedMinutes / 60 * 10) / 10}h</strong> scheduled</span><span><strong>{activeTasks.length}</strong> active tasks</span><Button className="button-secondary compact-button" disabled={proposalBusy || !activeTasks.length} onClick={() => void generatePlan()}>{proposalBusy ? <Sparkles className="spin" size={14} /> : <WandSparkles size={14} />}Draft my week</Button></div></div>

      <section className="calendar-strip plan-calendar-strip"><div><CalendarClock size={19} /><div><strong>Calendar constraints</strong><span>{state.calendarConstraints.length ? `${state.calendarConstraints.length} upcoming commitment${state.calendarConstraints.length === 1 ? "" : "s"} protect this plan from collisions.` : "Connect Google Calendar so classes and commitments become hard planning constraints."}</span></div></div><a href="/integrations#google-calendar">{state.calendarConstraints.length ? "Manage calendar" : "Connect calendar"}</a></section>

      {form === "goal" ? <Card className="inline-form-card"><div className="inline-form-heading"><div><h2>Create a goal</h2><p>Define the outcome before creating work.</p></div><button onClick={() => setForm(undefined)}>Cancel</button></div><form className="workspace-form form-grid" onSubmit={submitGoal}><label>Goal title<input name="title" required minLength={3} maxLength={120} placeholder="Complete the statistics module" /></label><label>Target date<input name="date" type="date" required /></label><label className="full-field">Successful outcome<textarea name="outcome" required minLength={3} maxLength={500} placeholder="Pass the final assessment and explain each core method" /></label><div className="form-actions"><Button className="button-primary" disabled={busy}>{busy ? "Saving…" : "Save goal"}</Button></div></form></Card> : null}

      {form === "task" ? <Card className="inline-form-card"><div className="inline-form-heading"><div><h2>Add a task</h2><p>Give the scheduler enough information to place real work.</p></div><button onClick={() => setForm(undefined)}>Cancel</button></div><form className="workspace-form form-grid" onSubmit={submitTask}><label>Goal<select name="goalId" required defaultValue={selectedGoalId}>{state.goals.map((goal) => <option key={text(goal, "id")} value={text(goal, "id")}>{text(goal, "title")}</option>)}</select></label><label>Task title<input name="title" required minLength={3} maxLength={200} /></label><label className="full-field">Description<input name="description" maxLength={500} placeholder="What specifically needs to happen?" /></label><label>Estimated minutes<input name="estimatedMinutes" type="number" min="5" max="1440" defaultValue="30" required /></label><label>Deadline<input name="deadline" type="datetime-local" /></label><label>Priority<select name="priority" defaultValue="3"><option value="5">Highest</option><option value="4">High</option><option value="3">Normal</option><option value="2">Low</option><option value="1">Lowest</option></select></label><label>Completion evidence<input name="completionEvidence" maxLength={500} placeholder="Pass two unseen problems" /></label><div className="form-actions"><Button className="button-primary" disabled={busy}>{busy ? "Saving…" : "Save task"}</Button></div></form></Card> : null}

      {proposal ? <Card className="schedule-proposal-card"><header><div><div className="plan-kicker"><WandSparkles size={15} />DRAFT — NOT CURRENT YET</div><h2>Review {proposal.items.length} proposed study block{proposal.items.length === 1 ? "" : "s"}</h2></div><Badge tone="orange"><LockKeyhole size={12} />Confirmation required</Badge></header><div className="proposal-blocks">{proposal.items.slice(0, 8).map((item) => <div key={item.id}><span><strong>{item.time}</strong><small>{item.duration} min</small></span><div><strong>{item.title}</strong><small>{item.evidence}</small></div></div>)}</div>{proposal.proposal.unscheduledTaskIds.length ? <div className="proposal-warning"><AlertTriangle size={16} />{proposal.proposal.unscheduledTaskIds.length} task{proposal.proposal.unscheduledTaskIds.length === 1 ? "" : "s"} need more capacity.</div> : null}<footer><div>{proposal.assumptions.map((assumption) => <span key={assumption}>• {assumption}</span>)}</div><button className="ghost-action" onClick={() => setProposal(undefined)}>Discard draft</button><Button className="button-primary" disabled={proposalBusy || !proposal.proposalId} onClick={() => void commitPlan()}><Check size={15} />Confirm and commit</Button></footer></Card> : null}

      {view === "week" ? <section className="week-board" aria-label="Seven day plan">{week.map((day, index) => { const key = dayKey(day); const schedule = state.schedule.filter((item) => dayKey(isoValue(item, "startsAt") || isoValue(item, "start")) === key); const constraints = state.calendarConstraints.filter((item) => dayKey(isoValue(item, "startsAt")) === key); return <div className={`week-day ${index === 0 ? "today" : ""}`} key={key}><header><span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span><strong>{day.getDate()}</strong></header><div className="week-day-blocks">{constraints.map((item) => <article className="week-block commitment" key={text(item, "id")}><small>{formatDate(item.startsAt, { hour: "numeric", minute: "2-digit" })}</small><strong>{text(item, "title", "Calendar commitment")}</strong><span>Busy</span></article>)}{schedule.map((item) => { const task = state.tasks.find((candidate) => text(candidate, "id") === text(item, "taskId")); return <article className="week-block study" key={text(item, "id")}><small>{formatDate(item.startsAt ?? item.start, { hour: "numeric", minute: "2-digit" })}</small><strong>{text(task, "title", "Study block")}</strong><span>{formatLabel(text(item, "status", "planned"))}</span></article>;})}{!schedule.length && !constraints.length ? <div className="week-empty">Open</div> : null}</div></div>;})}</section> : null}

      {view === "goals" ? <section className="plan-goals-layout"><div className="plan-goal-index">{state.goals.map((goal) => { const tasks = state.tasks.filter((task) => text(task, "goalId") === text(goal, "id")); const done = tasks.filter((task) => text(task, "status") === "done").length; const progress = Math.max(number(goal, "progress"), tasks.length ? done / tasks.length : 0); return <button key={text(goal, "id")} className={text(goal, "id") === text(selectedGoal, "id") ? "active" : ""} onClick={() => setSelectedGoalId(text(goal, "id"))}><span><Target size={16} /></span><div><strong>{text(goal, "title")}</strong><small>{Math.round(progress * 100)}% · {tasks.length} tasks</small></div></button>;})}</div>{selectedGoal ? <Card className="plan-goal-detail"><header><div><Badge tone={statusTone(text(selectedGoal, "status", "active"))}>{formatLabel(text(selectedGoal, "status", "active"))}</Badge><h2>{text(selectedGoal, "title")}</h2><p>{text(selectedGoal, "outcome")}</p></div><div><strong>{Math.round(number(selectedGoal, "progress", 0) * 100)}%</strong><span>goal progress</span></div></header><div className="plan-goal-meta"><span><CalendarClock size={14} />Due {formatDate(selectedGoal.targetDate ?? selectedGoal.date, { dateStyle: "medium" })}</span><button onClick={() => setForm("task")}><Plus size={14} />Add task</button></div><div className="plan-task-list">{state.tasks.filter((task) => text(task, "goalId") === text(selectedGoal, "id")).map((task) => { const done = text(task, "status") === "done"; return <article key={text(task, "id")}><button className={done ? "task-check done" : "task-check"} disabled={done || busy} onClick={() => void completeTask(text(task, "id"))} aria-label={done ? `${text(task, "title")} completed` : `Mark ${text(task, "title")} complete`}>{done ? <Check size={14} /> : <Circle size={14} />}</button><div><strong>{text(task, "title")}</strong><span>{number(task, "estimatedMinutes", 30)} min · {text(task, "completionEvidence", "No evidence rule set")}</span></div><Badge tone={statusTone(text(task, "status", "backlog"))}>{formatLabel(text(task, "status", "backlog"))}</Badge></article>;})}</div></Card> : null}</section> : null}

      {view === "backlog" ? <Card className="plan-backlog"><header><div><div className="plan-kicker"><ListTodo size={15} />ACTIVE WORK</div><h2>{activeTasks.length} unfinished task{activeTasks.length === 1 ? "" : "s"}</h2></div><Button className="button-primary compact-button" onClick={() => setForm("task")}><Plus size={14} />Add task</Button></header><div>{activeTasks.map((task) => { const goal = state.goals.find((item) => text(item, "id") === text(task, "goalId")); return <article key={text(task, "id")}><button className="task-check" disabled={busy} onClick={() => void completeTask(text(task, "id"))}><Circle size={14} /></button><div><strong>{text(task, "title")}</strong><span>{text(goal, "title", "Unlinked goal")}</span></div><span><Clock3 size={13} />{number(task, "estimatedMinutes", 30)} min</span><span><Flag size={13} />{priorityLabel(task.priority as number | string)}</span><Badge tone={statusTone(text(task, "status", "backlog"))}>{formatLabel(text(task, "status", "backlog"))}</Badge></article>;})}</div></Card> : null}

      {!state.goals.length ? <Card className="empty-record"><Target size={25} /><h2>No goals yet</h2><p>Create the first outcome. Continuum will keep it available to this app and every authorized assistant.</p></Card> : null}
    </div>
  );
}
