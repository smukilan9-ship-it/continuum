import { describe, expect, it } from "vitest";

import { explainGrade, explainPrompt, settleScore, verdictCopy, type ExplainGrade } from "@/lib/learning/explain-back";

const base: ExplainGrade = {
  score: 0.99,
  verdict: "understood",
  covered: ["Serial sections are different physical slices"],
  missing: [],
  wrong: [],
  feedback: "You have the core of it.",
};

describe("the grade is settled here, not by the grader", () => {
  it("recomputes the score from coverage", () => {
    // The model returned 0.99; two of three points were covered.
    const settled = settleScore({ ...base, score: 0.99, covered: ["a", "b"], missing: ["c"] });
    expect(settled.score).toBeCloseTo(2 / 3, 5);
  });

  it("a contradicted claim costs more than a missing one", () => {
    // Full coverage plus one contradiction must still score below partial
    // coverage with nothing wrong. Holding a false belief is worse than
    // holding fewer true ones, and this number sets the review interval.
    const incomplete = settleScore({ ...base, covered: ["a", "b", "c"], missing: ["d"], wrong: [] });
    const contradicting = settleScore({ ...base, covered: ["a", "b", "c", "d"], missing: [], wrong: ["cells are the same cell"] });
    expect(contradicting.score).toBeLessThan(incomplete.score);
    expect(contradicting.score).toBeLessThanOrEqual(0.5);
  });

  it("never goes below zero however wrong the answer is", () => {
    const settled = settleScore({ ...base, covered: [], missing: ["a"], wrong: ["x", "y", "z", "w", "v", "u"] });
    expect(settled.score).toBe(0);
  });

  it("calls it misconceived whenever the source is contradicted, however high the coverage", () => {
    // The important one. A learner who covers everything and also states
    // something the source denies has a misconception, not a good score.
    const settled = settleScore({ ...base, covered: ["a", "b", "c", "d", "e"], missing: [], wrong: ["cells are the same cell"] });
    expect(settled.verdict).toBe("misconceived");
  });

  it("is partial when nothing is wrong but something is missing", () => {
    expect(settleScore({ ...base, covered: ["a"], missing: ["b", "c"], wrong: [] }).verdict).toBe("partial");
  });

  it("is understood only at high coverage with nothing contradicted", () => {
    expect(settleScore({ ...base, covered: ["a", "b", "c"], missing: [], wrong: [] }).verdict).toBe("understood");
    expect(settleScore({ ...base, covered: ["a", "b"], missing: ["c", "d"], wrong: [] }).verdict).not.toBe("understood");
  });

  it("handles an empty rubric without dividing by zero", () => {
    expect(settleScore({ ...base, covered: [], missing: [], wrong: [] }).score).toBe(0);
  });
});

describe("what the learner reads", () => {
  it("leads with the contradiction, not a percentage", () => {
    const copy = verdictCopy(settleScore({ ...base, covered: ["a"], missing: [], wrong: ["cells are the same cell"] }));
    expect(copy.title).toMatch(/disagrees with your source/);
    expect(copy.title).not.toMatch(/\d+%/);
    expect(copy.tone).toBe("red");
  });

  it("counts what is missing rather than scoring it", () => {
    const copy = verdictCopy(settleScore({ ...base, covered: ["a"], missing: ["b", "c"], wrong: [] }));
    expect(copy.title).toBe("Close — 2 ideas are missing");
  });

  it("names what was actually achieved when it lands", () => {
    expect(verdictCopy(settleScore({ ...base, covered: ["a", "b", "c"], missing: [], wrong: [] })).title)
      .toBe("You explained this without the source");
  });

  it("asks for an explanation, never a definition", () => {
    const prompt = explainPrompt("commit() and rollback()");
    expect(prompt).toMatch(/in your own words/);
    expect(prompt).not.toMatch(/define|definition/i);
  });
});

describe("the grade schema", () => {
  it("rejects a score outside 0-1", () => {
    expect(explainGrade.safeParse({ ...base, score: 1.4 }).success).toBe(false);
  });

  it("rejects feedback long enough to be a lecture", () => {
    expect(explainGrade.safeParse({ ...base, feedback: "x".repeat(601) }).success).toBe(false);
  });
});
