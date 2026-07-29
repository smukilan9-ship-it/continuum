"use client";

/**
 * `/plan` (redesign.md §14.2) — study scheduling, not project management.
 *
 * Three views: Week (default), Goals, Backlog. The week is a real time grid on
 * desktop and a single-day agenda on mobile; the two are rendered together and
 * switched in CSS at 900px, which is what makes the narrow case structurally
 * incapable of overlapping (§14.2, AC-PL1) rather than merely tuned not to.
 *
 * Everything the previous screen did well is preserved deliberately: draft
 * editing, drag to move and resize, the undo stack, overlap detection with an
 * amber outline and a warning count, the two-step commit, and the
 * `beforeunload` guard. What changed is the shape around them.
 */
import type { ScheduleBlock, ScheduleProposal } from "@continuum/schemas";
import { ChevronLeft, ChevronRight, Copy, Plus, Save, Trash2, Undo2, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  Banner,
  Button,
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingButton,
  Modal,
  Select,
  Tabs,
} from "@/components/ui";
import { PageHeader } from "@/components/workspace/page-header";
import { postState, text, type Row as StateRow, type WorkspaceState } from "@/components/workspace/types";
import { BacklogView, GoalsView } from "./backlog-list";
import { BuildWeekDialog, type BuildWeekAnswers } from "./build-week-dialog";
import { DayAgenda } from "./day-agenda";
import {
  atLocalDateTime,
  commitmentsForWeek,
  dateRange,
  dayKey,
  DAY_END_MINUTE,
  DAY_START_MINUTE,
  durationMinutes,
  GRID_MINUTES,
  isoValue,
  localDateInput,
  localTimeInput,
  overlappingBlockIds,
  parseCommitments,
  serializeCommitments,
  SNAP_MINUTES,
  weekRangeLabel,
} from "./plan-time";
import { useBlockMove } from "./use-block-move";
import { WeekGrid, type PlanBlock } from "./week-grid";
import "./plan.css";

type Toast = (message: string | null) => void;
type PlanView = "week" | "goals" | "backlog";
type ProposalResponse = { proposal: ScheduleProposal; proposalId?: string; assumptions: string[]; error?: string };
type DraftEditor = ScheduleBlock & { newBlock?: boolean };

/** Everything the three questions do not ask keeps its stored value (§14.2). */
const STORED_INTAKE = {
  wakeTime: "06:30",
  sleepTime: "22:30",
  priorities: "",
  deadlines: "",
  breakMinutes: 10,
  noDays: [] as number[],
  maxDailyMinutes: 180,
};

const DEFAULT_COMMITMENTS = "Mon 08:00-15:00 School\nTue 08:00-15:00 School\nWed 08:00-15:00 School\nThu 08:00-15:00 School\nFri 08:00-15:00 School";

export function PlanPage({
  state,
  timeZone,
  serverNow,
  showToast,
  onRefresh,
}: {
  state: WorkspaceState;
  timeZone: string;
  serverNow: string;
  showToast: Toast;
  onRefresh: () => Promise<void>;
}) {
  const router = useRouter();
  const [view, setView] = useState<PlanView>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [buildOpen, setBuildOpen] = useState(false);
  const [proposal, setProposal] = useState<ProposalResponse>();
  const [proposalBusy, setProposalBusy] = useState(false);
  const [commitError, setCommitError] = useState("");
  const draggedRef = useRef(false);
  const [undoStack, setUndoStack] = useState<ScheduleBlock[][]>([]);
  const [editingBlock, setEditingBlock] = useState<DraftEditor>();
  const [discardOpen, setDiscardOpen] = useState(false);
  const [form, setForm] = useState<"goal" | "task">();
  const [formBusy, setFormBusy] = useState(false);
  const [answers, setAnswers] = useState<BuildWeekAnswers>(() => ({
    weekdayFree: "17:00-20:30",
    weekendFree: "10:00-16:00",
    sessionLength: 45,
    commitments: parseCommitments(DEFAULT_COMMITMENTS),
  }));

  const week = useMemo(() => dateRange(serverNow, timeZone, weekOffset), [serverNow, timeZone, weekOffset]);
  const todayKey = useMemo(() => dayKey(serverNow, timeZone), [serverNow, timeZone]);
  const [selectedDayKey, setSelectedDayKey] = useState(todayKey);
  const commitments = useMemo(() => commitmentsForWeek(answers.commitments, week), [answers.commitments, week]);

  // The mobile agenda must land on a day that exists in the week being shown,
  // otherwise stepping back a week silently empties it.
  useEffect(() => {
    const keys = week.map((day) => dayKey(day, timeZone));
    if (!keys.includes(selectedDayKey)) setSelectedDayKey(keys.includes(todayKey) ? todayKey : keys[0]!);
  }, [selectedDayKey, timeZone, todayKey, week]);

  const activeTasks = useMemo(() => state.tasks.filter((task) => text(task, "status") !== "done"), [state.tasks]);
  const scheduledTaskIds = useMemo(() => new Set(state.schedule.map((item) => text(item, "taskId"))), [state.schedule]);
  const backlogTasks = useMemo(() => activeTasks.filter((task) => !scheduledTaskIds.has(text(task, "id"))), [activeTasks, scheduledTaskIds]);

  const weekKeys = useMemo(() => new Set(week.map((day) => dayKey(day, timeZone))), [week, timeZone]);
  const savedBlocks: PlanBlock[] = useMemo(() => state.schedule
    .filter((item) => weekKeys.has(dayKey(isoValue(item, "startsAt") || isoValue(item, "start"), timeZone)))
    .map((item) => {
      const task = state.tasks.find((candidate) => text(candidate, "id") === text(item, "taskId"));
      return {
        id: text(item, "id"),
        taskId: text(item, "taskId"),
        title: text(task, "title", "Study block"),
        start: isoValue(item, "startsAt") || isoValue(item, "start"),
        end: isoValue(item, "endsAt") || isoValue(item, "end"),
        status: (text(item, "status", "planned") as ScheduleBlock["status"]),
        flexible: item.flexible !== false,
        completionEvidenceRequired: Boolean(text(task, "completionEvidence")),
        goalId: text(task, "goalId"),
      };
    }), [state.schedule, state.tasks, timeZone, weekKeys]);

  const draftBlocks: PlanBlock[] = useMemo(() => (proposal?.proposal.blocks ?? []).map((block) => {
    const task = state.tasks.find((candidate) => text(candidate, "id") === block.taskId);
    return { ...block, goalId: text(task, "goalId") };
  }), [proposal, state.tasks]);

  const editing = Boolean(proposal);
  const shownBlocks = editing ? draftBlocks : savedBlocks;
  const overlapIds = useMemo(() => editing ? overlappingBlockIds(draftBlocks, commitments) : new Set<string>(), [commitments, draftBlocks, editing]);

  const scheduledMinutes = savedBlocks.reduce((total, block) => total + durationMinutes(block.start, block.end), 0);
  const doneCount = savedBlocks.filter((block) => block.status === "done").length;
  const draftMinutes = draftBlocks.reduce((total, block) => total + durationMinutes(block.start, block.end), 0);

  // The draft only exists in memory, so leaving the page loses it. Retained
  // from the previous implementation.
  useEffect(() => {
    if (!proposal) return;
    const preserveDraft = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", preserveDraft);
    return () => window.removeEventListener("beforeunload", preserveDraft);
  }, [proposal]);

  const setDraftBlocks = useCallback((next: ScheduleBlock[], remember = true) => {
    setProposal((current) => {
      if (!current) return current;
      if (remember) setUndoStack((history) => [...history.slice(-19), current.proposal.blocks]);
      return { ...current, proposal: { ...current.proposal, blocks: next } };
    });
  }, []);

  const replaceBlock = useCallback((block: ScheduleBlock, remember = true) => {
    setProposal((current) => {
      if (!current) return current;
      if (remember) setUndoStack((history) => [...history.slice(-19), current.proposal.blocks]);
      return { ...current, proposal: { ...current.proposal, blocks: current.proposal.blocks.map((entry) => entry.id === block.id ? { ...entry, ...block } : entry) } };
    });
  }, []);

  const describeBlock = useCallback((block: ScheduleBlock) => {
    const day = new Date(block.start).toLocaleDateString("en-GB", { weekday: "long", timeZone });
    return `${block.title}, ${day} ${localTimeInput(block.start)} to ${localTimeInput(block.end)}.`;
  }, [timeZone]);

  const move = useBlockMove({ onCommit: (block) => replaceBlock(block), describe: describeBlock });

  // While a block is being moved by keyboard it is rendered at its in-flight
  // position, so the preview is visible and not merely announced.
  const renderBlocks = useMemo(() => move.preview
    ? shownBlocks.map((block) => block.id === move.preview!.id ? { ...block, ...move.preview! } : block)
    : shownBlocks, [move.preview, shownBlocks]);

  function undoDraft() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setDraftBlocks(previous, false);
    setUndoStack((history) => history.slice(0, -1));
  }

  async function generate(next: BuildWeekAnswers) {
    setAnswers(next);
    setProposalBusy(true);
    setCommitError("");
    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "propose",
          intake: {
            ...STORED_INTAKE,
            weekdayFree: next.weekdayFree,
            weekendFree: next.weekendFree,
            sessionLength: next.sessionLength,
            fixedCommitments: serializeCommitments(next.commitments),
          },
        }),
      });
      const body = await response.json() as ProposalResponse;
      if (!response.ok) throw new Error(body.error ?? "Couldn't build a week from your current tasks");
      setProposal(body);
      setUndoStack([]);
      setBuildOpen(false);
    } catch (cause) { showToast(cause instanceof Error ? cause.message : "Couldn't build a week from your current tasks"); }
    finally { setProposalBusy(false); }
  }

  /** Step two of the two-step commit: nothing is saved without this (AC-PL3). */
  async function saveWeek() {
    if (!proposal?.proposalId) return;
    setProposalBusy(true);
    setCommitError("");
    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "commit", proposalId: proposal.proposalId, confirmedAt: new Date().toISOString(), blocks: proposal.proposal.blocks }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "This week could not be saved");
      setProposal(undefined);
      setUndoStack([]);
      showToast("Your week is saved.");
      await onRefresh();
    } catch (cause) {
      // The draft is deliberately preserved on failure (§14.2 commit failure).
      setCommitError(cause instanceof Error ? cause.message : "This week could not be saved");
    } finally { setProposalBusy(false); }
  }

  /** Pointer drag: horizontal changes the day, vertical changes the time. */
  function beginDrag(event: ReactPointerEvent<HTMLElement>, block: PlanBlock) {
    if (!editing || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".plan-block-resize")) return;
    const column = (event.currentTarget as HTMLElement).closest(".plan-day-column") as HTMLElement | null;
    const days = (event.currentTarget as HTMLElement).closest(".plan-grid-days") as HTMLElement | null;
    if (!column || !days) return;
    const columnRect = column.getBoundingClientRect();
    const daysRect = days.getBoundingClientRect();
    const dayWidth = daysRect.width / 7;
    const startX = event.clientX;
    const startY = event.clientY;
    const originStart = Date.parse(block.start);
    const length = durationMinutes(block.start, block.end);
    let latest = block as ScheduleBlock;
    let moved = false;

    const onMove = (pointer: PointerEvent) => {
      const dyMinutes = ((pointer.clientY - startY) / columnRect.height) * GRID_MINUTES;
      const dayShift = Math.round((pointer.clientX - startX) / dayWidth);
      if (!moved && Math.abs(pointer.clientY - startY) < 3 && Math.abs(pointer.clientX - startX) < 3) return;
      if (!moved) { setUndoStack((history) => [...history.slice(-19), proposal?.proposal.blocks ?? []]); moved = true; }
      const snapped = Math.round(dyMinutes / SNAP_MINUTES) * SNAP_MINUTES;
      const nextStart = new Date(originStart + snapped * 60_000 + dayShift * 24 * 3600_000);
      const minute = nextStart.getHours() * 60 + nextStart.getMinutes();
      // Keep the whole block inside the visible 06:00-24:00 range.
      const clamped = Math.min(Math.max(minute, DAY_START_MINUTE), DAY_END_MINUTE - length);
      nextStart.setHours(Math.floor(clamped / 60), clamped % 60, 0, 0);
      latest = { ...block, start: nextStart.toISOString(), end: new Date(nextStart.getTime() + length * 60_000).toISOString() };
      replaceBlock(latest, false);
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      if (!moved) return;
      replaceBlock(latest, false);
      // A drag ends with a click on the same element. Without this the editor
      // dialog opened every time a block was dragged.
      draggedRef.current = true;
      window.setTimeout(() => { draggedRef.current = false; }, 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop, { once: true });
  }

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>, block: PlanBlock) {
    event.stopPropagation();
    event.preventDefault();
    const startY = event.clientY;
    const startDuration = durationMinutes(block.start, block.end);
    setUndoStack((history) => [...history.slice(-19), proposal?.proposal.blocks ?? []]);
    const onMove = (pointer: PointerEvent) => {
      const next = Math.max(15, Math.min(240, Math.round((startDuration + (pointer.clientY - startY) * 2) / 5) * 5));
      replaceBlock({ ...block, end: new Date(Date.parse(block.start) + next * 60_000).toISOString() }, false);
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop, { once: true });
  }

  function openNewBlock(task?: StateRow) {
    const chosen = task ?? activeTasks[0];
    if (!chosen) return;
    const start = new Date(week[0] ?? new Date());
    start.setHours(17, 0, 0, 0);
    setEditingBlock({
      id: `draft_block_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
      taskId: text(chosen, "id"),
      title: text(chosen, "title", "Study block"),
      start: start.toISOString(),
      end: new Date(start.getTime() + answers.sessionLength * 60_000).toISOString(),
      status: "planned",
      flexible: true,
      completionEvidenceRequired: Boolean(text(chosen, "completionEvidence")),
      newBlock: true,
    });
  }

  function saveBlockEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBlock) return;
    const data = new FormData(event.currentTarget);
    const start = atLocalDateTime(String(data.get("date")), String(data.get("time")));
    const minutes = Number(data.get("duration"));
    const taskId = String(data.get("taskId"));
    const task = state.tasks.find((item) => text(item, "id") === taskId);
    const saved: ScheduleBlock = {
      ...editingBlock,
      taskId,
      title: String(data.get("title")) || text(task, "title", "Study block"),
      start,
      end: new Date(Date.parse(start) + minutes * 60_000).toISOString(),
      flexible: data.get("fixed") !== "on",
    };
    delete (saved as DraftEditor).newBlock;
    setDraftBlocks(editingBlock.newBlock ? [...draftBlocks, saved] : draftBlocks.map((block) => block.id === saved.id ? saved : block));
    setEditingBlock(undefined);
  }

  async function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await postState("goal.created", "Created a goal in the standalone app.", { title: String(data.get("title")), outcome: String(data.get("outcome")), date: String(data.get("date")) });
      setForm(undefined);
      showToast("Goal saved.");
      await onRefresh();
    } catch (cause) { showToast(cause instanceof Error ? cause.message : "The goal could not be saved"); }
    finally { setFormBusy(false); }
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormBusy(true);
    const data = new FormData(event.currentTarget);
    const deadline = String(data.get("deadline"));
    try {
      await postState("task.created", "Created a goal-linked task in the standalone app.", {
        goalId: String(data.get("goalId")),
        title: String(data.get("title")),
        estimatedMinutes: Number(data.get("estimatedMinutes")),
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        priority: Number(data.get("priority")),
        completionEvidence: String(data.get("completionEvidence")) || undefined,
      });
      setForm(undefined);
      showToast("Task saved.");
      await onRefresh();
    } catch (cause) { showToast(cause instanceof Error ? cause.message : "The task could not be saved"); }
    finally { setFormBusy(false); }
  }

  const gridProps = {
    week,
    timeZone,
    commitments,
    draft: editing,
    overlapIds,
    movingId: move.movingId,
    todayKey,
    blocks: renderBlocks,
  };

  return (
    <div className={editing ? "screen plan-screen is-editing" : "screen plan-screen"}>
      <PageHeader
        title="Plan"
        description="A week of study blocks built from your real tasks and deadlines. Nothing is saved until you save it."
        stats={[
          { label: "hours scheduled", value: Math.round(scheduledMinutes / 60 * 10) / 10, singular: "hour scheduled" },
          { label: "blocks done", value: `${doneCount} of ${savedBlocks.length}` },
          { label: "backlog", value: backlogTasks.length },
        ]}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setForm(form === "task" ? undefined : "task")} disabled={!state.goals.length}><Plus size={14} aria-hidden="true" />New task</Button>
            <Button variant="primary" size="sm" disabled={proposalBusy || !activeTasks.length} onClick={() => setBuildOpen(true)}><WandSparkles size={14} aria-hidden="true" />Build my week</Button>
          </>
        }
      >
        <Tabs
          value={view}
          onChange={setView}
          label="Plan views"
          options={[
            { value: "week", label: "Week" },
            { value: "goals", label: "Goals" },
            { value: "backlog", label: "Backlog", badge: backlogTasks.length || undefined },
          ]}
        />
      </PageHeader>

      {/* Keyboard move mode narrates itself here (§14.2 accessibility). */}
      <p className="sr-only" role="status" aria-live="polite">{move.announcement}</p>

      {view === "week" ? (
        <>
          <div className="plan-toolbar">
            <div className="plan-weeknav" role="group" aria-label="Week navigation">
              <Button variant="quiet" size="sm" aria-label="Previous week" onClick={() => setWeekOffset((offset) => offset - 1)}><ChevronLeft size={15} /></Button>
              <span aria-live="polite">{weekOffset === 0 ? "This week" : weekRangeLabel(week, timeZone)}</span>
              <Button variant="quiet" size="sm" aria-label="Next week" onClick={() => setWeekOffset((offset) => offset + 1)}><ChevronRight size={15} /></Button>
              {weekOffset !== 0 ? <Button variant="quiet" size="sm" onClick={() => setWeekOffset(0)}>Today</Button> : null}
            </div>
            <span className="plan-toolbar-stat">
              <strong>{Math.round((editing ? draftMinutes : scheduledMinutes) / 60 * 10) / 10}h</strong> {editing ? "drafted" : "scheduled"}
              {" · "}{doneCount} of {savedBlocks.length} done
            </span>
          </div>

          {editing ? (
            <div className="plan-draft-bar" role="region" aria-label="Draft actions">
              <span><strong>Draft</strong> · {draftBlocks.length} block{draftBlocks.length === 1 ? "" : "s"} · {Math.round(draftMinutes / 60 * 10) / 10}h</span>
              {overlapIds.size ? <span className="plan-warning-count">{overlapIds.size} block{overlapIds.size === 1 ? "" : "s"} overlap</span> : null}
              <div>
                <Button variant="quiet" size="sm" disabled={!undoStack.length} onClick={undoDraft}><Undo2 size={14} aria-hidden="true" />Undo</Button>
                <Button variant="quiet" size="sm" onClick={() => openNewBlock()} disabled={!activeTasks.length}><Plus size={14} aria-hidden="true" />Add block</Button>
                <Button variant="secondary" size="sm" onClick={() => setDiscardOpen(true)}>Discard</Button>
                <LoadingButton variant="primary" size="sm" loading={proposalBusy} loadingLabel="Saving…" disabled={!proposal?.proposalId || Boolean(overlapIds.size)} onClick={() => void saveWeek()}>
                  <Save size={14} aria-hidden="true" />Save week
                </LoadingButton>
              </div>
            </div>
          ) : null}

          {commitError ? <ErrorState title="This week could not be saved" body="Your draft is still here — nothing was lost. Try again, or adjust the blocks it rejected." detail={commitError} /> : null}
          {editing && overlapIds.size ? <Banner tone="warning">Move or resize the outlined blocks before saving.</Banner> : null}

          {/* Both surfaces render; CSS shows exactly one. Below 900px the grid is
              not merely narrower — it is not in the layout at all. */}
          <div className="plan-week-desktop">
            <WeekGrid
              {...gridProps}
              onSelect={editing ? (block) => { if (!draggedRef.current) setEditingBlock(block); } : undefined}
              onKeyDown={editing ? move.onKeyDown : undefined}
              onResizeStart={editing ? beginResize : undefined}
              onMovePointerDown={editing ? beginDrag : undefined}
            />
          </div>
          <div className="plan-week-mobile">
            <DayAgenda
              {...gridProps}
              selectedKey={selectedDayKey}
              onSelectDay={setSelectedDayKey}
              onSelect={editing ? setEditingBlock : undefined}
              onKeyDown={editing ? move.onKeyDown : undefined}
            />
          </div>

          {!editing && !savedBlocks.length ? (
            <EmptyState
              title={weekOffset === 0 ? "No blocks this week" : `Nothing scheduled for ${weekRangeLabel(week, timeZone)}`}
              body={activeTasks.length ? "Tell Continuum when you are free and it drafts a week you can move, resize, and save." : "Add a task first — a week is built from real work."}
              action={activeTasks.length
                ? <Button variant="primary" size="sm" onClick={() => setBuildOpen(true)}><WandSparkles size={14} aria-hidden="true" />Build my week</Button>
                : <Button variant="primary" size="sm" onClick={() => setForm("task")} disabled={!state.goals.length}>Add a task</Button>}
            />
          ) : null}
        </>
      ) : null}

      {view === "goals" ? (
        <GoalsView goals={state.goals} tasks={state.tasks} onOpen={(goalId) => router.push(`/g/${goalId}` as never)} onAddGoal={() => setForm("goal")} />
      ) : null}

      {view === "backlog" ? (
        <BacklogView
          tasks={backlogTasks}
          goals={state.goals}
          onAddTask={() => setForm("task")}
          onSchedule={(task) => { if (!editing) { setBuildOpen(true); return; } openNewBlock(task); }}
          onEdit={() => setForm("task")}
        />
      ) : null}

      <BuildWeekDialog open={buildOpen} onOpenChange={setBuildOpen} initial={answers} busy={proposalBusy} onGenerate={(next) => void generate(next)} />

      <ConfirmationDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard this draft?"
        description="Your moved, resized, and edited blocks will be lost. Your goals, tasks, and saved week will not change."
        confirmLabel="Discard draft"
        destructive
        onConfirm={() => { setProposal(undefined); setUndoStack([]); setDiscardOpen(false); }}
      />

      <Modal open={Boolean(editingBlock)} onOpenChange={(open) => { if (!open) setEditingBlock(undefined); }} title={editingBlock?.newBlock ? "Add a block" : "Edit block"} description="Change the task, date, time, duration, or whether it can be moved.">
        {editingBlock ? (
          <form className="plan-block-form" onSubmit={saveBlockEdit}>
            <Field label="Title">{({ id }) => <Input id={id} name="title" required maxLength={160} defaultValue={editingBlock.title} />}</Field>
            <Field label="Task">
              {({ id }) => (
                <Select id={id} name="taskId" required defaultValue={editingBlock.taskId}>
                  {state.goals.map((goal) => (
                    <optgroup key={text(goal, "id")} label={text(goal, "title")}>
                      {state.tasks.filter((task) => text(task, "goalId") === text(goal, "id") && text(task, "status") !== "done").map((task) => (
                        <option key={text(task, "id")} value={text(task, "id")}>{text(task, "title")}</option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              )}
            </Field>
            <div className="plan-block-form-row">
              <Field label="Date">{({ id }) => <Input id={id} name="date" type="date" required defaultValue={localDateInput(editingBlock.start)} />}</Field>
              <Field label="Start">{({ id }) => <Input id={id} name="time" type="time" required defaultValue={localTimeInput(editingBlock.start)} />}</Field>
              <Field label="Minutes">{({ id }) => <Input id={id} name="duration" type="number" min="15" max="240" step="5" required defaultValue={durationMinutes(editingBlock.start, editingBlock.end)} />}</Field>
            </div>
            <label className="plan-fixed-choice">
              <input name="fixed" type="checkbox" defaultChecked={!editingBlock.flexible} />
              <span><strong>Fixed block</strong><small>Fixed blocks are not moved when the week is regenerated.</small></span>
            </label>
            <div className="plan-block-form-actions">
              {!editingBlock.newBlock ? (
                <>
                  <Button type="button" variant="danger" size="sm" onClick={() => { setDraftBlocks(draftBlocks.filter((block) => block.id !== editingBlock.id)); setEditingBlock(undefined); }}><Trash2 size={14} aria-hidden="true" />Delete</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => {
                    const start = new Date(Date.parse(editingBlock.start) + 24 * 3600_000);
                    const length = durationMinutes(editingBlock.start, editingBlock.end);
                    setDraftBlocks([...draftBlocks, { ...editingBlock, id: `draft_block_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`, start: start.toISOString(), end: new Date(start.getTime() + length * 60_000).toISOString() }]);
                    setEditingBlock(undefined);
                  }}><Copy size={14} aria-hidden="true" />Duplicate</Button>
                </>
              ) : null}
              <Button type="submit" variant="primary" size="sm"><Save size={14} aria-hidden="true" />{editingBlock.newBlock ? "Add block" : "Save changes"}</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={form === "goal"} onOpenChange={(open) => { if (!open) setForm(undefined); }} title="New goal" description="Define the outcome before creating work.">
        <form className="plan-block-form" onSubmit={submitGoal}>
          <Field label="Goal title">{({ id }) => <Input id={id} name="title" required minLength={3} maxLength={120} placeholder="Complete the statistics module" />}</Field>
          <Field label="Target date">{({ id }) => <Input id={id} name="date" type="date" required />}</Field>
          <Field label="What does success look like?">{({ id }) => <Input id={id} name="outcome" required minLength={3} maxLength={500} placeholder="Pass the final assessment and explain each core method" />}</Field>
          <div className="plan-block-form-actions"><LoadingButton type="submit" variant="primary" size="sm" loading={formBusy} loadingLabel="Saving…">Save goal</LoadingButton></div>
        </form>
      </Modal>

      <Modal open={form === "task"} onOpenChange={(open) => { if (!open) setForm(undefined); }} title="New task" description="Give the scheduler enough information to place real work.">
        <form className="plan-block-form" onSubmit={submitTask}>
          <Field label="Goal">
            {({ id }) => <Select id={id} name="goalId" required defaultValue={text(state.goals[0], "id")}>{state.goals.map((goal) => <option key={text(goal, "id")} value={text(goal, "id")}>{text(goal, "title")}</option>)}</Select>}
          </Field>
          <Field label="Task title">{({ id }) => <Input id={id} name="title" required minLength={3} maxLength={200} />}</Field>
          <div className="plan-block-form-row">
            <Field label="Estimated minutes">{({ id }) => <Input id={id} name="estimatedMinutes" type="number" min="5" max="1440" defaultValue="30" required />}</Field>
            <Field label="Deadline">{({ id }) => <Input id={id} name="deadline" type="datetime-local" />}</Field>
            <Field label="Priority">
              {({ id }) => <Select id={id} name="priority" defaultValue="3"><option value="5">Highest</option><option value="4">High</option><option value="3">Normal</option><option value="2">Low</option><option value="1">Lowest</option></Select>}
            </Field>
          </div>
          <Field label="How will you know it is done?">{({ id }) => <Input id={id} name="completionEvidence" maxLength={500} placeholder="Pass two unseen problems" />}</Field>
          <div className="plan-block-form-actions"><LoadingButton type="submit" variant="primary" size="sm" loading={formBusy} loadingLabel="Saving…">Save task</LoadingButton></div>
        </form>
      </Modal>
    </div>
  );
}
