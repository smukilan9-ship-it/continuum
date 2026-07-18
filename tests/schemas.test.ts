import { describe, expect, it } from "vitest";
import { academicTaskSchema, diagnosticResultSchema, routeDecisionSchema } from "../packages/schemas/src";

describe("shared schemas", () => {
  it("rejects impossible task block limits", () => {
    expect(() => academicTaskSchema.parse({ id: "task_bad", goalId: "goal_test", title: "Bad task", status: "backlog", estimatedMinutes: 20, priority: 3, energyRequired: "low", dependencies: [], minimumBlockMinutes: 30, maximumBlockMinutes: 10, splittable: true, resourceIds: [] })).toThrow();
  });

  it("rejects incomplete diagnostic model output", () => {
    expect(() => diagnosticResultSchema.parse({ id: "diagnostic_bad" })).toThrow();
  });

  it("accepts a transparent route decision", () => {
    expect(routeDecisionSchema.parse({ id: "route_valid", taskClass: "classification", route: "groq", model: "groq/fast", reason: "Bounded task", sourceMode: "none", verification: "not_required", costClass: "low", fallbackUsed: false, createdAt: "2026-07-18T09:00:00+05:30" }).route).toBe("groq");
  });
});
