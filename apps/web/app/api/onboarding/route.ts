import { DeterministicScheduler, planOnboarding, type OnboardingIntake } from "@continuum/domain";
import { academicTaskSchema, type AcademicTask } from "@continuum/schemas";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 30;

const intakeSchema = z.object({
  academicLevel: z.string().trim().min(1).max(120),
  subjects: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  primarySubject: z.string().trim().min(1).max(80).optional(),
  goalTitle: z.string().trim().min(3).max(120),
  goalOutcome: z.string().trim().min(3).max(500),
  goalType: z.enum(["school", "exam", "university", "research", "coding"]),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Deadline must be YYYY-MM-DD"),
  weeklyHours: z.number().min(1).max(80),
  preferredTimes: z.array(z.enum(["morning", "afternoon", "evening", "night"])).max(4).optional(),
  confidence: z.enum(["low", "medium", "high"]),
  learningPreferences: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  privacyMode: z.enum(["hybrid", "local_only"]).default("hybrid"),
});

type Store = ReturnType<typeof getStore>;

async function existingPlan(store: Store, goals: Array<Record<string, unknown>>) {
  const goal = goals[0]!;
  const goalId = String(goal.id);
  const [milestones, snapshot] = await Promise.all([store.listMilestones(goalId), store.workspace("goals")]);
  const tasks = (Array.isArray(snapshot.tasks) ? snapshot.tasks : []).filter((task) => String((task as Record<string, unknown>).goalId) === goalId);
  return { goal, milestones, tasks, schedule: snapshot.schedule ?? [] };
}

// Deterministic 7-day availability derived from weekly hours. Day 0 starts a few
// minutes from now; later days are full study windows. This mirrors the proven
// windowing used by /api/schedule so the generated plan is always valid.
function availabilityWindows(now: string, weeklyHours: number) {
  const dailyMinutes = Math.max(60, Math.min(360, Math.round((weeklyHours * 60) / 7)));
  const start = Date.parse(now) + 10 * 60_000;
  return Array.from({ length: 7 }, (_, day) => ({
    start: new Date(start + day * 24 * 3600_000).toISOString(),
    end: new Date(start + day * 24 * 3600_000 + (day === 0 ? Math.max(dailyMinutes, 120) : dailyMinutes) * 60_000).toISOString(),
    energy: day % 3 === 0 ? ("high" as const) : ("medium" as const),
  }));
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin onboarding is not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "onboarding", Number(process.env.ONBOARDING_ACTIONS_PER_HOUR ?? 20), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Onboarding rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "3600" } });
  const parsed = intakeSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid onboarding details", issues: parsed.error.issues }, { status: 400 });

  const store = getStore(user.id);
  const now = new Date().toISOString();

  // Idempotency: a user who already has a goal keeps their existing plan; retries
  // never create a duplicate goal/milestone/task set.
  const goalsSnapshot = await store.workspace("goals");
  const existingGoals = Array.isArray(goalsSnapshot.goals) ? (goalsSnapshot.goals as Array<Record<string, unknown>>) : [];
  if (existingGoals.length) {
    return NextResponse.json({ status: "already_onboarded", plan: await existingPlan(store, existingGoals) }, { status: 200 });
  }

  const intake = parsed.data as OnboardingIntake;
  const plan = planOnboarding(intake, now);

  try {
    await store.saveOnboardingIntake(intake.academicLevel, { ...intake, plannedAt: now }, now);

    // 1) Goal
    const goalResult = await store.write("create_goal", { title: intake.goalTitle, outcome: intake.goalOutcome, targetDate: intake.deadline }, now, "standalone_app");
    const goalId = String((goalResult.data as { id: string }).id);

    // 2) Milestones
    for (const milestone of plan.milestones) {
      await store.createMilestone({ id: `milestone_${goalId.replace(/^goal_/, "")}_${milestone.order}`, goalId, title: milestone.title, order: milestone.order, dueAt: milestone.dueAt }, now);
    }

    // 3) Tasks, in dependency order, mapping planner keys -> real ids so
    // persisted dependencies reference real task rows.
    const keyToId = new Map<string, string>();
    const createdTasks: AcademicTask[] = [];
    // The initial 7-day schedule covers only near-term work (the diagnostic and
    // the first learning milestone). Later-milestone tasks stay in the backlog
    // and are scheduled by /api/schedule as their milestones approach, instead of
    // being crammed into — and reported unscheduled against — week one.
    const nearTermMilestones = new Set(plan.milestones.slice(0, 2).map((milestone) => milestone.key));
    const nearTermTaskIds = new Set<string>();
    for (const task of plan.tasks) {
      const dependsOn = task.dependsOnKeys.map((key) => keyToId.get(key)).filter((value): value is string => Boolean(value));
      const result = await store.write("create_task", {
        goalId,
        title: task.title,
        description: task.description,
        estimatedMinutes: task.estimatedMinutes,
        priority: task.priority,
        energyRequired: task.energyRequired,
        deadline: task.deadline,
        completionEvidence: task.completionEvidence,
        dependsOn,
        generatedBy: "onboarding",
      }, now, "standalone_app");
      const taskId = String((result.data as { id: string }).id);
      keyToId.set(task.key, taskId);
      if (nearTermMilestones.has(task.milestoneKey)) nearTermTaskIds.add(taskId);
      createdTasks.push(academicTaskSchema.parse({
        id: taskId, goalId, title: task.title, description: task.description, status: "backlog",
        estimatedMinutes: task.estimatedMinutes, deadline: task.deadline, priority: task.priority,
        energyRequired: task.energyRequired, dependencies: dependsOn,
        minimumBlockMinutes: Math.min(task.estimatedMinutes, 25), maximumBlockMinutes: Math.min(Math.max(task.estimatedMinutes, 25), 90),
        splittable: task.estimatedMinutes > 45, completionEvidence: task.completionEvidence, resourceIds: [],
      }));
    }

    // 4) Initial 7-day schedule (deterministic) → proposed, confirmed, committed.
    let scheduleStatus: Record<string, unknown> = { status: "not_generated" };
    try {
      const scheduler = new DeterministicScheduler();
      // Only near-term tasks are scheduled into the first week; their dependency
      // edges are filtered to the near-term set so the sub-plan stays acyclic.
      const schedulableTasks = createdTasks
        .filter((task) => nearTermTaskIds.has(task.id))
        .map((task) => ({ ...task, dependencies: task.dependencies.filter((id) => nearTermTaskIds.has(id)) }));
      const proposal = scheduler.propose({ tasks: schedulableTasks, availability: availabilityWindows(now, intake.weeklyHours), constraints: [], timezone: user.timezone, bufferMinutes: 10, now });
      if (proposal.blocks.length) {
        const proposed = await store.write("propose_schedule_change", { summary: "Commit the initial onboarding plan", reason: proposal.explanation.join(" "), changes: { blocks: proposal.blocks, unscheduledTaskIds: proposal.unscheduledTaskIds, timezone: proposal.timezone } }, now, "standalone_app");
        const proposalId = String((proposed.data as { id: string }).id);
        await store.write("confirm_proposal", { proposalId, confirmedBy: user.id, confirmedAt: now }, now, "standalone_app");
        const committed = await store.write("commit_schedule_change", { proposalId, confirmation: { confirmedBy: user.id, confirmedAt: now } }, now, "standalone_app");
        scheduleStatus = { status: "committed", blocks: (committed.data as { blocks?: unknown[] }).blocks?.length ?? proposal.blocks.length, unscheduled: proposal.unscheduledTaskIds.length };
      } else {
        scheduleStatus = { status: "empty", reason: "No study windows could hold the generated tasks." };
      }
    } catch (scheduleError) {
      // A schedule failure must not undo the goal/milestone/task plan.
      scheduleStatus = { status: "deferred", reason: scheduleError instanceof Error ? scheduleError.message : "Schedule could not be generated now." };
    }

    const finalSchedule = await store.read("load_schedule", { maxTokens: 4000 });
    return NextResponse.json({
      status: "onboarded",
      goal: goalResult.data,
      milestones: await store.listMilestones(goalId),
      tasks: createdTasks.map((task) => ({ id: task.id, title: task.title, estimatedMinutes: task.estimatedMinutes, priority: task.priority, deadline: task.deadline, dependencies: task.dependencies })),
      schedule: scheduleStatus,
      scheduleBlocks: finalSchedule,
      nextAction: plan.nextAction,
      assumptions: plan.assumptions,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Onboarding plan could not be created" }, { status: 500 });
  }
}
