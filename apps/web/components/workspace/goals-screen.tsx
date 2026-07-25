"use client";

import type { ScheduleBlock, ScheduleProposal } from "@continuum/schemas";
import { CalendarClock, CalendarDays, Check, Circle, Clock3, Copy, Flag, GripVertical, ListTodo, Pencil, Plus, Save, Sparkles, Target, Trash2, Undo2, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Badge, Button, Card, ConfirmationDialog, ErrorState, LoadingButton, Modal } from "@/components/ui";
import { PageIntro } from "./page-intro";
import { formatLabel, priorityLabel, statusTone } from "@/lib/labels";
import { formatDate, number, postState, text, type Row, type WorkspaceState } from "./types";

type Toast = (message: string | null) => void;
type PlanView = "week" | "goals" | "backlog";
type ScheduleItem = { id: string; taskId: string; time: string; end: string; duration: number; title: string; status: string; evidence: string; reason: string };
type ProposalResponse = { proposal: ScheduleProposal; proposalId?: string; items: ScheduleItem[]; assumptions: string[]; error?: string };
type ScheduleIntake = {
  wakeTime: string;
  sleepTime: string;
  fixedCommitments: string;
  weekdayFree: string;
  weekendFree: string;
  priorities: string;
  deadlines: string;
  sessionLength: number;
  breakMinutes: number;
  noDays: number[];
  maxDailyMinutes: number;
};
type DraftEditor = ScheduleBlock & { newBlock?: boolean };
type IntakeCommitment = { id: string; title: string; start: string; end: string };

const defaultIntake: ScheduleIntake = {
  wakeTime: "06:30",
  sleepTime: "22:30",
  fixedCommitments: "Mon 08:00-15:00 School\nTue 08:00-15:00 School\nWed 08:00-15:00 School\nThu 08:00-15:00 School\nFri 08:00-15:00 School",
  weekdayFree: "17:00-20:30",
  weekendFree: "10:00-16:00",
  priorities: "",
  deadlines: "",
  sessionLength: 45,
  breakMinutes: 10,
  noDays: [],
  maxDailyMinutes: 180,
};

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

function localDateInput(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localTimeInput(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function atLocalDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function intakeCommitments(value: string, days: Date[]): IntakeCommitment[] {
  const weekdayIndex: Record<string, number> = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
  return value.split("\n").flatMap((line, index) => {
    const match = line.trim().match(/^(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\s+(\d{2}:\d{2})-(\d{2}:\d{2})\s+(.+)$/i);
    if (!match) return [];
    const date = days.find((day) => day.getDay() === weekdayIndex[match[1]!.toLowerCase()]);
    if (!date) return [];
    const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const start = atLocalDateTime(localDate, match[2]!);
    const end = atLocalDateTime(localDate, match[3]!);
    return Date.parse(start) < Date.parse(end) ? [{ id: `intake_commitment_${index}`, title: match[4]!, start, end }] : [];
  });
}

export function GoalsScreen({ state, showToast, onRefresh }: { state: WorkspaceState; showToast: Toast; onRefresh: () => Promise<void> }) {
  const [form, setForm] = useState<"goal" | "task">();
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<PlanView>("week");
  const [selectedGoalId, setSelectedGoalId] = useState(text(state.goals[0], "id"));
  const [proposal, setProposal] = useState<ProposalResponse>();
  const [proposalBusy, setProposalBusy] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [intake, setIntake] = useState<ScheduleIntake>(() => ({
    ...defaultIntake,
    priorities: state.goals.slice(0, 4).map((goal) => text(goal, "title")).join("\n"),
    deadlines: state.goals.slice(0, 4).map((goal) => `${text(goal, "title")}: ${String(goal.targetDate ?? goal.date ?? "No deadline")}`).join("\n"),
  }));
  const [undoStack, setUndoStack] = useState<ScheduleBlock[][]>([]);
  const [editingBlock, setEditingBlock] = useState<DraftEditor>();
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const week = useMemo(dateRange, []);
  const fixedCommitments = useMemo(() => intakeCommitments(intake.fixedCommitments, week), [intake.fixedCommitments, week]);
  const selectedGoal = state.goals.find((goal) => text(goal, "id") === selectedGoalId) ?? state.goals[0];
  const activeTasks = state.tasks.filter((task) => text(task, "status") !== "done");
  const committedMinutes = state.schedule.reduce((total, item) => {
    const start = Date.parse(isoValue(item, "startsAt") || isoValue(item, "start"));
    const end = Date.parse(isoValue(item, "endsAt") || isoValue(item, "end"));
    return total + (Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 60_000)) : 0);
  }, 0);
  const draftBlocks = useMemo(() => proposal?.proposal.blocks ?? [], [proposal]);
  const overlapIds = useMemo(() => {
    const ids = new Set<string>();
    for (let left = 0; left < draftBlocks.length; left += 1) {
      for (let right = left + 1; right < draftBlocks.length; right += 1) {
        const a = draftBlocks[left]!;
        const b = draftBlocks[right]!;
        if (Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end)) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
      if (fixedCommitments.some((commitment) => Date.parse(draftBlocks[left]!.start) < Date.parse(commitment.end) && Date.parse(commitment.start) < Date.parse(draftBlocks[left]!.end))) {
        ids.add(draftBlocks[left]!.id);
      }
    }
    return ids;
  }, [draftBlocks, fixedCommitments]);
  const draftMinutes = draftBlocks.reduce((total, block) => total + Math.round((Date.parse(block.end) - Date.parse(block.start)) / 60_000), 0);
  const weeklyCapacity = intake.maxDailyMinutes * Math.max(0, 7 - intake.noDays.length);

  useEffect(() => {
    if (!proposal) return;
    const preserveDraft = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", preserveDraft);
    return () => window.removeEventListener("beforeunload", preserveDraft);
  }, [proposal]);

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
      const response = await fetch("/api/schedule", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "propose", intake }) });
      const body = await response.json() as ProposalResponse;
      if (!response.ok) throw new Error(body.error ?? "A schedule proposal could not be generated.");
      setProposal(body);
      setUndoStack([]);
      setOnboardingOpen(false);
      showToast("Here is a realistic first draft. Move or edit anything before saving.");
    } catch (error) { showToast(error instanceof Error ? error.message : "A schedule proposal could not be generated."); }
    finally { setProposalBusy(false); }
  }

  async function commitPlan() {
    if (!proposal?.proposalId) return;
    setProposalBusy(true);
    try {
      const response = await fetch("/api/schedule", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "commit", proposalId: proposal.proposalId, confirmedAt: new Date().toISOString(), blocks: proposal.proposal.blocks }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The proposed schedule could not be committed.");
      setProposal(undefined);
      showToast("Your edited weekly schedule is saved.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The proposed schedule could not be committed."); }
    finally { setProposalBusy(false); }
  }

  function setDraftBlocks(next: ScheduleBlock[], remember = true) {
    if (!proposal) return;
    if (remember) setUndoStack((history) => [...history.slice(-19), proposal.proposal.blocks]);
    setProposal({ ...proposal, proposal: { ...proposal.proposal, blocks: next } });
  }

  function updateDraftBlock(blockId: string, changes: Partial<ScheduleBlock>, remember = true) {
    setDraftBlocks(draftBlocks.map((block) => block.id === blockId ? { ...block, ...changes } : block), remember);
  }

  function undoDraft() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setDraftBlocks(previous, false);
    setUndoStack((history) => history.slice(0, -1));
  }

  function moveBlockToDay(blockId: string, day: Date) {
    const block = draftBlocks.find((item) => item.id === blockId);
    if (!block) return;
    const start = new Date(block.start);
    const end = new Date(block.end);
    const duration = end.getTime() - start.getTime();
    const moved = new Date(day);
    moved.setHours(start.getHours(), start.getMinutes(), 0, 0);
    updateDraftBlock(blockId, { start: moved.toISOString(), end: new Date(moved.getTime() + duration).toISOString() });
  }

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>, blockId: string) {
    event.stopPropagation();
    event.preventDefault();
    const block = draftBlocks.find((item) => item.id === blockId);
    if (!block) return;
    const startY = event.clientY;
    const startDuration = Math.round((Date.parse(block.end) - Date.parse(block.start)) / 60_000);
    setUndoStack((history) => [...history.slice(-19), draftBlocks]);
    const move = (pointer: PointerEvent) => {
      const duration = Math.max(15, Math.min(240, Math.round((startDuration + (pointer.clientY - startY) * 2) / 5) * 5));
      updateDraftBlock(blockId, { end: new Date(Date.parse(block.start) + duration * 60_000).toISOString() }, false);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  function openNewBlock() {
    const task = activeTasks[0];
    if (!task) return;
    const start = new Date();
    start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
    setEditingBlock({
      id: `draft_block_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
      taskId: text(task, "id"),
      title: text(task, "title", "Study block"),
      start: start.toISOString(),
      end: new Date(start.getTime() + intake.sessionLength * 60_000).toISOString(),
      status: "planned",
      flexible: true,
      completionEvidenceRequired: Boolean(text(task, "completionEvidence")),
      newBlock: true,
    });
  }

  function saveBlockEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBlock) return;
    const data = new FormData(event.currentTarget);
    const start = atLocalDateTime(String(data.get("date")), String(data.get("time")));
    const duration = Number(data.get("duration"));
    const taskId = String(data.get("taskId"));
    const task = state.tasks.find((item) => text(item, "id") === taskId);
    const saved: ScheduleBlock = {
      ...editingBlock,
      taskId,
      title: String(data.get("title")) || text(task, "title", "Study block"),
      start,
      end: new Date(Date.parse(start) + duration * 60_000).toISOString(),
      flexible: data.get("fixed") !== "on",
    };
    delete (saved as DraftEditor).newBlock;
    setDraftBlocks(editingBlock.newBlock ? [...draftBlocks, saved] : draftBlocks.map((block) => block.id === saved.id ? saved : block));
    setEditingBlock(undefined);
  }

  function duplicateBlock(block: ScheduleBlock) {
    const start = new Date(Date.parse(block.start) + 24 * 3600_000);
    const duration = Date.parse(block.end) - Date.parse(block.start);
    setDraftBlocks([...draftBlocks, { ...block, id: `draft_block_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`, start: start.toISOString(), end: new Date(start.getTime() + duration).toISOString() }]);
  }

  function regenerateDay(day: Date) {
    const ids = draftBlocks.filter((block) => dayKey(block.start) === dayKey(day)).map((block) => block.id);
    if (!ids.length) return;
    let cursor = new Date(day);
    const freeTime = [0, 6].includes(day.getDay()) ? intake.weekendFree : intake.weekdayFree;
    const [hour, minute] = freeTime.split("-")[0]!.split(":").map(Number);
    cursor.setHours(hour ?? 17, minute ?? 0, 0, 0);
    const next = draftBlocks.map((block) => {
      if (!ids.includes(block.id) || !block.flexible) return block;
      const duration = Math.min(intake.sessionLength, Math.round((Date.parse(block.end) - Date.parse(block.start)) / 60_000));
      const moved = { ...block, start: cursor.toISOString(), end: new Date(cursor.getTime() + duration * 60_000).toISOString() };
      cursor = new Date(Date.parse(moved.end) + intake.breakMinutes * 60_000);
      return moved;
    });
    setDraftBlocks(next);
  }

  function regenerateBlock(block: ScheduleBlock) {
    const start = new Date(Date.parse(block.start) + (intake.sessionLength + intake.breakMinutes) * 60_000);
    updateDraftBlock(block.id, { start: start.toISOString(), end: new Date(start.getTime() + intake.sessionLength * 60_000).toISOString(), flexible: true });
    setEditingBlock(undefined);
  }

  return (
    <div className={`screen plan-screen premium-screen${proposal ? " editing-schedule" : ""}`}>
      <PageIntro eyebrow="PLAN" title="A week that respects real life." description="See commitments and study blocks together, keep every task tied to an outcome, and approve schedule changes before they become current." action={<><Button className="button-secondary" onClick={() => setForm(form === "task" ? undefined : "task")} disabled={!state.goals.length}><Plus size={16} />New task</Button><Button className="button-primary" onClick={() => setForm(form === "goal" ? undefined : "goal")}><Plus size={16} />New goal</Button></>} />

      <div className="plan-toolbar"><div className="plan-view-tabs" aria-label="Plan views"><button className={view === "week" ? "active" : ""} onClick={() => setView("week")}><CalendarDays size={15} />Week</button><button className={view === "goals" ? "active" : ""} onClick={() => setView("goals")}><Target size={15} />Goals</button><button className={view === "backlog" ? "active" : ""} onClick={() => setView("backlog")}><ListTodo size={15} />Backlog</button></div><div className="plan-toolbar-meta"><span><strong>{Math.round(committedMinutes / 60 * 10) / 10}h</strong> scheduled</span><span><strong>{activeTasks.length}</strong> active tasks</span><Button className="button-secondary compact-button" disabled={proposalBusy || !activeTasks.length} onClick={() => setOnboardingOpen(true)}><WandSparkles size={14} />Build my week</Button></div></div>

      <section className="planning-independence-note"><CalendarClock size={19} /><div><strong>Plan without connecting a calendar</strong><span>Enter school, sleep, and free-time limits once. Continuum builds an editable internal schedule; external calendars remain optional.</span></div><Button className="button-secondary compact-button" disabled={!activeTasks.length} onClick={() => setOnboardingOpen(true)}>Set availability</Button></section>

      {form === "goal" ? <Card className="inline-form-card"><div className="inline-form-heading"><div><h2>Create a goal</h2><p>Define the outcome before creating work.</p></div><button onClick={() => setForm(undefined)}>Cancel</button></div><form className="workspace-form form-grid" onSubmit={submitGoal}><label>Goal title<input name="title" required minLength={3} maxLength={120} placeholder="Complete the statistics module" /></label><label>Target date<input name="date" type="date" required /></label><label className="full-field">Successful outcome<textarea name="outcome" required minLength={3} maxLength={500} placeholder="Pass the final assessment and explain each core method" /></label><div className="form-actions"><Button className="button-primary" disabled={busy}>{busy ? "Saving…" : "Save goal"}</Button></div></form></Card> : null}

      {form === "task" ? <Card className="inline-form-card"><div className="inline-form-heading"><div><h2>Add a task</h2><p>Give the scheduler enough information to place real work.</p></div><button onClick={() => setForm(undefined)}>Cancel</button></div><form className="workspace-form form-grid" onSubmit={submitTask}><label>Goal<select name="goalId" required defaultValue={selectedGoalId}>{state.goals.map((goal) => <option key={text(goal, "id")} value={text(goal, "id")}>{text(goal, "title")}</option>)}</select></label><label>Task title<input name="title" required minLength={3} maxLength={200} /></label><label className="full-field">Description<input name="description" maxLength={500} placeholder="What specifically needs to happen?" /></label><label>Estimated minutes<input name="estimatedMinutes" type="number" min="5" max="1440" defaultValue="30" required /></label><label>Deadline<input name="deadline" type="datetime-local" /></label><label>Priority<select name="priority" defaultValue="3"><option value="5">Highest</option><option value="4">High</option><option value="3">Normal</option><option value="2">Low</option><option value="1">Lowest</option></select></label><label>Completion evidence<input name="completionEvidence" maxLength={500} placeholder="Pass two unseen problems" /></label><div className="form-actions"><Button className="button-primary" disabled={busy}>{busy ? "Saving…" : "Save task"}</Button></div></form></Card> : null}

      {proposal ? <Card className="schedule-draft-editor">
        <header><div><div className="plan-kicker"><WandSparkles size={15} />EDITABLE DRAFT</div><h2>Here is a realistic first draft.</h2><p>Move, resize, or edit anything before saving.</p></div><div className="draft-editor-actions"><Button className="button-secondary" disabled={!undoStack.length} onClick={undoDraft}><Undo2 size={14} />Undo</Button><Button className="button-secondary" onClick={openNewBlock}><Plus size={14} />Add block</Button><LoadingButton className="button-primary" loading={proposalBusy} loadingLabel="Saving schedule…" disabled={!proposal.proposalId || Boolean(overlapIds.size)} onClick={() => void commitPlan()}><Save size={15} />Save final schedule</LoadingButton></div></header>
        <div className="draft-health">
          <span><strong>{Math.round(draftMinutes / 60 * 10) / 10}h</strong> planned of {Math.round(weeklyCapacity / 60 * 10) / 10}h available</span>
          <span><strong>{draftBlocks.length}</strong> blocks</span>
          <span><strong>{proposal.proposal.unscheduledTaskIds.length}</strong> tasks need more time</span>
        </div>
        {overlapIds.size ? <ErrorState title="Some blocks overlap" body="Move or resize the highlighted blocks before saving." /> : draftMinutes > weeklyCapacity ? <ErrorState title="This draft exceeds your realistic workload" body="Reduce or move blocks, increase available time, or leave lower-priority tasks unscheduled." /> : null}
        <section className="draft-week-board" aria-label="Editable weekly schedule">
          {week.map((day) => {
            const blocks = draftBlocks.filter((block) => dayKey(block.start) === dayKey(day)).sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
            const commitments = fixedCommitments.filter((commitment) => dayKey(commitment.start) === dayKey(day));
            return <div className="draft-day" key={dayKey(day)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); moveBlockToDay(event.dataTransfer.getData("text/schedule-block"), day); }}>
              <header><div><span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span><strong>{day.getDate()}</strong></div><button aria-label={`Regenerate ${day.toLocaleDateString(undefined, { weekday: "long" })}`} disabled={!blocks.length} onClick={() => regenerateDay(day)}><Sparkles size={13} /></button></header>
              <div>{commitments.map((commitment) => <article className="draft-commitment" key={commitment.id}><CalendarClock size={13} /><div><small>{localTimeInput(commitment.start)}–{localTimeInput(commitment.end)}</small><strong>{commitment.title}</strong><span>Protected commitment</span></div></article>)}{blocks.map((block) => <article draggable className={`draft-block${overlapIds.has(block.id) ? " overlap" : ""}${block.flexible ? "" : " fixed"}`} key={block.id} onDragStart={(event) => { event.dataTransfer.setData("text/schedule-block", block.id); event.dataTransfer.effectAllowed = "move"; }} onClick={() => setEditingBlock(block)}>
                <GripVertical size={14} aria-hidden="true" />
                <div><small>{localTimeInput(block.start)}–{localTimeInput(block.end)}</small><strong>{block.title}</strong><span>{block.flexible ? "Flexible" : "Fixed"} · {Math.round((Date.parse(block.end) - Date.parse(block.start)) / 60_000)} min</span></div>
                <button className="draft-edit" aria-label={`Edit ${block.title}`} onClick={(event) => { event.stopPropagation(); setEditingBlock(block); }}><Pencil size={13} /></button>
                <button className="draft-resize" aria-label={`Resize ${block.title}. Use the up and down arrow keys to change duration.`} onPointerDown={(event) => beginResize(event, block.id)} onKeyDown={(event) => {
                  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
                  event.preventDefault();
                  const duration = Math.round((Date.parse(block.end) - Date.parse(block.start)) / 60_000);
                  const nextDuration = Math.max(15, Math.min(240, duration + (event.key === "ArrowUp" ? 5 : -5)));
                  updateDraftBlock(block.id, { end: new Date(Date.parse(block.start) + nextDuration * 60_000).toISOString() });
                }}><span /></button>
              </article>)}{!blocks.length && !commitments.length ? <div className="draft-day-empty">Drop a flexible block here</div> : null}</div>
            </div>;
          })}
        </section>
        <footer><div>{proposal.assumptions.map((assumption) => <span key={assumption}>• {assumption}</span>)}</div><button className="ghost-action" onClick={() => setDiscardConfirmOpen(true)}>Discard draft</button></footer>
      </Card> : null}

      <ConfirmationDialog
        open={discardConfirmOpen}
        onOpenChange={setDiscardConfirmOpen}
        title="Discard this schedule draft?"
        description="Your moved, resized, and edited blocks will be lost. Your goals, tasks, and saved schedule will not change."
        confirmLabel="Discard draft"
        destructive
        onConfirm={() => {
          setProposal(undefined);
          setUndoStack([]);
          setDiscardConfirmOpen(false);
        }}
      />

      <Modal
        open={onboardingOpen}
        onOpenChange={setOnboardingOpen}
        title="Build a realistic weekly schedule"
        description="These limits shape the draft. No Google Calendar connection is required."
        footer={<><Button className="button-secondary" onClick={() => setOnboardingOpen(false)}>Cancel</Button><LoadingButton form="schedule-intake-form" className="button-primary" loading={proposalBusy} loadingLabel="Building first draft…"><WandSparkles size={15} />Generate editable draft</LoadingButton></>}
      >
        <form id="schedule-intake-form" className="schedule-intake-form" onSubmit={(event) => { event.preventDefault(); void generatePlan(); }}>
          <fieldset><legend>Your day</legend><div className="intake-grid"><label>Usual wake time<input type="time" required value={intake.wakeTime} onChange={(event) => setIntake({ ...intake, wakeTime: event.target.value })} /></label><label>Usual sleep time<input type="time" required value={intake.sleepTime} onChange={(event) => setIntake({ ...intake, sleepTime: event.target.value })} /></label><label>Free time on weekdays<input pattern="\d{2}:\d{2}-\d{2}:\d{2}" required value={intake.weekdayFree} onChange={(event) => setIntake({ ...intake, weekdayFree: event.target.value })} placeholder="17:00-20:30" /></label><label>Free time on weekends<input pattern="\d{2}:\d{2}-\d{2}:\d{2}" required value={intake.weekendFree} onChange={(event) => setIntake({ ...intake, weekendFree: event.target.value })} placeholder="10:00-16:00" /></label></div></fieldset>
          <fieldset><legend>School and fixed commitments</legend><label>One per line in the format “Mon 08:00-15:00 School”<textarea value={intake.fixedCommitments} onChange={(event) => setIntake({ ...intake, fixedCommitments: event.target.value })} /></label></fieldset>
          <fieldset><legend>Work to prioritise</legend><div className="intake-grid"><label>Subjects or projects<textarea value={intake.priorities} onChange={(event) => setIntake({ ...intake, priorities: event.target.value })} /></label><label>Important deadlines<textarea value={intake.deadlines} onChange={(event) => setIntake({ ...intake, deadlines: event.target.value })} /></label></div></fieldset>
          <fieldset><legend>Study rhythm</legend><div className="intake-grid"><label>Preferred session length<select value={intake.sessionLength} onChange={(event) => setIntake({ ...intake, sessionLength: Number(event.target.value) })}><option value="25">25 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option></select></label><label>Break between sessions<select value={intake.breakMinutes} onChange={(event) => setIntake({ ...intake, breakMinutes: Number(event.target.value) })}><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="20">20 minutes</option></select></label><label>Maximum realistic workload per day<input type="number" min="15" max="720" step="15" value={intake.maxDailyMinutes} onChange={(event) => setIntake({ ...intake, maxDailyMinutes: Number(event.target.value) })} /><small>Minutes of focused work</small></label></div></fieldset>
          <fieldset><legend>Days you do not want scheduled</legend><div className="no-day-options">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, day) => <label key={label}><input type="checkbox" checked={intake.noDays.includes(day)} onChange={(event) => setIntake({ ...intake, noDays: event.target.checked ? [...intake.noDays, day] : intake.noDays.filter((value) => value !== day) })} />{label}</label>)}</div></fieldset>
        </form>
      </Modal>

      <Modal open={Boolean(editingBlock)} onOpenChange={(open) => { if (!open) setEditingBlock(undefined); }} title={editingBlock?.newBlock ? "Add a study block" : "Edit study block"} description="Change the task, date, time, duration, or flexibility directly.">
        {editingBlock ? <form className="block-editor-form" onSubmit={saveBlockEdit}>
          <label>Title<input name="title" required maxLength={160} defaultValue={editingBlock.title} /></label>
          <label>Connected goal and task<select name="taskId" required defaultValue={editingBlock.taskId}>{state.goals.map((goal) => <optgroup key={text(goal, "id")} label={text(goal, "title")}>{state.tasks.filter((task) => text(task, "goalId") === text(goal, "id") && text(task, "status") !== "done").map((task) => <option key={text(task, "id")} value={text(task, "id")}>{text(task, "title")}</option>)}</optgroup>)}</select></label>
          <div className="block-time-grid"><label>Date<input name="date" type="date" required defaultValue={localDateInput(editingBlock.start)} /></label><label>Start time<input name="time" type="time" required defaultValue={localTimeInput(editingBlock.start)} /></label><label>Duration<input name="duration" type="number" min="15" max="240" step="5" required defaultValue={Math.round((Date.parse(editingBlock.end) - Date.parse(editingBlock.start)) / 60_000)} /></label></div>
          <label className="fixed-choice"><input name="fixed" type="checkbox" defaultChecked={!editingBlock.flexible} /><span><strong>Fixed block</strong><small>Fixed blocks are not moved when a day is regenerated.</small></span></label>
          <div className="block-editor-actions">
            {!editingBlock.newBlock ? <><Button type="button" className="button-quiet danger" onClick={() => { setDraftBlocks(draftBlocks.filter((block) => block.id !== editingBlock.id)); setEditingBlock(undefined); }}><Trash2 size={14} />Delete</Button><Button type="button" className="button-secondary" onClick={() => { duplicateBlock(editingBlock); setEditingBlock(undefined); }}><Copy size={14} />Duplicate</Button><Button type="button" className="button-secondary" onClick={() => regenerateBlock(editingBlock)}><Sparkles size={14} />Regenerate this block</Button></> : null}
            <Button className="button-primary"><Save size={14} />{editingBlock.newBlock ? "Add block" : "Save changes"}</Button>
          </div>
        </form> : null}
      </Modal>

      {view === "week" ? <section className="week-board" aria-label="Seven day plan">{week.map((day, index) => { const key = dayKey(day); const schedule = state.schedule.filter((item) => dayKey(isoValue(item, "startsAt") || isoValue(item, "start")) === key); const constraints = state.calendarConstraints.filter((item) => dayKey(isoValue(item, "startsAt")) === key); return <div className={`week-day ${index === 0 ? "today" : ""}`} key={key}><header><span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span><strong>{day.getDate()}</strong></header><div className="week-day-blocks">{constraints.map((item) => <article className="week-block commitment" key={text(item, "id")}><small>{formatDate(item.startsAt, { hour: "numeric", minute: "2-digit" })}</small><strong>{text(item, "title", "Calendar commitment")}</strong><span>Busy</span></article>)}{schedule.map((item) => { const task = state.tasks.find((candidate) => text(candidate, "id") === text(item, "taskId")); return <article className="week-block study" key={text(item, "id")}><small>{formatDate(item.startsAt ?? item.start, { hour: "numeric", minute: "2-digit" })}</small><strong>{text(task, "title", "Study block")}</strong><span>{formatLabel(text(item, "status", "planned"))}</span></article>;})}{!schedule.length && !constraints.length ? <div className="week-empty">Open</div> : null}</div></div>;})}</section> : null}

      {view === "goals" ? <section className="plan-goals-layout"><div className="plan-goal-index">{state.goals.map((goal) => { const tasks = state.tasks.filter((task) => text(task, "goalId") === text(goal, "id")); const done = tasks.filter((task) => text(task, "status") === "done").length; const progress = Math.max(number(goal, "progress"), tasks.length ? done / tasks.length : 0); return <button key={text(goal, "id")} className={text(goal, "id") === text(selectedGoal, "id") ? "active" : ""} onClick={() => setSelectedGoalId(text(goal, "id"))}><span><Target size={16} /></span><div><strong>{text(goal, "title")}</strong><small>{Math.round(progress * 100)}% · {tasks.length} tasks</small></div></button>;})}</div>{selectedGoal ? <Card className="plan-goal-detail"><header><div><Badge tone={statusTone(text(selectedGoal, "status", "active"))}>{formatLabel(text(selectedGoal, "status", "active"))}</Badge><h2>{text(selectedGoal, "title")}</h2><p>{text(selectedGoal, "outcome")}</p></div><div><strong>{Math.round(number(selectedGoal, "progress", 0) * 100)}%</strong><span>goal progress</span></div></header><div className="plan-goal-meta"><span><CalendarClock size={14} />Due {formatDate(selectedGoal.targetDate ?? selectedGoal.date, { dateStyle: "medium" })}</span><button onClick={() => setForm("task")}><Plus size={14} />Add task</button></div><div className="plan-task-list">{state.tasks.filter((task) => text(task, "goalId") === text(selectedGoal, "id")).map((task) => { const done = text(task, "status") === "done"; return <article key={text(task, "id")}><button className={done ? "task-check done" : "task-check"} disabled={done || busy} onClick={() => void completeTask(text(task, "id"))} aria-label={done ? `${text(task, "title")} completed` : `Mark ${text(task, "title")} complete`}>{done ? <Check size={14} /> : <Circle size={14} />}</button><div><strong>{text(task, "title")}</strong><span>{number(task, "estimatedMinutes", 30)} min · {text(task, "completionEvidence", "No evidence rule set")}</span></div><Badge tone={statusTone(text(task, "status", "backlog"))}>{formatLabel(text(task, "status", "backlog"))}</Badge></article>;})}</div></Card> : null}</section> : null}

      {view === "backlog" ? <Card className="plan-backlog"><header><div><div className="plan-kicker"><ListTodo size={15} />ACTIVE WORK</div><h2>{activeTasks.length} unfinished task{activeTasks.length === 1 ? "" : "s"}</h2></div><Button className="button-primary compact-button" onClick={() => setForm("task")}><Plus size={14} />Add task</Button></header><div>{activeTasks.map((task) => { const goal = state.goals.find((item) => text(item, "id") === text(task, "goalId")); return <article key={text(task, "id")}><button className="task-check" disabled={busy} onClick={() => void completeTask(text(task, "id"))}><Circle size={14} /></button><div><strong>{text(task, "title")}</strong><span>{text(goal, "title", "Unlinked goal")}</span></div><span><Clock3 size={13} />{number(task, "estimatedMinutes", 30)} min</span><span><Flag size={13} />{priorityLabel(task.priority as number | string)}</span><Badge tone={statusTone(text(task, "status", "backlog"))}>{formatLabel(text(task, "status", "backlog"))}</Badge></article>;})}</div></Card> : null}

      {!state.goals.length ? <Card className="empty-record"><Target size={25} /><h2>No goals yet</h2><p>Create the first outcome. Continuum will keep it available to this app and every authorized assistant.</p></Card> : null}
    </div>
  );
}
