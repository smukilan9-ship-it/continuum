import { describe, expect, it } from "vitest";

import { INITIAL_REVIEW, dueQueue, formatInterval, gradeFrom, nextReview, projectMastery } from "@continuum/domain";

/**
 * The scheduler is the product's pedagogical claim in code, so these assert the
 * claims rather than the arithmetic.
 */
describe("grading from evidence, not self-report", () => {
  it("caps a correct answer to a question already seen", () => {
    // The whole point. SM-2 takes a self-reported 0-5, and a learner who just
    // re-read the page reports 5. Recall of a familiar item is not transfer.
    expect(gradeFrom({ correct: true, unseen: false })).toBe("hard");
  });

  it("caps a right answer the learner cannot explain", () => {
    expect(gradeFrom({ correct: true, unseen: true, explanationScore: 0.3 })).toBe("hard");
  });

  it("gives the long interval only to an unseen item explained well", () => {
    expect(gradeFrom({ correct: true, unseen: true, explanationScore: 0.9 })).toBe("easy");
  });

  it("treats slow-but-correct as not yet fluent", () => {
    expect(gradeFrom({ correct: true, unseen: true, seconds: 140 })).toBe("good");
  });

  it("a wrong answer is forgotten however it was reached", () => {
    expect(gradeFrom({ correct: false, unseen: true, explanationScore: 0.95 })).toBe("forgot");
  });
});

describe("intervals", () => {
  it("starts at one day and grows", () => {
    const first = nextReview(INITIAL_REVIEW, "good");
    expect(first.intervalDays).toBe(1);
    const second = nextReview(first, "good");
    expect(second.intervalDays).toBe(3);
    const third = nextReview(second, "good");
    expect(third.intervalDays).toBeGreaterThan(3);
  });

  it("halves rather than resets on a lapse, and keeps the history", () => {
    // Standard SM-2 throws the record away. A concept learned once and then
    // forgotten is not the same as a concept never seen, and the schedule
    // should not pretend otherwise.
    const learned = { intervalDays: 20, ease: 2.5, reps: 4, lapses: 0 };
    const lapsed = nextReview(learned, "forgot");
    expect(lapsed.intervalDays).toBe(10);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.reps).toBe(0);
  });

  it("never lets ease run away or collapse", () => {
    let state = INITIAL_REVIEW;
    for (let index = 0; index < 40; index += 1) state = nextReview(state, "easy");
    expect(state.ease).toBeLessThanOrEqual(3.2);
    let poor = INITIAL_REVIEW;
    for (let index = 0; index < 40; index += 1) poor = nextReview(poor, "forgot");
    expect(poor.ease).toBeGreaterThanOrEqual(1.3);
  });

  it("caps the interval, because a year out is not a schedule", () => {
    let state: typeof INITIAL_REVIEW = INITIAL_REVIEW;
    for (let index = 0; index < 30; index += 1) state = nextReview(state, "easy");
    expect(state.intervalDays).toBeLessThanOrEqual(180);
  });

  it("explains itself in words a student can read", () => {
    const outcome = nextReview({ intervalDays: 20, ease: 2.5, reps: 4, lapses: 0 }, "forgot");
    expect(outcome.because).toMatch(/You had this at 3 weeks/);
    expect(outcome.because).not.toMatch(/ease|interval|SM-2|factor/i);
  });

  it("formats an interval the way a person says it", () => {
    expect(formatInterval(1)).toBe("1 day");
    expect(formatInterval(4)).toBe("4 days");
    expect(formatInterval(14)).toBe("2 weeks");
    expect(formatInterval(60)).toBe("2 months");
  });
});

describe("the due queue", () => {
  const now = new Date("2026-07-30T09:00:00Z");
  const rows = [
    { id: "a", dueAt: "2026-07-29T09:00:00Z", lapses: 0, transfer: 0.8 },
    { id: "b", dueAt: "2026-07-28T09:00:00Z", lapses: 2, transfer: 0.6 },
    { id: "c", dueAt: "2026-08-04T09:00:00Z", lapses: 0, transfer: 0.1 },
    { id: "d", dueAt: null, lapses: 0, transfer: 0.2 },
  ];

  it("only returns what is actually due", () => {
    expect(dueQueue(rows, now).map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("puts the concept that keeps slipping first", () => {
    expect(dueQueue(rows, now)[0]!.id).toBe("b");
  });
});

describe("projection", () => {
  const series = (points: number) =>
    Array.from({ length: points }, (_, index) => ({
      at: new Date(Date.UTC(2026, 5, 1 + index * 3)).toISOString(),
      value: 0.3 + index * 0.05,
    }));

  it("refuses to answer from thin evidence", () => {
    // A projection from two points is a guess wearing a number.
    expect(projectMastery(series(2), 0.9)).toBeUndefined();
    expect(projectMastery(series(3), 0.9)).toBeUndefined();
  });

  it("refuses when progress is flat or falling", () => {
    const flat = Array.from({ length: 10 }, (_, index) => ({
      at: new Date(Date.UTC(2026, 5, 1 + index * 3)).toISOString(),
      value: 0.5,
    }));
    expect(projectMastery(flat, 0.9)).toBeUndefined();
  });

  it("projects, and says whether it trusts itself", () => {
    const thin = projectMastery(series(5), 0.9);
    expect(thin?.days).toBeGreaterThan(0);
    expect(thin?.confident).toBe(false);

    const solid = projectMastery(series(10), 0.9);
    expect(solid?.confident).toBe(true);
  });
});
