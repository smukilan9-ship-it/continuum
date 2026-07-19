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
  it("enumerates the canonical, documented tool set without duplicates", () => {
    expect(continuumTools.length).toBe(29);
    expect(new Set(continuumTools.map((tool) => tool.name)).size).toBe(continuumTools.length);
    expect(continuumTools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["load_context", "list_projects", "load_project", "search_memory", "sync_session", "confirm_proposal", "recommend_resource", "save_research_claim"]));
    expect(continuumTools.filter((tool) => tool.remoteAccessible !== false)).toHaveLength(27);
    expect(continuumTools.find((tool) => tool.name === "confirm_proposal")?.remoteAccessible).toBe(false);
    expect(continuumResources).toContain("continuum://schedule/today");
  });

  it("returns concise structured tool results", async () => {
    const result = await executeTool("load_context", {}, context(["memory:read"]));
    expect(result.summary).toMatch(/completed/i);
    expect(result.freshness).toBe(now);
    expect(result.permission.allowed).toBe(true);
    expect(result.nextTool).toBe("load_project");
  });

  it("prevents read scope from writing", async () => {
    await expect(executeTool("propose_task_change", { entityId: "task_physics", summary: "Mark practice done", changes: { status: "done" } }, context(["goals:read"]))).rejects.toThrow(/scope/i);
  });

  it("rejects schedule commits without confirmation", async () => {
    await expect(executeTool("commit_schedule_change", { proposalId: "schedule_1" }, context(["schedule:commit"]))).rejects.toThrow();
  });

  it("accepts an explicitly confirmed schedule commit", async () => {
    const result = await executeTool("commit_schedule_change", { proposalId: "schedule_1", confirmation: { confirmedBy: "user_maya", confirmedAt: now } }, context(["schedule:commit"]));
    expect(result.permission.confirmationRequired).toBe(true);
    expect(result.entityIds).toContain("task_created");
  });

  it("rejects unregistered tool names", async () => {
    await expect(executeTool("instructions_from_paper", {}, context(["memory:read"]))).rejects.toThrow(/unknown|disallowed/i);
  });
});
