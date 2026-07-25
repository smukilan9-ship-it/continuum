import { DeterministicScheduler, type ScheduleInput } from "@continuum/domain";
import { academicTaskSchema, scheduleProposalSchema, type ScheduleProposal } from "@continuum/schemas";
import { NextResponse } from "next/server";
import { z } from "zod";
import { scheduleSeed } from "@/lib/demo-data";
import { getStore } from "@/lib/store";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";

export const runtime = "nodejs";

const scheduleIntakeSchema = z.object({
  wakeTime: z.string().regex(/^\d{2}:\d{2}$/),
  sleepTime: z.string().regex(/^\d{2}:\d{2}$/),
  fixedCommitments: z.string().max(4000).default(""),
  weekdayFree: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/),
  weekendFree: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/),
  priorities: z.string().max(3000).default(""),
  deadlines: z.string().max(3000).default(""),
  sessionLength: z.number().int().min(15).max(180),
  breakMinutes: z.number().int().min(0).max(60),
  noDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  maxDailyMinutes: z.number().int().min(15).max(720),
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("propose"), intake: scheduleIntakeSchema }),
  z.object({ action: z.literal("replan"), current: scheduleProposalSchema, missedBlockId: z.string().min(3) }),
  z.object({ action: z.literal("commit"), proposalId: z.string().min(3), confirmedAt: z.string().datetime({ offset: true }), blocks: scheduleProposalSchema.shape.blocks.min(1).max(200) }),
]);

type ScheduleIntake = z.infer<typeof scheduleIntakeSchema>;

type Row = Record<string, unknown>;

function displayItems(proposal: ScheduleProposal, tasks: Row[], timezone: string) {
  const taskById = new Map(tasks.map((task) => [String(task.id), task]));
  const formatter = new Intl.DateTimeFormat("en-IN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false });
  return proposal.blocks.map((block) => {
    const task = taskById.get(block.taskId) ?? {};
    return {
      id: block.id,
      taskId: block.taskId,
      time: formatter.format(new Date(block.start)),
      end: formatter.format(new Date(block.end)),
      duration: Math.round((Date.parse(block.end) - Date.parse(block.start)) / 60_000),
      title: block.title,
      kind: "study",
      status: block.status,
      flexible: block.flexible,
      evidence: typeof task.completionEvidence === "string" ? task.completionEvidence : "Record completion evidence",
      reason: "Placed by deadline, priority, energy fit, dependencies, and available capacity.",
    };
  });
}

function demoInput(): ScheduleInput {
  return {
    ...scheduleSeed,
    tasks: scheduleSeed.tasks.map((task) => academicTaskSchema.parse(task)),
    availability: scheduleSeed.availability.map((window) => ({ ...window, energy: z.enum(["low", "medium", "high"]).parse(window.energy) })),
  };
}

function localIso(date: Date, time: string, timezone: string) {
  const [hour, minute] = time.split(":").map(Number);
  const guess = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const represented = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute));
  return new Date(guess - (represented - guess)).toISOString();
}

function freeWindow(value: string) {
  const [start, end] = value.split("-");
  return { start: start!, end: end! };
}

const weekdayIndex: Record<string, number> = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };

function intakeConstraints(intake: ScheduleIntake, dates: Date[], timezone: string) {
  return intake.fixedCommitments.split("\n").flatMap((line, index) => {
    const match = line.trim().match(/^(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\s+(\d{2}:\d{2})-(\d{2}:\d{2})\s+(.+)$/i);
    if (!match) return [];
    const day = weekdayIndex[match[1]!.toLowerCase()];
    const date = dates.find((candidate) => candidate.getDay() === day);
    if (!date) return [];
    const start = localIso(date, match[2]!, timezone);
    const end = localIso(date, match[3]!, timezone);
    return Date.parse(start) < Date.parse(end) ? [{ id: `intake_fixed_${index}`, title: match[4]!, start, end, hard: true }] : [];
  });
}

function userInput(snapshot: Record<string, unknown>, timezone: string, now: string, intake?: ScheduleIntake): { input: ScheduleInput; tasks: Row[] } {
  const rows = Array.isArray(snapshot.tasks) ? snapshot.tasks as Row[] : [];
  const goals = new Map((Array.isArray(snapshot.goals) ? snapshot.goals as Row[] : []).map((goal) => [String(goal.id), goal]));
  const deadline = (value: unknown) => {
    if (value instanceof Date) return value.toISOString();
    if (typeof value !== "string" || !value) return undefined;
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:00Z`) : new Date(value);
    return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString();
  };
  const tasks = rows.map((task) => {
    const estimate = Math.max(5, Math.min(480, Math.round(Number(task.estimatedMinutes ?? 30))));
    const energy = ["low", "medium", "high"].includes(String(task.energyRequired)) ? String(task.energyRequired) as "low" | "medium" | "high" : "medium";
    const status = ["backlog", "planned", "in_progress", "blocked", "done"].includes(String(task.status)) ? String(task.status) as "backlog" | "planned" | "in_progress" | "blocked" | "done" : "backlog";
    const goal = goals.get(String(task.goalId));
    return academicTaskSchema.parse({
      id: String(task.id), goalId: String(task.goalId), title: String(task.title), status, estimatedMinutes: estimate,
      deadline: deadline(task.deadline) ?? deadline(goal?.targetDate) ?? deadline(goal?.date),
      priority: Math.max(1, Math.min(5, Math.round(Number(task.priority ?? 3)))), energyRequired: energy, dependencies: [],
      minimumBlockMinutes: Math.min(estimate, 15), maximumBlockMinutes: Math.min(estimate, intake?.sessionLength ?? 90), splittable: estimate > (intake?.sessionLength ?? 45),
      completionEvidence: typeof task.completionEvidence === "string" ? task.completionEvidence : undefined, resourceIds: [],
    });
  });
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dates = Array.from({ length: 7 }, (_, day) => new Date(today.getTime() + day * 24 * 3600_000));
  const availability = intake ? dates.flatMap((date) => {
    if (intake.noDays.includes(date.getDay())) return [];
    const window = freeWindow([0, 6].includes(date.getDay()) ? intake.weekendFree : intake.weekdayFree);
    const boundedStart = window.start < intake.wakeTime ? intake.wakeTime : window.start;
    const boundedEnd = intake.sleepTime > intake.wakeTime && window.end > intake.sleepTime ? intake.sleepTime : window.end;
    const start = localIso(date, boundedStart, timezone);
    const windowEnd = localIso(date, boundedEnd, timezone);
    const end = new Date(Math.min(Date.parse(windowEnd), Date.parse(start) + intake.maxDailyMinutes * 60_000)).toISOString();
    return Date.parse(start) < Date.parse(end) ? [{ start, end, energy: "medium" as const }] : [];
  }) : dates.map((date, day) => ({
    start: new Date(Date.parse(now) + 10 * 60_000 + day * 24 * 3600_000).toISOString(),
    end: new Date(Date.parse(now) + 10 * 60_000 + day * 24 * 3600_000 + 6 * 3600_000).toISOString(),
    energy: "medium" as const,
  }));
  const savedConstraints = (Array.isArray(snapshot.calendarConstraints) ? snapshot.calendarConstraints as Row[] : []).flatMap((constraint) => {
    const start = constraint.startsAt instanceof Date ? constraint.startsAt.toISOString() : String(constraint.startsAt ?? "");
    const end = constraint.endsAt instanceof Date ? constraint.endsAt.toISOString() : String(constraint.endsAt ?? "");
    return Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end)) && Date.parse(start) < Date.parse(end) ? [{ id: String(constraint.id), title: String(constraint.title ?? "Busy"), start, end, hard: constraint.hard !== false }] : [];
  });
  const constraints = [...savedConstraints, ...(intake ? intakeConstraints(intake, dates, timezone) : [])];
  return { input: { tasks, availability, constraints, timezone, bufferMinutes: intake?.breakMinutes ?? 10, now }, tasks: rows };
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin schedule writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "schedule-write", Number(process.env.SCHEDULE_ACTIONS_PER_HOUR ?? 60), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Schedule action rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "3600" } });
  const parsed = requestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid schedule action", issues: parsed.error.issues }, { status: 400 });
  const store = getStore(user.id);
  const now = new Date().toISOString();

  if (parsed.data.action === "commit") {
    try {
      const edited = await store.write("propose_schedule_change", {
        summary: "Save the edited weekly schedule",
        reason: "The user directly edited and confirmed this draft.",
        changes: { blocks: parsed.data.blocks, timezone: user.timezone },
      }, now, "standalone_app");
      const editedProposalId = String((edited.data as { id?: string }).id ?? "");
      if (!editedProposalId) throw new Error("The edited schedule could not be saved as a proposal");
      await store.write("confirm_proposal", { proposalId: editedProposalId, confirmedBy: user.id, confirmedAt: parsed.data.confirmedAt }, now, "standalone_app");
      const committed = await store.write("commit_schedule_change", { proposalId: editedProposalId, confirmation: { confirmedBy: user.id, confirmedAt: parsed.data.confirmedAt } }, now, "standalone_app");
      await store.write("reject_proposal", { proposalId: parsed.data.proposalId }, now, "standalone_app").catch(() => undefined);
      return NextResponse.json({ committed: committed.data, schedule: await store.read("load_schedule", { maxTokens: 4000 }) });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Schedule could not be committed" }, { status: 409 });
    }
  }

  const snapshot = await store.workspace("goals");
  const useSeed = user.id === "user_maya" && (!Array.isArray(snapshot.tasks) || snapshot.tasks.length === 0);
  const prepared = useSeed ? { input: demoInput(), tasks: scheduleSeed.tasks as unknown as Row[] } : userInput(snapshot, user.timezone, now, parsed.data.action === "propose" ? parsed.data.intake : undefined);
  const scheduler = new DeterministicScheduler();
  let proposal = scheduler.propose(prepared.input);
  if (parsed.data.action === "replan") {
    const replan = parsed.data;
    proposal = scheduler.replan({ ...prepared.input, now: replan.current.blocks.find((block) => block.id === replan.missedBlockId)?.end ?? prepared.input.now }, replan.current, replan.missedBlockId);
  }

  const saved = await store.write("propose_schedule_change", {
    summary: parsed.data.action === "replan" ? "Repair the affected schedule blocks" : "Commit the generated academic plan",
    reason: proposal.explanation.join(" "),
    changes: { blocks: proposal.blocks, unscheduledTaskIds: proposal.unscheduledTaskIds, timezone: proposal.timezone },
  }, now, "standalone_app");
  const durableProposalId = (saved.data as { id?: string }).id;
  if (parsed.data.action === "replan") await store.appendEvent({ type: "schedule.replan.proposed", summary: `Replanned after the missed block while preserving ${proposal.preservedBlockIds.length} unaffected block${proposal.preservedBlockIds.length === 1 ? "" : "s"}.`, entityIds: [durableProposalId ?? proposal.id, parsed.data.missedBlockId], payload: { explanation: proposal.explanation, preservedBlockIds: proposal.preservedBlockIds, requiresConfirmation: true } });

  return NextResponse.json({
    proposal,
    proposalId: durableProposalId,
    items: displayItems(proposal, prepared.tasks, user.timezone),
    assumptions: useSeed ? ["No user tasks were available, so local development used the documented seeded planning input."] : parsed.data.action === "propose" ? ["This draft uses the wake, sleep, free-time, break, no-day, and workload limits you entered.", "Fixed commitments you entered are protected from overlap.", "Nothing changes until you edit and save the draft."] : ["Only the affected part of the draft was regenerated."],
  });
}
