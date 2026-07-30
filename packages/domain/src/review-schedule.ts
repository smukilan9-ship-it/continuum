/**
 * Spaced repetition.
 *
 * Continuum already measured mastery in four dimensions and then scheduled
 * nothing with it, which left a student with a number and no answer to the only
 * question that matters day to day: *what should I review now?*
 *
 * This is SM-2, with two deliberate departures.
 *
 * 1. **Recognition does not advance the interval.** SM-2 takes a self-reported
 *    grade 0-5. Self-report is exactly the signal that inflates — a learner who
 *    has just re-read a page feels fluent and grades themselves 5. Here the
 *    grade is derived from evidence: whether the check was *unseen*, whether it
 *    was answered correctly, and whether the learner could explain it back. A
 *    correct answer to a question they have already seen is capped, because it
 *    is evidence of recall of that item, not of the idea.
 *
 * 2. **A lapse costs ease but never resets the record.** Standard SM-2 sends a
 *    lapsed card back to a one-day interval and drops everything learned about
 *    it. That is punishing and it throws away information; the interval halves
 *    and the ease drops, so a shaky concept comes back soon without pretending
 *    it was never learned.
 */

export type ReviewGrade = "forgot" | "hard" | "good" | "easy";

export interface ReviewState {
  /** Days until the next review. 0 means it has never been scheduled. */
  intervalDays: number;
  /** SM-2 ease factor. Higher means intervals grow faster. */
  ease: number;
  /** Successful reviews in a row. */
  reps: number;
  /** Times it has been forgotten after being learned. */
  lapses: number;
}

export interface ReviewOutcome extends ReviewState {
  dueAt: string;
  /** Plain language, for the UI. Never a number without a reason beside it. */
  because: string;
}

export const INITIAL_REVIEW: ReviewState = { intervalDays: 0, ease: 2.5, reps: 0, lapses: 0 };

const MIN_EASE = 1.3;
const MAX_EASE = 3.2;
/** Beyond this, a scheduled review is indistinguishable from "you know it". */
const MAX_INTERVAL_DAYS = 180;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Turns evidence into a grade.
 *
 * `unseen` is the important argument. A correct answer to a question the
 * learner has already met is capped at "hard": it moves the schedule forward a
 * little because the memory is real, but it never earns the long interval that
 * only transfer to a new item justifies.
 */
export function gradeFrom(evidence: {
  correct: boolean;
  unseen: boolean;
  /** 0-1 from an explain-back attempt, when one was made. */
  explanationScore?: number;
  /** Seconds taken, when the surface measures it. Slow but correct is "hard". */
  seconds?: number;
}): ReviewGrade {
  if (!evidence.correct) return "forgot";
  if (evidence.explanationScore !== undefined && evidence.explanationScore < 0.5) {
    // Right answer, cannot explain it. That is recognition, and it is exactly
    // the case a self-reported grade would call "easy".
    return "hard";
  }
  if (!evidence.unseen) return "hard";
  if (evidence.seconds !== undefined && evidence.seconds > 90) return "good";
  if (evidence.explanationScore !== undefined && evidence.explanationScore >= 0.85) return "easy";
  return "good";
}

export function nextReview(state: ReviewState, grade: ReviewGrade, now = new Date()): ReviewOutcome {
  const ease = clamp(
    state.ease + ({ forgot: -0.24, hard: -0.14, good: 0, easy: 0.12 })[grade],
    MIN_EASE,
    MAX_EASE,
  );

  let intervalDays: number;
  let reps = state.reps;
  let lapses = state.lapses;
  let because: string;

  if (grade === "forgot") {
    lapses += 1;
    reps = 0;
    // Halved rather than reset: the concept was learned once and that is
    // information worth keeping.
    intervalDays = Math.max(1, Math.round(state.intervalDays / 2));
    because = state.intervalDays >= 1
      ? `You had this at ${formatInterval(state.intervalDays)}. Back to ${formatInterval(intervalDays)}.`
      : "First review is tomorrow.";
  } else {
    reps += 1;
    if (reps === 1) intervalDays = 1;
    else if (reps === 2) intervalDays = 3;
    else intervalDays = Math.round(state.intervalDays * ease * (grade === "hard" ? 0.6 : grade === "easy" ? 1.15 : 1));
    intervalDays = clamp(Math.max(1, intervalDays), 1, MAX_INTERVAL_DAYS);
    because = grade === "hard"
      ? `Right, but not yet fluent — back in ${formatInterval(intervalDays)}.`
      : `Next review in ${formatInterval(intervalDays)}.`;
  }

  const dueAt = new Date(now.getTime() + intervalDays * 24 * 3600_000).toISOString();
  return { intervalDays, ease, reps, lapses, dueAt, because };
}

export function formatInterval(days: number): string {
  if (days < 1) return "today";
  if (days === 1) return "1 day";
  if (days < 7) return `${Math.round(days)} days`;
  if (days < 30) return `${Math.round(days / 7)} week${Math.round(days / 7) === 1 ? "" : "s"}`;
  return `${Math.round(days / 30)} month${Math.round(days / 30) === 1 ? "" : "s"}`;
}

/** Everything due now, hardest first — a lapsed concept outranks a fresh one. */
export function dueQueue<T extends { dueAt?: string | Date | null; lapses?: number; transfer?: number }>(
  rows: T[],
  now = new Date(),
): T[] {
  return rows
    .filter((row) => {
      if (!row.dueAt) return false;
      return new Date(row.dueAt).getTime() <= now.getTime();
    })
    .sort((left, right) => {
      const byLapses = (right.lapses ?? 0) - (left.lapses ?? 0);
      if (byLapses) return byLapses;
      return (left.transfer ?? 0) - (right.transfer ?? 0);
    });
}

/**
 * When the learner will reach a target, at the rate they are actually going.
 *
 * Deliberately refuses to answer on thin evidence. A projection from two data
 * points is a guess wearing a number, and this product does not do that.
 */
export function projectMastery(
  history: Array<{ at: string | Date; value: number }>,
  target: number,
): { days: number; reachesAt: string; confident: boolean } | undefined {
  const points = [...history]
    .map((point) => ({ t: new Date(point.at).getTime(), v: point.value }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((left, right) => left.t - right.t);
  if (points.length < 4) return undefined;

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const spanDays = (last.t - first.t) / 86_400_000;
  if (spanDays < 3) return undefined;

  // Least squares on (days since first, value).
  const n = points.length;
  const xs = points.map((point) => (point.t - first.t) / 86_400_000);
  const ys = points.map((point) => point.v);
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;
  const varX = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  if (varX === 0) return undefined;
  const slope = xs.reduce((sum, x, index) => sum + (x - meanX) * (ys[index]! - meanY), 0) / varX;
  if (slope <= 0) return undefined;

  const days = Math.ceil((target - last.v) / slope);
  if (!Number.isFinite(days) || days <= 0 || days > 400) return undefined;
  return {
    days,
    reachesAt: new Date(last.t + days * 86_400_000).toISOString(),
    // Under three weeks of evidence the slope is still mostly noise.
    confident: spanDays >= 21 && n >= 8,
  };
}
