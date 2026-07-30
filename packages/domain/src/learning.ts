import { masteryStateSchema, type MasteryState } from "@continuum/schemas";

export type LearningEvidence = {
  id: string;
  kind: "lesson_read" | "guided_practice" | "assessment" | "resource_completion";
  correct?: boolean;
  unseen?: boolean;
  score?: number;
  completeness?: number;
  difficulty?: number;
  hintUsed?: boolean;
  selfConfidence?: number;
  occurredAt: string;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function updateMastery(current: MasteryState, evidence: LearningEvidence): MasteryState {
  const next = { ...current, evidenceIds: [...current.evidenceIds, evidence.id], lastPracticedAt: evidence.occurredAt };
  const previousReview = current.lastPracticedAt ? Date.parse(current.lastPracticedAt) : undefined;
  const reviewTime = Date.parse(evidence.occurredAt);
  if (previousReview && Number.isFinite(reviewTime) && reviewTime > previousReview) {
    const days = (reviewTime - previousReview) / 86_400_000;
    next.retention = clamp(current.retention - Math.min(0.18, days * 0.008));
  }
  const score = clamp(evidence.score ?? (evidence.correct ? 1 : 0));
  const completeness = clamp(evidence.completeness ?? score);
  const difficulty = clamp(evidence.difficulty ?? 0.5);
  const hintFactor = evidence.hintUsed ? 0.68 : 1;
  const diminishing = Math.max(0.55, 1 - Math.max(0, current.evidenceIds.length - 2) * 0.035);
  if (typeof evidence.selfConfidence === "number") next.confidence = clamp(current.confidence * 0.75 + clamp(evidence.selfConfidence) * 0.25);

  if (evidence.kind === "lesson_read") {
    next.exposure = Math.max(next.exposure, 0.8);
    next.status = current.status === "misconception_detected" ? current.status : "exposed";
    next.explanation = "Lesson exposure was recorded; transfer did not change because no independent evidence was provided.";
  } else if (evidence.kind === "resource_completion") {
    next.exposure = Math.max(next.exposure, 0.86);
    next.understanding = clamp(next.understanding + 0.06 * completeness);
    next.status = current.status === "misconception_detected" ? current.status : "practicing";
    next.explanation = "Resource completion improved exposure and supported understanding. Transfer still requires an independent checkpoint.";
  } else if (evidence.kind === "guided_practice") {
    next.understanding = clamp(next.understanding + (0.025 + 0.13 * score * completeness * hintFactor) * diminishing);
    next.status = "practicing";
    next.explanation = "Guided practice improved understanding, but mastery still requires an unseen checkpoint.";
  } else if (evidence.kind === "assessment" && evidence.unseen) {
    if (score >= 0.7 && evidence.correct !== false) {
      const quality = score * completeness * (0.7 + 0.3 * difficulty) * hintFactor * diminishing;
      next.transfer = clamp(next.transfer + 0.08 + 0.24 * quality);
      next.retention = clamp(next.retention + 0.05 + 0.13 * quality);
      next.understanding = Math.max(next.understanding, clamp(0.62 + 0.2 * quality));
      const repeatedEvidence = next.evidenceIds.length >= 4;
      next.status = repeatedEvidence && next.transfer >= 0.78 && next.retention >= 0.68 && next.understanding >= 0.8 ? "mastered" : "practicing";
      next.explanation = next.status === "mastered"
        ? "Mastery is supported by repeated, sufficiently difficult unseen evidence with stable retention."
        : "Transfer increased after an unseen checkpoint; more consistent evidence is required before mastery.";
    } else {
      next.transfer = clamp(next.transfer - (0.04 + 0.08 * (1 - score)));
      next.understanding = clamp(next.understanding - 0.025 * (1 - completeness));
      next.status = "misconception_detected";
      next.explanation = "The unseen checkpoint exposed a persistent misconception; targeted review was scheduled.";
    }
  } else {
    next.explanation = "Evidence was recorded without changing transfer mastery.";
  }
  return masteryStateSchema.parse(next);
}

export function diagnosePotentialMisconception(answer: string) {
  const normalized = answer.trim().toLowerCase();
  const confusesEnergy = ["charge", "qv", "joule", "potential energy"].some((term) => normalized.includes(term));
  return {
    detected: confusesEnergy,
    label: "Potential vs potential energy",
    explanation: confusesEnergy
      ? "Electric potential is energy per unit charge (V = U/q); potential energy depends on the charge placed at that point."
      : "The answer distinguishes the field property (potential) from the charge-dependent energy.",
  };
}
