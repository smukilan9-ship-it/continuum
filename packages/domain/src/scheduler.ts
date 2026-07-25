import {
  academicTaskSchema,
  scheduleProposalSchema,
  type AcademicTask,
  type ScheduleBlock,
  type ScheduleProposal,
} from "@continuum/schemas";

export interface AvailabilityWindow {
  start: string;
  end: string;
  energy: "low" | "medium" | "high";
}

export interface CalendarConstraint {
  id: string;
  title: string;
  start: string;
  end: string;
  hard: boolean;
}

export interface ScheduleInput {
  tasks: AcademicTask[];
  availability: AvailabilityWindow[];
  constraints: CalendarConstraint[];
  timezone: string;
  bufferMinutes?: number;
  now: string;
}

export interface Scheduler {
  propose(input: ScheduleInput): ScheduleProposal;
  replan(input: ScheduleInput, current: ScheduleProposal, missedBlockId: string): ScheduleProposal;
}

type Interval = { start: number; end: number; energy: AvailabilityWindow["energy"] };

const MINUTE = 60_000;
const energyRank = { low: 1, medium: 2, high: 3 } as const;

function toMs(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`Invalid date: ${value}`);
  return parsed;
}

function iso(value: number) {
  return new Date(value).toISOString();
}

function subtract(interval: Interval, blocked: { start: number; end: number }): Interval[] {
  if (blocked.end <= interval.start || blocked.start >= interval.end) return [interval];
  const result: Interval[] = [];
  if (blocked.start > interval.start) result.push({ ...interval, end: blocked.start });
  if (blocked.end < interval.end) result.push({ ...interval, start: blocked.end });
  return result;
}

function availableIntervals(input: ScheduleInput): Interval[] {
  const hard = input.constraints
    .filter((item) => item.hard)
    .map((item) => ({ start: toMs(item.start), end: toMs(item.end) }))
    .sort((a, b) => a.start - b.start);

  return input.availability
    .flatMap((window) => {
      let intervals: Interval[] = [{ start: toMs(window.start), end: toMs(window.end), energy: window.energy }];
      for (const block of hard) intervals = intervals.flatMap((item) => subtract(item, block));
      return intervals;
    })
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start);
}

function topologicalTasks(tasks: AcademicTask[]): AcademicTask[] {
  const active = tasks.filter((task) => task.status !== "done").map((task) => academicTaskSchema.parse(task));
  const byId = new Map(active.map((task) => [task.id, task]));
  const remaining = new Set(active.map((task) => task.id));
  const result: AcademicTask[] = [];

  while (remaining.size) {
    const ready = [...remaining]
      .map((id) => byId.get(id)!)
      .filter((task) => task.dependencies.every((dependency) => !remaining.has(dependency)))
      .sort((a, b) => {
        const aDeadline = a.deadline ? toMs(a.deadline) : Number.MAX_SAFE_INTEGER;
        const bDeadline = b.deadline ? toMs(b.deadline) : Number.MAX_SAFE_INTEGER;
        const riskDelta = aDeadline - bDeadline;
        return riskDelta || b.priority - a.priority || a.title.localeCompare(b.title);
      });

    if (!ready.length) throw new Error("Task dependencies contain a cycle");
    const next = ready[0]!;
    result.push(next);
    remaining.delete(next.id);
  }

  return result;
}

function createId(taskId: string, sequence: number) {
  return `block_${taskId.replace(/^task_/, "")}_${sequence}`;
}

function placeTask(
  task: AcademicTask,
  intervals: Interval[],
  sequence: number,
  notBefore: number,
  bufferMinutes: number,
): { blocks: ScheduleBlock[]; remainingMinutes: number; nextSequence: number } {
  let remaining = task.estimatedMinutes;
  let blockSequence = sequence;
  const blocks: ScheduleBlock[] = [];

  const ordered = [...intervals].sort((a, b) => {
    const aFit = energyRank[a.energy] >= energyRank[task.energyRequired] ? 0 : 1;
    const bFit = energyRank[b.energy] >= energyRank[task.energyRequired] ? 0 : 1;
    return aFit - bFit || a.start - b.start;
  });

  for (const interval of ordered) {
    if (remaining <= 0) break;
    const start = Math.max(interval.start, notBefore);
    const capacity = Math.floor((interval.end - start) / MINUTE) - bufferMinutes;
    if (capacity < task.minimumBlockMinutes) continue;

    const duration = Math.min(remaining, task.maximumBlockMinutes, capacity);
    if (duration < task.minimumBlockMinutes) continue;
    if (!task.splittable && duration < remaining) continue;

    const end = start + duration * MINUTE;
    blocks.push({
      id: createId(task.id, blockSequence++),
      taskId: task.id,
      title: task.title,
      start: iso(start),
      end: iso(end),
      status: "planned",
      flexible: true,
      completionEvidenceRequired: Boolean(task.completionEvidence),
    });
    remaining -= duration;
    interval.start = end + bufferMinutes * MINUTE;
  }

  return { blocks, remainingMinutes: remaining, nextSequence: blockSequence };
}

export class DeterministicScheduler implements Scheduler {
  propose(input: ScheduleInput): ScheduleProposal {
    const intervals = availableIntervals(input);
    const tasks = topologicalTasks(input.tasks);
    const blocks: ScheduleBlock[] = [];
    const unscheduledTaskIds: string[] = [];
    const explanations: string[] = [];
    const completionByTask = new Map<string, number>();
    let sequence = 1;

    for (const task of tasks) {
      const dependencyEnd = task.dependencies.reduce(
        (latest, dependency) => Math.max(latest, completionByTask.get(dependency) ?? toMs(input.now)),
        toMs(input.now),
      );
      const placed = placeTask(task, intervals, sequence, dependencyEnd, input.bufferMinutes ?? 10);
      sequence = placed.nextSequence;
      blocks.push(...placed.blocks);
      if (placed.blocks.length) completionByTask.set(task.id, toMs(placed.blocks.at(-1)!.end));
      if (placed.remainingMinutes > 0) unscheduledTaskIds.push(task.id);
    }

    blocks.sort((a, b) => toMs(a.start) - toMs(b.start));
    explanations.push(`Hard commitments, task dependencies, energy fit, and ${input.bufferMinutes ?? 10}-minute buffers were enforced deterministically.`);
    if (unscheduledTaskIds.length) explanations.push(`${unscheduledTaskIds.length} task(s) need more available time before their deadlines.`);
    else explanations.push("Every active task fits inside the available study windows.");

    return scheduleProposalSchema.parse({
      id: `schedule_${Date.parse(input.now)}`,
      timezone: input.timezone,
      blocks,
      unscheduledTaskIds,
      preservedBlockIds: [],
      explanation: explanations,
      requiresConfirmation: true,
      generatedAt: new Date(toMs(input.now)).toISOString(),
    });
  }

  replan(input: ScheduleInput, current: ScheduleProposal, missedBlockId: string): ScheduleProposal {
    const missed = current.blocks.find((block) => block.id === missedBlockId);
    if (!missed) throw new Error("Missed block was not found");

    const cutoff = toMs(missed.start);
    const preserved = current.blocks.filter(
      (block) => block.status === "done" || (toMs(block.end) <= cutoff && block.id !== missedBlockId),
    );
    const preservedTaskIds = new Set(preserved.map((block) => block.taskId));
    const affectedTasks = input.tasks
      .filter((task) => !preservedTaskIds.has(task.id))
      .map((task) => (task.id === missed.taskId ? { ...task, status: "backlog" as const } : task));
    const afterMiss = iso(Math.max(toMs(input.now), cutoff + MINUTE));
    const replanned = this.propose({
      ...input,
      now: afterMiss,
      tasks: affectedTasks,
      availability: input.availability
        .map((window) => ({ ...window, start: iso(Math.max(toMs(window.start), toMs(afterMiss))) }))
        .filter((window) => toMs(window.end) > toMs(window.start)),
      constraints: [
        ...input.constraints,
        ...preserved.map((block) => ({ id: `constraint_${block.id}`, title: block.title, start: block.start, end: block.end, hard: true })),
      ],
    });

    return scheduleProposalSchema.parse({
      ...replanned,
      id: `schedule_replan_${Date.parse(afterMiss)}`,
      blocks: [...preserved, ...replanned.blocks].sort((a, b) => toMs(a.start) - toMs(b.start)),
      preservedBlockIds: preserved.map((block) => block.id),
      explanation: [
        `Replanned only work affected by the missed “${missed.title}” block.`,
        "Completed work and earlier unaffected blocks were preserved.",
        ...replanned.explanation,
      ],
    });
  }
}

export function assertScheduleCommitAllowed(confirmation?: { confirmedBy: string; confirmedAt: string }) {
  if (!confirmation?.confirmedBy || !confirmation.confirmedAt) {
    throw new Error("Explicit confirmation metadata is required before committing a schedule change");
  }
  if (Number.isNaN(Date.parse(confirmation.confirmedAt))) throw new Error("Confirmation timestamp is invalid");
  return true;
}
