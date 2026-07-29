/**
 * The Continue row (redesign.md §14.1).
 *
 * One row, one action, chosen **deterministically** in the order the plan
 * specifies:
 *
 *   active misconception → decaying concept → unfinished practice set →
 *   unfinished external activity → least-practised concept
 *
 * Deterministic matters: the Learn screen previously offered four competing
 * secondary routes ("Find a resource", "Review weak areas", "Return to active
 * resource", "Compare resources") beside its primary button, so the highest
 * value action was whichever the learner guessed. The order below is fixed, so
 * the same state always produces the same next step and the reason can be
 * stated in one sentence.
 */
import { text, type Row } from "@/components/workspace/types";
import { rankConcepts, type ConceptSignal } from "./mastery";

export type NextAction = {
  kind: "misconception" | "decay" | "practice_set" | "activity" | "practise";
  title: string;
  /** One sentence on why this is next. Shown verbatim. */
  reason: string;
  actionLabel: string;
  concept?: ConceptSignal;
  questionBankId?: string;
  activityId?: string;
};

/** Retention below this, on a concept that has been seen, reads as decay. */
const DECAY_THRESHOLD = 0.5;

export function chooseNextAction(state: {
  learningStates: Row[];
  questionBanks: Row[];
  resourceActivities: Row[];
}): NextAction | undefined {
  const concepts = rankConcepts(state.learningStates);

  const misconception = concepts.find((concept) => concept.openMisconception);
  if (misconception) return {
    kind: "misconception",
    title: misconception.title,
    reason: `An open misconception is holding this back — ${misconception.weakest.label} ${misconception.weakest.percent}%.`,
    actionLabel: "Fix this",
    concept: misconception,
  };

  const decaying = concepts
    .filter((concept) => concept.dimensions.some((dimension) => dimension.key === "exposure" && dimension.value > 0))
    .filter((concept) => (concept.dimensions.find((dimension) => dimension.key === "retention")?.value ?? 1) < DECAY_THRESHOLD)
    .sort((left, right) => (left.dimensions.find((d) => d.key === "retention")?.value ?? 1) - (right.dimensions.find((d) => d.key === "retention")?.value ?? 1))[0];
  if (decaying) return {
    kind: "decay",
    title: decaying.title,
    reason: `You have studied this, but recall is slipping — ${decaying.weakest.label} ${decaying.weakest.percent}%.`,
    actionLabel: "Review this",
    concept: decaying,
  };

  // "Unfinished" means a started attempt with no completion, not merely a set
  // that exists — otherwise every bank the learner has ever built would
  // outrank the concept they are actually stuck on.
  const unfinishedBank = state.questionBanks.find((bank) => {
    const attempts = Array.isArray(bank.attempts) ? bank.attempts as Array<Record<string, unknown>> : [];
    return attempts.some((attempt) => !attempt.completedAt);
  });
  if (unfinishedBank) return {
    kind: "practice_set",
    title: text(unfinishedBank, "title", "Practice set"),
    reason: "You started this practice set and have not finished it.",
    actionLabel: "Continue practising",
    questionBankId: text(unfinishedBank, "id"),
  };

  const openActivity = state.resourceActivities.find((activity) => !["verified", "abandoned"].includes(text(activity, "status")));
  if (openActivity) return {
    kind: "activity",
    title: text(openActivity, "resourceId", "Resource you started"),
    reason: "You opened this resource and have not come back with what it produced.",
    actionLabel: "Finish this",
    activityId: text(openActivity, "id"),
  };

  // Ties break on the concept list's own ordering, so "least practised" means
  // the same thing here as it does two sections further down the page.
  const leastPractised = concepts[0];
  if (leastPractised) return {
    kind: "practise",
    title: leastPractised.title,
    reason: `This is the least practised concept you are tracking — ${leastPractised.weakest.label} ${leastPractised.weakest.percent}%.`,
    actionLabel: "Study this",
    concept: leastPractised,
  };

  return undefined;
}
