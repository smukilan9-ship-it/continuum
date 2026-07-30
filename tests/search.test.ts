import { beforeEach, describe, expect, it } from "vitest";
import { demoStore } from "../apps/web/lib/demo-store";
import { getStore } from "../apps/web/lib/store";
import { searchHitHref, searchKinds, searchKindSection } from "../apps/web/lib/workspace-routes";

/**
 * §8.4 cross-object search — the fix for C13.
 *
 * The palette previously matched only goals, tasks, projects and receipts held
 * in the client snapshot, so the four object types a student is most likely to
 * look up by name — a source, a paper, a past conversation, a concept — could
 * not be found at all. These cases pin that they can be, and that every hit
 * carries a destination.
 */

function seed() {
  demoStore.goals.length = 0;
  demoStore.tasks.length = 0;
  demoStore.projects.length = 0;
  demoStore.sources.length = 0;
  demoStore.papers.length = 0;
  demoStore.assistantSessions.length = 0;
  demoStore.notes.length = 0;
  demoStore.memoryChunks.length = 0;

  demoStore.goals.push({ id: "goal_sat", title: "Raise SAT score", outcome: "Reach 1570 on the digital SAT", updatedAt: "2026-07-01T00:00:00.000Z" });
  demoStore.tasks.push({ id: "task_1", goalId: "goal_sat", title: "Drill immunohistochemistry vocabulary", description: "", updatedAt: "2026-07-02T00:00:00.000Z" });
  demoStore.projects.push({ id: "project_oasis", goalId: "goal_sat", title: "OASIS", purpose: "Cross-marker spatial association", updatedAt: "2026-07-03T00:00:00.000Z" });
  demoStore.sources.push({ id: "source_stack", userId: "user_maya", title: "Stack et al. 2014 — immunohistochemistry", mimeType: "application/pdf", contentHash: "h1", sourceVersion: 1, parserVersion: "unpdf", createdAt: "2026-07-04T00:00:00.000Z" });
  demoStore.papers.push({ id: "paper_1", projectId: "project_oasis", title: "Multiplexed immunohistochemistry", authors: ["Stack"], year: 2014, doi: "10.1/x", updatedAt: "2026-07-05T00:00:00.000Z" });
  demoStore.assistantSessions.push({ id: "assistant_session_1", title: "Immunohistochemistry questions", summary: "Discussed marker panels.", lastMessageAt: "2026-07-06T00:00:00.000Z" });
  demoStore.notes.push({ id: "note_1", projectId: "project_oasis", text: "The immunohistochemistry panel needs a second control.", updatedAt: "2026-07-07T00:00:00.000Z" });
  demoStore.memoryChunks.push({ id: "mchunk_1", kind: "project_decision", content: "Decided to use immunohistochemistry rather than IF.", occurredAt: "2026-07-08T00:00:00.000Z", importance: 0.8, tokenEstimate: 20, sourceEventIds: [], metadata: {} });
}

describe("workspace search", () => {
  beforeEach(seed);

  it("finds the four object types the old palette could not reach (C13)", async () => {
    const hits = await getStore("user_maya").searchWorkspace({ query: "immunohistochemistry" });
    const kinds = new Set(hits.map((hit) => hit.kind));
    for (const kind of ["source", "paper", "conversation", "note", "memory"]) {
      expect(kinds, `expected a ${kind} hit`).toContain(kind);
    }
  });

  it("still finds goals, tasks and projects", async () => {
    const hits = await getStore("user_maya").searchWorkspace({ query: "SAT" });
    expect(hits.some((hit) => hit.kind === "goal" && hit.id === "goal_sat")).toBe(true);
    const oasis = await getStore("user_maya").searchWorkspace({ query: "OASIS" });
    expect(oasis.some((hit) => hit.kind === "project")).toBe(true);
  });

  it("ranks a title match above a body match", async () => {
    const hits = await getStore("user_maya").searchWorkspace({ query: "Immunohistochemistry questions" });
    expect(hits[0]?.kind).toBe("conversation");
  });

  it("filters by kind so the composer's picker never offers a memory chunk", async () => {
    const hits = await getStore("user_maya").searchWorkspace({ query: "immunohistochemistry", kinds: ["source", "paper"] });
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) expect(["source", "paper"]).toContain(hit.kind);
  });

  it("returns nothing for a query too short to be meaningful", async () => {
    expect(await getStore("user_maya").searchWorkspace({ query: "i" })).toEqual([]);
    expect(await getStore("user_maya").searchWorkspace({ query: "  " })).toEqual([]);
  });

  it("respects the result limit", async () => {
    const hits = await getStore("user_maya").searchWorkspace({ query: "immunohistochemistry", limit: 2 });
    expect(hits.length).toBeLessThanOrEqual(2);
  });

  it("excludes session-only attachments from the Library listing (§11.4)", async () => {
    demoStore.sources.push({ id: "source_scratch", userId: "user_maya", title: "Scratch upload", mimeType: "text/plain", contentHash: "h2", sourceVersion: 1, parserVersion: "utf8", retention: "session", createdAt: "2026-07-09T00:00:00.000Z" });
    const library = await getStore("user_maya").listSources();
    const everything = await getStore("user_maya").listSources("all");
    expect(library.some((row) => (row as { id: string }).id === "source_scratch")).toBe(false);
    expect(everything.some((row) => (row as { id: string }).id === "source_scratch")).toBe(true);
  });

  it("gives every kind a destination and a palette section", () => {
    for (const kind of searchKinds) {
      expect(searchHitHref({ kind, id: "x_1", parentId: "goal_1" })).toMatch(/^\//);
      expect(searchKindSection[kind]).toBeTruthy();
    }
  });

  it("routes a task and a project through the goal that owns them", () => {
    expect(searchHitHref({ kind: "task", id: "task_1", parentId: "goal_sat" })).toContain("/g/goal_sat");
    // Without an owning goal the section that lists them is still a real landing.
    expect(searchHitHref({ kind: "task", id: "task_1" })).toBe("/goals");
  });

  it("escapes LIKE wildcards so a query cannot widen itself", async () => {
    // `%` in a raw pattern would match every row; the goal here is that it does not.
    const hits = await getStore("user_maya").searchWorkspace({ query: "%%" });
    expect(hits).toEqual([]);
  });
});
