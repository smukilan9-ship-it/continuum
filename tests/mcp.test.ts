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
    expect(continuumTools.length).toBe(33);
    expect(new Set(continuumTools.map((tool) => tool.name)).size).toBe(continuumTools.length);
    expect(continuumTools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["load_context", "list_context_packs", "get_context_pack", "get_context_changes_since", "record_approved_update", "list_projects", "load_project", "search_memory", "sync_session", "confirm_proposal", "recommend_resource", "save_research_claim"]));
    expect(continuumTools.filter((tool) => tool.remoteAccessible !== false)).toHaveLength(31);
    expect(continuumTools.find((tool) => tool.name === "confirm_proposal")?.remoteAccessible).toBe(false);
    expect(continuumResources).toContain("continuum://schedule/today");
    expect(continuumResources).toContain("continuum://context-packs");
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

  it("requires explicit, recent approval metadata for approved updates", async () => {
    await expect(executeTool("record_approved_update", { kind: "progress", entityId: "task_sql", summary: "Practised joins", detail: "Completed three exercises", provenance: ["exercise_set_1"] }, context(["memory:write"]))).rejects.toThrow();
    const result = await executeTool("record_approved_update", { kind: "progress", entityId: "task_sql", summary: "Practised joins", detail: "Completed three exercises", provenance: ["exercise_set_1"], approval: { approvedBy: "user_maya", approvedAt: now } }, context(["memory:write"]));
    expect(result.permission.confirmationRequired).toBe(true);
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

  it("threads shared state: an MCP write is retrievable by a subsequent MCP read", async () => {
    // Backs read/write with one store so this asserts read-after-write continuity
    // through the real tool dispatch + scope checks, not a per-call stub.
    const receipts: Array<Record<string, unknown>> = [];
    const sharedContext = (scopes: string[]) => ({
      scopes,
      now,
      read: (name: string, args: Record<string, unknown>) => {
        if (name === "load_outcome_receipt") return args.sessionId ? receipts.find((r) => r.sessionId === args.sessionId) ?? null : receipts.at(-1) ?? null;
        return { name, current: true };
      },
      write: (name: string, args: Record<string, unknown>) => {
        if (name === "sync_session") { const receipt = { id: "receipt_test", sessionId: args.sessionId, summary: args.summary, createdAt: now }; receipts.push(receipt); return { data: receipt, entityIds: [receipt.id], evidenceIds: [], summary: "Saved outcome receipt." }; }
        return { data: { name }, entityIds: ["task_created"], evidenceIds: [], summary: "Change recorded." };
      },
    });

    const written = await executeTool("sync_session", { sessionId: "session_abc", summary: "Passed the checkpoint." }, sharedContext(["memory:write"]));
    expect(written.entityIds).toContain("receipt_test");

    const read = await executeTool("load_outcome_receipt", { sessionId: "session_abc" }, sharedContext(["memory:read"]));
    expect((read.data as { sessionId?: string; summary?: string }).sessionId).toBe("session_abc");
    expect((read.data as { summary?: string }).summary).toBe("Passed the checkpoint.");
  });
});
