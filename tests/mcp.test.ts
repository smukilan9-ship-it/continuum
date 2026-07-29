import { describe, expect, it } from "vitest";
import { continuumResources, continuumTools, discoverableTools, executeTool } from "../packages/mcp/src";

const now = "2026-07-18T09:00:00+05:30";

/** Records every store operation a tool triggers, so call counts are assertable. */
function recorder(overrides: Record<string, unknown> = {}) {
  const reads: string[] = [];
  const writes: string[] = [];
  return {
    reads,
    writes,
    context: (scopes: string[]) => ({
      scopes,
      now,
      read: (name: string) => {
        reads.push(name);
        return name in overrides ? overrides[name] : { name, current: true };
      },
      write: (name: string) => {
        writes.push(name);
        return { data: { name }, entityIds: [`${name}_entity`], evidenceIds: [], summary: "Change recorded." };
      },
    }),
  };
}

const ALL_SCOPES = ["memory:read", "memory:write", "goals:read", "goals:write", "research:read", "research:write", "learning:read", "learning:write", "schedule:read", "schedule:propose", "schedule:commit", "resources:read"];

const EXPECTED_SURFACE = [
  "find_in_continuum",
  "get_my_current_work",
  "open_goal",
  "open_project",
  "read_source_passage",
  "get_evidence_for_claim",
  "whats_changed",
  "get_study_status",
  "suggest_next_resource",
  "start_study_session",
  "record_practice_result",
  "save_to_continuum",
  "save_progress_note",
  "save_session_summary",
  "propose_change",
];

describe("the discoverable surface is outcome-shaped", () => {
  it("advertises exactly the consolidated tool set", () => {
    expect(discoverableTools.map((tool) => tool.name).sort()).toEqual([...EXPECTED_SURFACE].sort());
  });

  it("is far smaller than the operation set behind it", () => {
    // 33 low-level operations became 15 a model actually chooses between.
    expect(discoverableTools.length).toBe(15);
    expect(continuumTools.length).toBeGreaterThan(discoverableTools.length);
  });

  it("names no tool after an implementation detail", () => {
    for (const tool of discoverableTools) {
      expect(tool.name).not.toMatch(/context_pack|^load_|^list_|^sync_|^route_|_since$/);
    }
  });

  it("describes every tool by the outcome it serves, at usable length", () => {
    for (const tool of discoverableTools) {
      expect(tool.description.length).toBeGreaterThan(60);
      expect(tool.description).not.toMatch(/superseded/i);
    }
  });

  it("withdraws the specialist router entirely", () => {
    // It asked the calling model to route its own reasoning back through
    // Continuum: budget spent, no user outcome, and it muddied tool selection.
    expect(continuumTools.find((tool) => tool.name === "route_specialist_task")).toBeUndefined();
  });

  it("keeps superseded operations callable but undiscoverable", () => {
    const superseded = continuumTools.filter((tool) => tool.deprecated);
    expect(superseded.length).toBeGreaterThan(0);
    for (const tool of superseded) expect(discoverableTools).not.toContain(tool);
  });

  it("keeps the user's own actions out of reach of an assistant", () => {
    for (const name of ["save_decision", "confirm_proposal", "commit_schedule_change"]) {
      const tool = continuumTools.find((candidate) => candidate.name === name);
      expect(tool?.remoteAccessible).toBe(false);
      expect(discoverableTools.map((candidate) => candidate.name)).not.toContain(name);
    }
  });

  it("still exposes the compact state resources", () => {
    expect(continuumResources).toContain("continuum://schedule/today");
    expect(continuumResources).toContain("continuum://context-packs");
  });
});

describe("workflows resolve in at most two calls", () => {
  it("answers 'what am I working on' in one call", async () => {
    const store = recorder();
    const result = await executeTool("get_my_current_work", {}, store.context(ALL_SCOPES));
    expect(store.reads).toEqual(["load_context", "load_schedule"]);
    expect(result.summary).toMatch(/current goals/i);
  });

  it("answers 'what do I have about X' in one call", async () => {
    const store = recorder();
    await executeTool("find_in_continuum", { query: "spatial association" }, store.context(ALL_SCOPES));
    expect(store.reads).toEqual(["search_memory", "search_research"]);
  });

  it("resumes a session in one call", async () => {
    const store = recorder({ load_outcome_receipt: { id: "receipt_1", createdAt: now } });
    const result = await executeTool("whats_changed", {}, store.context(ALL_SCOPES));
    expect(store.reads).toEqual(["load_outcome_receipt", "get_context_changes_since"]);
    expect((result.data as { since: string }).since).toBe(now);
  });

  it("records a practice result and closes its activity in one call", async () => {
    const store = recorder();
    await executeTool("record_practice_result", { conceptId: "concept_geo", attemptId: "attempt_1", correct: true, unseen: true, activityId: "activity_1" }, store.context(ALL_SCOPES));
    expect(store.writes).toEqual(["complete_resource_activity", "record_learning_evidence"]);
  });

  it("saves a claim in one call", async () => {
    const store = recorder();
    await executeTool("save_to_continuum", { kind: "claim", projectId: "project_oasis", text: "Association is population-level.", evidence: [] }, store.context(ALL_SCOPES));
    expect(store.writes).toEqual(["save_research_claim"]);
  });
});

describe("degrading rather than failing", () => {
  it("searches only what the grant allows", async () => {
    const store = recorder();
    const result = await executeTool("find_in_continuum", { query: "immunohistochemistry" }, store.context(["memory:read"]));
    expect(store.reads).toEqual(["search_memory"]);
    expect((result.data as { searched: string[] }).searched).toEqual(["memory"]);
  });

  it("omits the schedule when the grant does not include it", async () => {
    const store = recorder();
    await executeTool("get_my_current_work", {}, store.context(["memory:read"]));
    expect(store.reads).toEqual(["load_context"]);
  });

  it("reports honestly when there is no previous session to resume from", async () => {
    const store = recorder({ load_outcome_receipt: null });
    const result = await executeTool("whats_changed", {}, store.context(ALL_SCOPES));
    expect(store.reads).toEqual(["load_outcome_receipt"]);
    expect(result.summary).toMatch(/no previous session/i);
  });
});

describe("writes stay inside their permission", () => {
  it("prevents a read scope from proposing a change", async () => {
    const store = recorder();
    await expect(executeTool("propose_change", { target: "task", summary: "Mark practice done", changes: { status: "done" } }, store.context(["goals:read"]))).rejects.toThrow(/scope/i);
  });

  it("measures a proposal against the scope its target actually needs", async () => {
    const store = recorder();
    // A schedule proposal must not pass on goals:write alone.
    await expect(executeTool("propose_change", { target: "schedule", summary: "Move Friday to Sunday", changes: {} }, store.context(["goals:write"]))).rejects.toThrow(/scope/i);
    await executeTool("propose_change", { target: "schedule", summary: "Move Friday to Sunday", changes: {} }, store.context(["schedule:propose"]));
    expect(store.writes).toEqual(["propose_schedule_change"]);
  });

  it("routes each proposal target to its own operation", async () => {
    for (const [target, expected] of [["goal", "propose_goal_change"], ["task", "propose_task_change"], ["project", "propose_project_change"]] as const) {
      const store = recorder();
      await executeTool("propose_change", { target, summary: "A change", changes: {} }, store.context(ALL_SCOPES));
      expect(store.writes).toEqual([expected]);
    }
  });

  it("says plainly that a proposal changed nothing", async () => {
    const store = recorder();
    const result = await executeTool("propose_change", { target: "goal", summary: "Raise the target", changes: {} }, store.context(ALL_SCOPES));
    expect(result.summary).toMatch(/nothing changed/i);
    expect(result.permission.confirmationRequired).toBe(true);
  });

  it("cannot mark work complete directly", async () => {
    const tool = continuumTools.find((candidate) => candidate.name === "save_progress_note");
    const statuses = (tool!.inputJsonSchema as { properties: { status: { enum: string[] } } }).properties.status.enum;
    expect(statuses).not.toContain("done");
    expect(statuses).not.toContain("completed");
  });

  it("keeps mastery honest about what raises it", async () => {
    const store = recorder();
    const seen = await executeTool("record_practice_result", { conceptId: "concept_geo", attemptId: "attempt_2", correct: true, unseen: false }, store.context(ALL_SCOPES));
    expect(seen.summary).toMatch(/only for a correct unseen assessment/i);
    const unseen = await executeTool("record_practice_result", { conceptId: "concept_geo", attemptId: "attempt_3", correct: true, unseen: true }, store.context(ALL_SCOPES));
    expect(unseen.summary).toMatch(/transfer mastery was updated/i);
  });
});

describe("results guide the next step", () => {
  it("stamps freshness and permission on every result", async () => {
    const store = recorder();
    const result = await executeTool("open_goal", { goalId: "goal_sat" }, store.context(ALL_SCOPES));
    expect(result.freshness).toBe(now);
    expect(result.permission.allowed).toBe(true);
    expect(store.reads).toEqual(["load_goal"]);
  });

  it("suggests where to go next from a discovery tool", async () => {
    const store = recorder();
    const found = await executeTool("find_in_continuum", { query: "OASIS" }, store.context(ALL_SCOPES));
    expect(found.nextTool).toBe("open_project");
    expect((found.data as { suggestedNext: string }).suggestedNext).toMatch(/open_project|read_source_passage/);
  });

  it("rejects an unregistered tool name", async () => {
    const store = recorder();
    await expect(executeTool("instructions_from_paper", {}, store.context(["memory:read"]))).rejects.toThrow(/unknown|disallowed/i);
  });
});

describe("read-after-write continuity through real dispatch", () => {
  it("makes an MCP write retrievable by a subsequent MCP read", async () => {
    const receipts: Array<Record<string, unknown>> = [];
    const shared = (scopes: string[]) => ({
      scopes,
      now,
      read: (name: string) => (name === "load_outcome_receipt" ? receipts.at(-1) ?? null : { name, current: true }),
      write: (name: string, args: Record<string, unknown>) => {
        if (name === "sync_session") {
          const receipt = { id: "receipt_test", sessionId: args.sessionId, summary: args.summary, createdAt: now };
          receipts.push(receipt);
          return { data: receipt, entityIds: [receipt.id], evidenceIds: [], summary: "Saved outcome receipt." };
        }
        return { data: { name }, entityIds: ["entity"], evidenceIds: [], summary: "Change recorded." };
      },
    });

    const written = await executeTool("save_session_summary", { sessionId: "session_abc", summary: "Passed the checkpoint." }, shared(["memory:write"]));
    expect(written.entityIds).toContain("receipt_test");

    const resumed = await executeTool("whats_changed", {}, shared(["memory:read"]));
    expect((resumed.data as { lastSession: { summary: string } }).lastSession.summary).toBe("Passed the checkpoint.");
  });
});
