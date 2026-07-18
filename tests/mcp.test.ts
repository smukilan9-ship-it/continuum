import { describe, expect, it } from "vitest";
import { continuumResources, continuumTools, executeTool } from "../packages/mcp/src";

const now = "2026-07-18T09:00:00+05:30";
const context = (scopes: string[]) => ({
  scopes,
  now,
  read: (name: string) => ({ name, current: true }),
  write: (name: string) => ({ data: { name }, entityIds: ["task_created"], evidenceIds: [], summary: "Change recorded." }),
});

describe("MCP contract", () => {
  it("enumerates a compact, documented tool set", () => {
    expect(continuumTools.length).toBe(16);
    expect(new Set(continuumTools.map((tool) => tool.name)).size).toBe(continuumTools.length);
    expect(continuumResources).toContain("continuum://schedule/today");
  });

  it("returns concise structured tool results", () => {
    const result = executeTool("get_current_context", {}, context(["memory:read"]));
    expect(result.summary).toMatch(/completed/i);
    expect(result.freshness).toBe(now);
    expect(result.permission.allowed).toBe(true);
    expect(result.nextTool).toBe("get_today_plan");
  });

  it("prevents read scope from writing", () => {
    expect(() => executeTool("create_task", { goalId: "goal_physics", title: "Practice", estimatedMinutes: 20 }, context(["goals:read"]))).toThrow(/scope/i);
  });

  it("rejects schedule commits without confirmation", () => {
    expect(() => executeTool("commit_schedule_change", { proposalId: "schedule_1" }, context(["schedule:commit"]))).toThrow();
  });

  it("accepts an explicitly confirmed schedule commit", () => {
    const result = executeTool("commit_schedule_change", { proposalId: "schedule_1", confirmation: { confirmedBy: "user_maya", confirmedAt: now } }, context(["schedule:commit"]));
    expect(result.permission.confirmationRequired).toBe(true);
    expect(result.entityIds).toContain("task_created");
  });

  it("rejects unregistered tool names", () => {
    expect(() => executeTool("instructions_from_paper", {}, context(["memory:read"]))).toThrow(/unknown|disallowed/i);
  });
});
