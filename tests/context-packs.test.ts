import { describe, expect, it } from "vitest";
import { buildContextPacks, contextPackMarkdown, getContextPack } from "../apps/web/lib/context-packs";

const state = {
  goals: [{ id: "goal_sql", title: "SQL mastery", status: "active", targetDate: "2026-08-01", updatedAt: "2026-07-20T10:00:00Z" }],
  tasks: [{ id: "task_1", goalId: "goal_sql", title: "Window functions", status: "planned" }],
  projects: [{ id: "project_oasis", title: "OASIS", updatedAt: "2026-07-21T10:00:00Z" }],
  decisions: [{ id: "decision_1", projectId: "project_oasis", text: "Use patient-grouped validation" }],
  claims: [{ id: "claim_1", projectId: "project_oasis", text: "Association across serial sections" }],
  sources: [{ id: "source_1", projectId: "project_oasis", title: "Methods" }],
  schedule: [{ id: "block_1", goalId: "goal_sql", title: "SQL practice" }],
  learningStates: [{ conceptId: "concept_window", status: "misconception_detected", evidenceIds: ["attempt_1"] }],
  receipts: [], notes: [], papers: [],
};

describe("context packs", () => {
  it("creates stable week, misconception, project, and goal packs", () => {
    const ids = buildContextPacks(state).map((pack) => pack.metadata.id);
    expect(ids).toEqual(["current_week", "current_misconceptions", "project:project_oasis", "goal:goal_sql"]);
  });

  it("scopes project handoff data and exposes a token estimate", () => {
    const pack = getContextPack(state, "project:project_oasis");
    expect(pack.content.decisions).toHaveLength(1);
    expect(pack.metadata.estimatedTokens).toBeGreaterThan(0);
    expect(pack.metadata.mcpTool).toBe("get_context_pack");
  });

  it("exports deterministic Obsidian-safe frontmatter and stable IDs", () => {
    const markdown = contextPackMarkdown(getContextPack(state, "goal:goal_sql"));
    expect(markdown).toContain('continuum_context_pack: "goal:goal_sql"');
    expect(markdown).toContain("continuum_generated: true");
    expect(markdown).toContain('"goal_sql"');
  });
});
