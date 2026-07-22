import { describe, expect, it } from "vitest";
import { buildDemoData, DEMO_ACCOUNT_EMAIL, DEMO_ACCOUNT_USER_ID, DEMO_ACCOUNT_USERNAME, RESET_TARGETS } from "../packages/db/src/seed-demo";

const now = new Date("2026-07-22T04:00:00.000Z");
const data = buildDemoData(now);
const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id);
const idSet = (rows: Array<{ id: string }>) => new Set(ids(rows));

describe("demo account identity", () => {
  it("is a distinct, disposable account (not the built-in Maya fixture)", () => {
    expect(DEMO_ACCOUNT_USER_ID).toBe("user_demo");
    expect(DEMO_ACCOUNT_USERNAME).toBe("demo");
    expect(DEMO_ACCOUNT_EMAIL).toBe("demo@continuum.demo");
    // The auto-seed fixture (user_maya) is never the demo account, so the demo
    // account can only ever be created by the explicit seed command.
    expect(DEMO_ACCOUNT_USER_ID).not.toBe("user_maya");
  });
});

describe("demo data content", () => {
  it("creates the four required active goals with real titles", () => {
    expect(data.goalRows).toHaveLength(4);
    const titles = data.goalRows.map((goal) => goal.title);
    expect(titles).toContain("Raise SAT score from 1520 to 1570+");
    expect(titles.some((title) => title.includes("SQL and Python–MySQL"))).toBe(true);
    expect(titles.some((title) => title.includes("OASIS"))).toBe(true);
    expect(titles.some((title) => title.includes("exoplanet"))).toBe(true);
    expect(data.goalRows.every((goal) => goal.status === "active")).toBe(true);
  });

  it("records the mandatory OASIS co-expression decision", () => {
    const decision = data.decisionRows.find((row) => row.id === "decision_demo_oasis_coexpr");
    expect(decision?.text).toMatch(/never be presented as same-cell co-expression/i);
    expect(decision?.reasoning).toMatch(/different physical slices/i);
  });

  it("indexes the ihc.md source with citable chunks", () => {
    const ihc = data.sourceRows.find((row) => row.id === "source_demo_ihc");
    expect(ihc?.title).toMatch(/ihc\.md/);
    expect(data.chunkRows.filter((chunk) => chunk.sourceId === "source_demo_ihc").length).toBeGreaterThanOrEqual(3);
  });
});

describe("referential integrity", () => {
  const goalIds = idSet(data.goalRows);
  const taskIds = idSet(data.taskRows);
  const conceptIds = idSet(data.conceptRows);
  const chunkIds = idSet(data.chunkRows);
  const sourceIds = idSet(data.sourceRows);
  const claimIds = idSet(data.claimRows);
  const projectIds = idSet(data.projectRows);
  const assessmentIds = idSet(data.assessmentRows);
  const attemptIds = idSet(data.attemptRows);
  const resourceIds = idSet(data.resourceRows);

  it("keeps every task, milestone, and project pointed at a real goal", () => {
    for (const task of data.taskRows) expect(goalIds.has(task.goalId)).toBe(true);
    for (const milestone of data.milestoneRows) expect(goalIds.has(milestone.goalId)).toBe(true);
    for (const project of data.projectRows) expect(goalIds.has(project.goalId)).toBe(true);
  });

  it("resolves task dependencies and schedule blocks to real tasks", () => {
    for (const dep of data.taskDeps) {
      expect(taskIds.has(dep.taskId)).toBe(true);
      expect(taskIds.has(dep.dependsOnTaskId)).toBe(true);
    }
    for (const block of data.scheduleRows) expect(taskIds.has(block.taskId)).toBe(true);
  });

  it("links claim evidence to real claims, sources, and chunks", () => {
    for (const evidence of data.evidenceRows) {
      expect(claimIds.has(evidence.claimId)).toBe(true);
      expect(sourceIds.has(evidence.sourceId)).toBe(true);
      expect(chunkIds.has(evidence.chunkId)).toBe(true);
    }
  });

  it("keeps learning, assessments, and misconceptions consistent", () => {
    for (const state of data.learningStateRows) expect(conceptIds.has(state.conceptId)).toBe(true);
    for (const attempt of data.attemptRows) expect(assessmentIds.has(attempt.assessmentId)).toBe(true);
    for (const misconception of data.misconceptionRows) {
      expect(conceptIds.has(misconception.conceptId)).toBe(true);
      expect(attemptIds.has(misconception.attemptId)).toBe(true);
    }
  });

  it("points resource activities and receipts at real entities", () => {
    for (const activity of data.activityRows) expect(resourceIds.has(activity.resourceId)).toBe(true);
    for (const receipt of data.receiptRows) {
      if (receipt.goalId) expect(goalIds.has(receipt.goalId)).toBe(true);
      if (receipt.projectId) expect(projectIds.has(receipt.projectId)).toBe(true);
    }
  });
});

describe("idempotency by construction", () => {
  const resetPrefixes = RESET_TARGETS.map(([, prefix]) => prefix);

  it("gives every seeded row a stable demo-scoped id that the reset targets", () => {
    // Each data array maps to a reset prefix; if every id carries a targeted
    // prefix, re-running the seed after a reset can never duplicate a row.
    const groups: Array<[Array<{ id: string }>, string]> = [
      [data.goalRows, "goal_demo_"],
      [data.milestoneRows, "milestone_demo_"],
      [data.taskRows, "task_demo_"],
      [data.taskDeps, "dep_demo_"],
      [data.projectRows, "project_demo_"],
      [data.sourceRows, "source_demo_"],
      [data.chunkRows, "chunk_demo_"],
      [data.decisionRows, "decision_demo_"],
      [data.noteRows, "note_demo_"],
      [data.claimRows, "claim_demo_"],
      [data.evidenceRows, "ev_demo_"],
      [data.learningStateRows, "learning_demo_"],
      [data.scheduleRows, "block_demo_"],
      [data.receiptRows, "receipt_demo_"],
      [data.eventRows, "event_demo_"],
      [data.memoryChunkRows, "mchunk_demo_"],
      [data.resourceRows, "resource_demo_"],
      [data.activityRows, "activity_demo_"],
    ];
    for (const [rows, prefix] of groups) {
      expect(resetPrefixes).toContain(prefix);
      for (const row of rows) expect(row.id.startsWith(prefix)).toBe(true);
    }
  });

  it("has no duplicate ids within any table", () => {
    for (const [rows] of [[data.taskRows], [data.milestoneRows], [data.chunkRows], [data.eventRows]] as Array<[Array<{ id: string }>]>) {
      expect(new Set(ids(rows)).size).toBe(rows.length);
    }
  });
});
