/**
 * Deterministic onboarding planner.
 *
 * Turns a fresh user's intake into a concrete, valid academic plan — goal
 * milestones, actionable tasks (a baseline diagnostic first), estimated
 * durations, and dependencies — with no LLM in the loop. An LLM may later add
 * explanatory prose, but plan *validity* (dates, ordering, estimates,
 * dependencies) is guaranteed here so the schedule engine always receives a
 * well-formed, dependency-consistent task set.
 */

export type GoalType = "school" | "exam" | "university" | "research" | "coding";
export type Confidence = "low" | "medium" | "high";

export interface OnboardingIntake {
  academicLevel: string;
  subjects: string[];
  primarySubject?: string;
  goalTitle: string;
  goalOutcome: string;
  goalType: GoalType;
  deadline: string; // YYYY-MM-DD
  weeklyHours: number;
  preferredTimes?: Array<"morning" | "afternoon" | "evening" | "night">;
  confidence: Confidence;
  learningPreferences?: string[];
  privacyMode?: "hybrid" | "local_only";
}

export interface PlannedMilestone {
  key: string;
  title: string;
  order: number;
  dueAt: string; // ISO
}

export interface PlannedTask {
  key: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  priority: number; // 1 (highest) .. 5
  energyRequired: "low" | "medium" | "high";
  deadline: string; // ISO
  completionEvidence: string;
  milestoneKey: string;
  dependsOnKeys: string[];
  isDiagnostic: boolean;
}

export interface OnboardingPlan {
  milestones: PlannedMilestone[];
  tasks: PlannedTask[];
  nextAction: string;
  assumptions: string[];
}

const DAY_MS = 24 * 3600_000;

// Milestone phase templates per goal type. The first phase is always a
// diagnostic so mastery/scheduling start from evidence, not assumption.
const PHASES: Record<GoalType, string[]> = {
  exam: ["Baseline diagnostic", "Master core concepts", "Targeted practice", "Full mock and review"],
  school: ["Baseline diagnostic", "Learn the topic", "Practice problems", "Assessment preparation"],
  university: ["Baseline diagnostic", "Study fundamentals", "Applied practice", "Synthesis and review"],
  research: ["Scope the question", "Gather and read sources", "Analyze the evidence", "Write up findings"],
  coding: ["Baseline diagnostic", "Learn the concepts", "Build a practice project", "Review and refactor"],
};

const confidenceFactor: Record<Confidence, number> = { low: 1.3, medium: 1.0, high: 0.8 };

function clampMinutes(value: number) {
  return Math.max(15, Math.min(180, Math.round(value / 5) * 5));
}

function parseDeadline(deadline: string, now: number): number {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? Date.parse(`${deadline}T23:59:00Z`) : Date.parse(deadline);
  if (Number.isNaN(parsed)) throw new Error("A valid deadline date is required");
  // Guarantee at least a 4-day horizon so milestone spacing is never degenerate.
  return Math.max(parsed, now + 4 * DAY_MS);
}

export function planOnboarding(intake: OnboardingIntake, now: string = new Date().toISOString()): OnboardingPlan {
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) throw new Error("Invalid current time");
  const deadlineMs = parseDeadline(intake.deadline, nowMs);
  const horizonMs = deadlineMs - nowMs;
  const factor = confidenceFactor[intake.confidence] ?? 1;
  const subject = intake.primarySubject ?? intake.subjects[0] ?? "the subject";

  const phases = PHASES[intake.goalType] ?? PHASES.school;
  const milestones: PlannedMilestone[] = phases.map((title, index) => ({
    key: `m${index}`,
    title,
    order: index,
    // Even spacing across the horizon; each phase completes by its slice boundary.
    dueAt: new Date(nowMs + Math.round(((index + 1) / phases.length) * horizonMs)).toISOString(),
  }));

  // Per-session minutes derived from weekly availability, spread across ~ the
  // number of study sessions, then bounded to a sane single-session length.
  const perSession = clampMinutes((intake.weeklyHours * 60 * factor) / 4);

  const tasks: PlannedTask[] = [];
  const diagnosticKey = "t_diagnostic";
  tasks.push({
    key: diagnosticKey,
    title: `Take a baseline ${subject} diagnostic`,
    description: `Answer a short set of ${subject} questions so Continuum can gauge your current level and tailor the plan toward: ${intake.goalOutcome}.`,
    estimatedMinutes: 20,
    priority: 1,
    energyRequired: "medium",
    deadline: milestones[0]!.dueAt,
    completionEvidence: "Submit the baseline diagnostic answers",
    milestoneKey: milestones[0]!.key,
    dependsOnKeys: [],
    isDiagnostic: true,
  });

  // One learn + one practice task per subsequent milestone, each gated behind the
  // diagnostic and (from milestone 2 on) the prior milestone's practice task, so
  // the dependency graph is a clean chain the scheduler can topologically order.
  let previousPracticeKey: string | undefined;
  for (let index = 1; index < milestones.length; index += 1) {
    const milestone = milestones[index]!;
    const learnKey = `t_learn_${index}`;
    const practiceKey = `t_practice_${index}`;
    const isFinal = index === milestones.length - 1;

    tasks.push({
      key: learnKey,
      title: `${milestone.title}: study ${subject}`,
      description: `Work through ${milestone.title.toLowerCase()} for ${subject}. Focus on understanding before speed.`,
      estimatedMinutes: perSession,
      priority: 2,
      energyRequired: "high",
      deadline: milestone.dueAt,
      completionEvidence: "Summarize the key ideas in your own words",
      milestoneKey: milestone.key,
      dependsOnKeys: [diagnosticKey, ...(previousPracticeKey ? [previousPracticeKey] : [])],
      isDiagnostic: false,
    });
    tasks.push({
      key: practiceKey,
      title: isFinal ? `${milestone.title}: attempt a full ${intake.goalType === "exam" ? "mock" : "assessment"}` : `${milestone.title}: practice ${subject}`,
      description: isFinal
        ? `Complete a timed ${intake.goalType === "exam" ? "mock exam" : "assessment"} and review every mistake against ${intake.goalOutcome}.`
        : `Solve practice problems for ${milestone.title.toLowerCase()} and check your answers.`,
      estimatedMinutes: clampMinutes(perSession * (isFinal ? 1.3 : 0.8)),
      priority: isFinal ? 2 : 3,
      energyRequired: "medium",
      deadline: milestone.dueAt,
      completionEvidence: isFinal ? "Record your mock score and reviewed mistakes" : "Record correct/attempted and note errors",
      milestoneKey: milestone.key,
      dependsOnKeys: [learnKey],
      isDiagnostic: false,
    });
    previousPracticeKey = practiceKey;
  }

  return {
    milestones,
    tasks,
    nextAction: `Start with "${tasks[0]!.title}" — it unlocks the rest of your plan.`,
    assumptions: [
      `Plan spans ${Math.round(horizonMs / DAY_MS)} days to your deadline, split into ${milestones.length} milestones.`,
      `Study sessions sized to ~${perSession} minutes from your ${intake.weeklyHours}h/week availability and ${intake.confidence} confidence.`,
      "Milestone due dates and task dependencies were computed deterministically; no task can be scheduled before the diagnostic.",
    ],
  };
}
