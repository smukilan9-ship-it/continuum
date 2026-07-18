import { describe, expect, it } from "vitest";
import { DeterministicScheduler, assertScheduleCommitAllowed, type ScheduleInput } from "../packages/domain/src/scheduler";
import type { AcademicTask } from "../packages/schemas/src";

const tasks: AcademicTask[] = [
  { id: "task_foundation", goalId: "goal_physics", title: "Review potential", status: "backlog", estimatedMinutes: 45, deadline: "2026-07-19T09:00:00+05:30", priority: 5, energyRequired: "high", dependencies: [], minimumBlockMinutes: 25, maximumBlockMinutes: 45, splittable: false, resourceIds: [] },
  { id: "task_transfer", goalId: "goal_physics", title: "Unseen checkpoint", status: "backlog", estimatedMinutes: 30, deadline: "2026-07-19T09:00:00+05:30", priority: 5, energyRequired: "medium", dependencies: ["task_foundation"], minimumBlockMinutes: 20, maximumBlockMinutes: 30, splittable: false, resourceIds: [] },
  { id: "task_research", goalId: "goal_research", title: "Registration analysis", status: "backlog", estimatedMinutes: 60, deadline: "2026-07-21T17:00:00+05:30", priority: 3, energyRequired: "high", dependencies: [], minimumBlockMinutes: 30, maximumBlockMinutes: 60, splittable: true, resourceIds: [] },
];

function input(): ScheduleInput {
  return {
    tasks,
    timezone: "Asia/Kolkata",
    now: "2026-07-18T08:00:00+05:30",
    bufferMinutes: 10,
    availability: [
      { start: "2026-07-18T09:00:00+05:30", end: "2026-07-18T13:00:00+05:30", energy: "high" },
      { start: "2026-07-18T14:00:00+05:30", end: "2026-07-18T19:00:00+05:30", energy: "medium" },
    ],
    constraints: [{ id: "constraint_school", title: "School lab", start: "2026-07-18T10:00:00+05:30", end: "2026-07-18T12:00:00+05:30", hard: true }],
  };
}

describe("deterministic scheduler", () => {
  it("never overlaps a hard commitment", () => {
    const proposal = new DeterministicScheduler().propose(input());
    const hardStart = Date.parse("2026-07-18T10:00:00+05:30");
    const hardEnd = Date.parse("2026-07-18T12:00:00+05:30");
    expect(proposal.blocks.every((block) => Date.parse(block.end) <= hardStart || Date.parse(block.start) >= hardEnd)).toBe(true);
  });

  it("orders dependencies", () => {
    const proposal = new DeterministicScheduler().propose(input());
    const foundation = proposal.blocks.filter((block) => block.taskId === "task_foundation").at(-1)!;
    const transfer = proposal.blocks.find((block) => block.taskId === "task_transfer")!;
    expect(Date.parse(transfer.start)).toBeGreaterThanOrEqual(Date.parse(foundation.end));
  });

  it("preserves completed work during repair", () => {
    const scheduler = new DeterministicScheduler();
    const proposal = scheduler.propose(input());
    proposal.blocks[0]!.status = "done";
    const missed = proposal.blocks.find((block) => block.id !== proposal.blocks[0]!.id)!;
    const repaired = scheduler.replan({ ...input(), now: missed.start }, proposal, missed.id);
    expect(repaired.preservedBlockIds).toContain(proposal.blocks[0]!.id);
    expect(repaired.blocks.find((block) => block.id === proposal.blocks[0]!.id)?.status).toBe("done");
  });

  it("retains the IANA timezone", () => {
    expect(new DeterministicScheduler().propose(input()).timezone).toBe("Asia/Kolkata");
  });

  it("requires confirmation before commit", () => {
    expect(() => assertScheduleCommitAllowed()).toThrow(/confirmation/i);
    expect(assertScheduleCommitAllowed({ confirmedBy: "user_maya", confirmedAt: "2026-07-18T09:00:00+05:30" })).toBe(true);
  });
});
