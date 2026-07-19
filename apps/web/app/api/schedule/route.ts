import { DeterministicScheduler, type ScheduleInput } from "@continuum/domain";
import { academicTaskSchema, scheduleProposalSchema, type ScheduleProposal } from "@continuum/schemas";
import { NextResponse } from "next/server";
import { z } from "zod";
import { scheduleSeed } from "@/lib/demo-data";
import { getStore } from "@/lib/store";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";

export const runtime = "nodejs";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("propose") }),
  z.object({ action: z.literal("replan"), current: scheduleProposalSchema, missedBlockId: z.string().min(3) }),
  z.object({ action: z.literal("commit"), proposalId: z.string().min(3), confirmedAt: z.string().datetime({ offset: true }) }),
]);

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

function userInput(snapshot: Record<string, unknown>, timezone: string, now: string): { input: ScheduleInput; tasks: Row[] } {
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
      minimumBlockMinutes: Math.min(estimate, 25), maximumBlockMinutes: Math.min(estimate, 90), splittable: estimate > 45,
      completionEvidence: typeof task.completionEvidence === "string" ? task.completionEvidence : undefined, resourceIds: [],
    });
  });
  const start = Date.parse(now) + 10 * 60_000;
  const availability = Array.from({ length: 7 }, (_, day) => ({
    start: new Date(start + day * 24 * 3600_000).toISOString(),
    end: new Date(start + day * 24 * 3600_000 + (day === 0 ? 8 : 6) * 3600_000).toISOString(),
    energy: day === 0 ? "high" as const : "medium" as const,
  }));
  return { input: { tasks, availability, constraints: [], timezone, bufferMinutes: 10, now }, tasks: rows };
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
      await store.write("confirm_proposal", { proposalId: parsed.data.proposalId, confirmedBy: user.id, confirmedAt: parsed.data.confirmedAt }, now, "standalone_app");
      const committed = await store.write("commit_schedule_change", { proposalId: parsed.data.proposalId, confirmation: { confirmedBy: user.id, confirmedAt: parsed.data.confirmedAt } }, now, "standalone_app");
      return NextResponse.json({ committed: committed.data, schedule: await store.read("load_schedule", { maxTokens: 4000 }) });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Schedule could not be committed" }, { status: 409 });
    }
  }

  const snapshot = await store.snapshot();
  const useSeed = user.id === "user_maya" && (!Array.isArray(snapshot.tasks) || snapshot.tasks.length === 0);
  const prepared = useSeed ? { input: demoInput(), tasks: scheduleSeed.tasks as unknown as Row[] } : userInput(snapshot, user.timezone, now);
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
    assumptions: useSeed ? ["No user tasks were available, so local development used the documented seeded planning input.", "No external calendar events were read or written."] : ["Until personal availability or a calendar connector is configured, Continuum uses seven six-to-eight-hour flexible study windows starting from now.", "No external calendar events were read or written."],
    route: { route: "deterministic", model: "continuum/constraint-solver-v1", reason: proposal.explanation[0], costClass: "none" },
  });
}
