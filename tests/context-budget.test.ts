import { describe, expect, it } from "vitest";

import { compactToBudget } from "@/lib/store";

/**
 * §12.2. `open_project` promises "evidence-linked claims" and
 * `get_evidence_for_claim` tells a client to use it before repeating a claim as
 * fact. That chain needs a claim id to survive the context budget.
 *
 * The budget used to trim by popping whole array entries with no floor, so a
 * project large enough to exceed the default came back with `claims: []`. An
 * empty array is not a shorter answer — it is a different and false one, and it
 * made the second half of the documented workflow unreachable.
 */
describe("context budget", () => {
  const project = {
    project: { id: "project_demo_oasis", title: "OASIS", phase: "analysis" },
    claims: Array.from({ length: 6 }, (_, index) => ({
      id: `claim_demo_${index}`,
      text: "A claim long enough to matter to the budget. ".repeat(12),
      status: "unverified",
    })),
    decisions: Array.from({ length: 6 }, (_, index) => ({
      id: `decision_demo_${index}`,
      text: "A decision long enough to matter to the budget. ".repeat(12),
    })),
  };

  it("trims an over-budget payload", () => {
    const trimmed = compactToBudget(project, 200);
    expect(JSON.stringify(trimmed).length).toBeLessThan(JSON.stringify(project).length);
  });

  it("says it trimmed, rather than trimming silently", () => {
    const trimmed = compactToBudget(project, 200) as Record<string, unknown>;
    expect((trimmed._contextBudget as { truncated?: boolean })?.truncated).toBe(true);
  });

  /**
   * The budget CAN empty an array — raising its floor makes it take more from
   * the arrays it can still pop, which starved the assistant's own goal list
   * and broke two §11.5 cases. So the fix belongs at the tool that makes the
   * promise, not here: `open_project` gets a budget that fits a real project.
   */
  it("keeps a claim id reachable at open_project's budget", () => {
    const trimmed = compactToBudget(project, 4_000);
    expect(JSON.stringify(trimmed)).toMatch(/claim_demo_\d/);
  });

  it("would have lost the claim ids at the old 1,400", () => {
    const project6x = { ...project, claims: [...project.claims, ...project.claims, ...project.claims] };
    expect(JSON.stringify(compactToBudget(project6x, 200))).not.toMatch(/claim_demo_5/);
  });

  it("leaves a payload that already fits completely alone", () => {
    const small = { claims: [{ id: "claim_demo_0", text: "short" }] };
    expect(compactToBudget(small, 1000)).toEqual(small);
  });
});
