import { z } from "zod";

/**
 * The explain-back check.
 *
 * A multiple-choice score cannot tell recognition from understanding: the
 * learner sees the right answer among four and picks it, and the number goes
 * up. So here they write the idea in their own words with the source hidden,
 * and the answer is graded against the passage it came from.
 *
 * Three things come back, and the third is the one that matters:
 *
 * - what they got right,
 * - what they left out,
 * - **what they said that the source contradicts.**
 *
 * The last is a misconception with a citation attached, which is the only kind
 * worth recording. "You are wrong" is not teaching; "the passage says X and you
 * said Y" is.
 */

export const explainVerdict = z.enum(["understood", "partial", "misconceived"]);
export type ExplainVerdict = z.infer<typeof explainVerdict>;

export const explainGrade = z.object({
  /** 0-1. Weighted toward coverage of the key points, not prose quality. */
  score: z.number().min(0).max(1),
  verdict: explainVerdict,
  /** Key points the passage makes that the answer covered. */
  covered: z.array(z.string()).max(8),
  /** Key points the answer left out. */
  missing: z.array(z.string()).max(8),
  /** Claims in the answer the passage contradicts, quoted from the answer. */
  wrong: z.array(z.string()).max(6),
  /** One or two sentences, addressed to the learner, naming the next step. */
  feedback: z.string().min(1).max(600),
});
export type ExplainGrade = z.infer<typeof explainGrade>;

export const GRADER_CONTRACT = [
  "You are grading a learner's explanation against a passage they could not see while writing it.",
  "Judge only whether the ideas match the passage. Never judge grammar, spelling, length, or style.",
  "`covered` lists the passage's key points the answer got. `missing` lists the ones it did not.",
  "`wrong` lists only claims the passage actively contradicts — quote the learner's own words. An answer that omits something is not wrong, it is incomplete.",
  "Score is the share of key points covered, minus 0.2 for each contradicted claim, floored at 0.",
  "`feedback` is one or two sentences addressed to the learner as 'you', naming the single most useful next step. Never mention this rubric, the score, or the word 'passage'.",
].join(" ");

/**
 * `score` is recomputed here rather than trusted from the model. A grader that
 * marks its own arithmetic drifts, and this number feeds the review schedule —
 * an inflated score buys a longer interval and the learner forgets the concept
 * without ever being asked again.
 */
export function settleScore(grade: ExplainGrade): ExplainGrade {
  const points = grade.covered.length + grade.missing.length;
  const coverage = points === 0 ? 0 : grade.covered.length / points;

  // A contradiction is not a deduction, it is a ceiling. An answer that covers
  // every point and also asserts something the source denies cannot be scored
  // above one that merely left something out — the learner holds a belief that
  // is false, which is worse than holding fewer true ones, and this number
  // feeds the review interval. Capping at 0.5 keeps it below the "understood"
  // threshold no matter how complete the rest of the answer was.
  const penalised = coverage - grade.wrong.length * 0.35;
  const score = grade.wrong.length > 0
    ? Math.max(0, Math.min(0.5, penalised))
    : Math.max(0, Math.min(1, penalised));

  const verdict: ExplainVerdict = grade.wrong.length > 0
    ? "misconceived"
    : score >= 0.75
      ? "understood"
      : "partial";
  return { ...grade, score, verdict };
}

/**
 * What the learner sees. Deliberately not a percentage on its own — a bare
 * number invites "77% is fine" when the 23% is a contradiction of the source.
 */
export function verdictCopy(grade: ExplainGrade): { title: string; tone: "success" | "warning" | "danger" } {
  if (grade.verdict === "misconceived") {
    return { title: grade.wrong.length === 1 ? "One thing here disagrees with your source" : `${grade.wrong.length} things here disagree with your source`, tone: "danger" };
  }
  if (grade.verdict === "partial") {
    return { title: grade.missing.length === 1 ? "Close — one idea is missing" : `Close — ${grade.missing.length} ideas are missing`, tone: "warning" };
  }
  return { title: "You explained this without the source", tone: "success" };
}

/** The prompt shown above the box. Never "define X" — that invites recitation. */
export function explainPrompt(conceptTitle: string): string {
  return `Explain ${conceptTitle} in your own words, as if to someone who has not read the source. Two or three sentences is plenty.`;
}
