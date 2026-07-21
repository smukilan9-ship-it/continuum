import { describe, expect, it } from "vitest";
import { planOnboarding, type OnboardingIntake } from "../packages/domain/src/onboarding";

const base: OnboardingIntake = {
  academicLevel: "CBSE Class 12",
  subjects: ["Physics", "Mathematics"],
  primarySubject: "Physics",
  goalTitle: "Ace the Class 12 Physics board exam",
  goalOutcome: "Score 90%+ and explain electric potential independently",
  goalType: "exam",
  deadline: "2026-09-30",
  weeklyHours: 10,
  confidence: "low",
};
const now = "2026-07-21T00:00:00.000Z";

describe("onboarding planner", () => {
  it("produces phase milestones with a diagnostic first and ordered due dates", () => {
    const plan = planOnboarding(base, now);
    expect(plan.milestones.length).toBeGreaterThanOrEqual(4);
    expect(plan.milestones[0]!.title.toLowerCase()).toContain("diagnostic");
    const dueTimes = plan.milestones.map((m) => Date.parse(m.dueAt));
    expect(dueTimes).toEqual([...dueTimes].sort((a, b) => a - b)); // monotonically increasing
    expect(dueTimes[dueTimes.length - 1]).toBeLessThanOrEqual(Date.parse("2026-09-30T23:59:00Z") + 1000);
  });

  it("makes the first task a diagnostic with no dependencies, and chains the rest", () => {
    const plan = planOnboarding(base, now);
    expect(plan.tasks[0]!.isDiagnostic).toBe(true);
    expect(plan.tasks[0]!.dependsOnKeys).toEqual([]);
    // Every non-diagnostic task depends on at least the diagnostic (directly or via chain).
    for (const task of plan.tasks.slice(1)) {
      expect(task.dependsOnKeys.length).toBeGreaterThanOrEqual(1);
    }
    // Dependencies must reference earlier task keys only (acyclic, topologically valid).
    const seen = new Set<string>();
    for (const task of plan.tasks) {
      for (const dep of task.dependsOnKeys) expect(seen.has(dep)).toBe(true);
      seen.add(task.key);
    }
  });

  it("keeps every task estimate within schedulable bounds", () => {
    const plan = planOnboarding(base, now);
    for (const task of plan.tasks) {
      expect(task.estimatedMinutes).toBeGreaterThanOrEqual(15);
      expect(task.estimatedMinutes).toBeLessThanOrEqual(180);
      expect(task.priority).toBeGreaterThanOrEqual(1);
      expect(task.priority).toBeLessThanOrEqual(5);
    }
  });

  it("is deterministic (same intake + now => identical plan)", () => {
    expect(planOnboarding(base, now)).toEqual(planOnboarding(base, now));
  });

  it("scales session length with confidence", () => {
    const low = planOnboarding({ ...base, confidence: "low" }, now).tasks.find((t) => !t.isDiagnostic)!;
    const high = planOnboarding({ ...base, confidence: "high" }, now).tasks.find((t) => !t.isDiagnostic)!;
    expect(low.estimatedMinutes).toBeGreaterThan(high.estimatedMinutes);
  });

  it("uses goal-type-specific phases and a floor horizon for near deadlines", () => {
    expect(planOnboarding({ ...base, goalType: "research" }, now).milestones[0]!.title.toLowerCase()).toContain("scope");
    // A deadline in the past/too-soon still yields ordered, future-dated milestones.
    const tight = planOnboarding({ ...base, deadline: "2026-07-22" }, now);
    expect(tight.milestones.every((m) => Date.parse(m.dueAt) > Date.parse(now))).toBe(true);
  });

  it("always sets a concrete next action pointing at the diagnostic", () => {
    const plan = planOnboarding(base, now);
    expect(plan.nextAction).toContain(plan.tasks[0]!.title);
  });
});
