import { masteryStateSchema, type MasteryState } from "@continuum/schemas";

export type LearningEvidence = {
  id: string;
  kind: "lesson_read" | "guided_practice" | "assessment";
  correct?: boolean;
  unseen?: boolean;
  occurredAt: string;
};

export function updateMastery(current: MasteryState, evidence: LearningEvidence): MasteryState {
  const next = { ...current, evidenceIds: [...current.evidenceIds, evidence.id], lastPracticedAt: evidence.occurredAt };
  if (evidence.kind === "lesson_read") {
    next.exposure = Math.max(next.exposure, 0.8);
    next.status = current.status === "misconception_detected" ? current.status : "exposed";
    next.explanation = "Lesson exposure was recorded; transfer did not change because no independent evidence was provided.";
  } else if (evidence.kind === "guided_practice") {
    next.understanding = Math.min(1, next.understanding + (evidence.correct ? 0.15 : 0.03));
    next.status = "practicing";
    next.explanation = "Guided practice improved understanding, but mastery still requires an unseen checkpoint.";
  } else if (evidence.kind === "assessment" && evidence.unseen) {
    if (evidence.correct) {
      next.transfer = Math.min(1, next.transfer + 0.35);
      next.retention = Math.min(1, next.retention + 0.18);
      next.understanding = Math.max(next.understanding, 0.78);
      next.status = next.transfer >= 0.72 ? "mastered" : "practicing";
      next.explanation = "Transfer increased after a correct response to an unseen checkpoint.";
    } else {
      next.transfer = Math.max(0, next.transfer - 0.08);
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
