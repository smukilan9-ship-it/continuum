import { beforeEach, describe, expect, it } from "vitest";
import { demoStore } from "../apps/web/lib/demo-store";
import { getStore } from "../apps/web/lib/store";

/**
 * §18.3 integration cases for the §16.3 endpoints.
 *
 * The property that matters is ownership scoping (§16.10): a per-object read
 * must resolve the object against the caller before returning anything, and
 * AC-G1 requires that no view leaks an object belonging to another goal.
 */

function seed() {
  demoStore.goals.length = 0;
  demoStore.tasks.length = 0;
  demoStore.projects.length = 0;
  demoStore.sources.length = 0;
  demoStore.papers.length = 0;
  demoStore.schedule.length = 0;
  demoStore.taskDependencies.length = 0;
  demoStore.claims.length = 0;
  demoStore.decisions.length = 0;
  demoStore.notes.length = 0;

  demoStore.goals.push(
    { id: "goal_a", title: "Goal A", outcome: "Outcome A", status: "active", progress: 0.4, targetDate: "2026-10-01T00:00:00.000Z" },
    { id: "goal_b", title: "Goal B", outcome: "Outcome B", status: "active", progress: 0.1, targetDate: "2026-11-01T00:00:00.000Z" },
  );
  demoStore.tasks.push(
    { id: "task_a1", goalId: "goal_a", title: "Task A1", status: "in_progress" },
    { id: "task_b1", goalId: "goal_b", title: "Task B1", status: "backlog" },
  );
  demoStore.projects.push(
    { id: "project_a", goalId: "goal_a", title: "Project A", purpose: "For goal A" },
    { id: "project_b", goalId: "goal_b", title: "Project B", purpose: "For goal B" },
  );
  demoStore.sources.push(
    { id: "source_a", userId: "user_maya", projectId: "project_a", title: "Source A", mimeType: "application/pdf", contentHash: "a", sourceVersion: 1, parserVersion: "p", createdAt: "2026-07-01T00:00:00.000Z" },
    { id: "source_b", userId: "user_maya", projectId: "project_b", title: "Source B", mimeType: "application/pdf", contentHash: "b", sourceVersion: 1, parserVersion: "p", createdAt: "2026-07-02T00:00:00.000Z" },
    { id: "source_scratch", userId: "user_maya", projectId: "project_a", title: "Scratch", mimeType: "text/plain", contentHash: "c", sourceVersion: 1, parserVersion: "p", retention: "session", createdAt: "2026-07-03T00:00:00.000Z" },
  );
  demoStore.papers.push(
    { id: "paper_a", projectId: "project_a", title: "Paper A", authors: [], year: 2020 },
    { id: "paper_b", projectId: "project_b", title: "Paper B", authors: [], year: 2021 },
  );
  demoStore.schedule.push(
    { id: "block_a", taskId: "task_a1", start: "2026-07-30T09:00:00.000Z", end: "2026-07-30T10:00:00.000Z" },
    { id: "block_b", taskId: "task_b1", start: "2026-07-30T11:00:00.000Z", end: "2026-07-30T12:00:00.000Z" },
  );
  demoStore.decisions.push({ id: "decision_a", projectId: "project_a", text: "Decision A", reasoning: "r", status: "accepted" });
  demoStore.claims.push({ id: "claim_b", projectId: "project_b", text: "Claim B", status: "unverified", createdBy: "user" });
}

const store = () => getStore("user_maya");

describe("shell data", () => {
  beforeEach(seed);

  it("returns only what the chrome needs", async () => {
    const shell = await store().shellData();
    expect(shell.goals).toHaveLength(2);
    expect(Object.keys(shell.goals[0]!).sort()).toEqual(["id", "progress", "status", "targetDate", "title"]);
    expect(shell.pendingProposals).toBe(0);
  });
});

describe("GET /api/goals/[id] views", () => {
  beforeEach(seed);

  it("404s (as undefined) for a goal that does not exist", async () => {
    expect(await store().goalView("goal_missing", "overview")).toBeUndefined();
  });

  it("AC-G1: the plan view carries no other goal's tasks or blocks", async () => {
    const plan = await store().goalView("goal_a", "plan") as { tasks: Array<{ id: string }>; schedule: Array<{ taskId: string }> };
    expect(plan.tasks.map((task) => task.id)).toEqual(["task_a1"]);
    expect(plan.schedule.map((block) => block.taskId)).toEqual(["task_a1"]);
  });

  it("AC-G1: the sources view carries no other goal's sources or papers", async () => {
    const sources = await store().goalView("goal_a", "sources") as { sources: Array<{ id: string }>; papers: Array<{ id: string }> };
    expect(sources.sources.map((source) => source.id)).toContain("source_a");
    expect(sources.sources.map((source) => source.id)).not.toContain("source_b");
    expect(sources.papers.map((paper) => paper.id)).toEqual(["paper_a"]);
  });

  it("§11.4: a session-only attachment never appears in a goal's sources", async () => {
    const sources = await store().goalView("goal_a", "sources") as { sources: Array<{ id: string }> };
    expect(sources.sources.map((source) => source.id)).not.toContain("source_scratch");
  });

  it("every view returns the header, so switching tabs does not refetch it (AC-G3)", async () => {
    for (const view of ["overview", "plan", "study", "sources"] as const) {
      const data = await store().goalView("goal_a", view) as { goal?: { id?: string } };
      expect(data.goal?.id, `${view} view is missing the goal header`).toBe("goal_a");
    }
  });

  it("AC-G5: a goal with nothing in it still returns a coherent payload", async () => {
    demoStore.goals.push({ id: "goal_empty", title: "Empty", outcome: "None yet", status: "active", progress: 0, targetDate: "2026-12-01T00:00:00.000Z" });
    const overview = await store().goalView("goal_empty", "overview") as { goal: { id: string }; tasks: unknown[]; projects: unknown[] };
    expect(overview.goal.id).toBe("goal_empty");
    expect(overview.tasks).toEqual([]);
    expect(overview.projects).toEqual([]);
  });
});

describe("GET /api/projects/[id] views", () => {
  beforeEach(seed);

  it("404s (as undefined) for a project that does not exist", async () => {
    expect(await store().projectView("project_missing", "overview")).toBeUndefined();
  });

  it("scopes claims, decisions and sources to the project", async () => {
    const claims = await store().projectView("project_b", "claims") as { claims: Array<{ id: string }> };
    expect(claims.claims.map((claim) => claim.id)).toEqual(["claim_b"]);
    const decisions = await store().projectView("project_a", "decisions") as { decisions: Array<{ id: string }> };
    expect(decisions.decisions.map((decision) => decision.id)).toEqual(["decision_a"]);
    const sources = await store().projectView("project_a", "sources") as { sources: Array<{ id: string }> };
    expect(sources.sources.map((source) => source.id)).toEqual(["source_a"]);
  });
});

describe("GET /api/home", () => {
  beforeEach(seed);

  it("names one next action rather than four competing cards (C11)", async () => {
    const home = await store().homeData() as { nextTask: { id: string } | null; weekSummary: { openTasks: number } };
    expect(home.nextTask?.id).toBeTruthy();
    expect(home.weekSummary.openTasks).toBe(2);
  });
});
