import { describe, expect, it } from "vitest";
import { diagnosePotentialMisconception, updateMastery } from "../packages/domain/src/learning";
import type { MasteryState } from "../packages/schemas/src";

const state: MasteryState = {
  conceptId: "concept_potential",
  exposure: 0.4,
  understanding: 0.45,
  transfer: 0.28,
  retention: 0.4,
  confidence: 0.75,
  status: "misconception_detected",
  evidenceIds: ["attempt_diagnostic_1"],
  explanation: "Diagnostic evidence indicates a misconception.",
};

describe("adaptive learning", () => {
  it("does not increase transfer from reading", () => {
    const next = updateMastery(state, { id: "evidence_lesson_1", kind: "lesson_read", occurredAt: "2026-07-18T09:10:00+05:30" });
    expect(next.exposure).toBeGreaterThan(state.exposure);
    expect(next.transfer).toBe(state.transfer);
  });

  it("requires unseen assessment evidence for transfer", () => {
    const seen = updateMastery(state, { id: "evidence_seen_1", kind: "assessment", unseen: false, correct: true, occurredAt: "2026-07-18T09:15:00+05:30" });
    const unseen = updateMastery(state, { id: "evidence_unseen_1", kind: "assessment", unseen: true, correct: true, occurredAt: "2026-07-18T09:20:00+05:30" });
    expect(seen.transfer).toBe(state.transfer);
    expect(unseen.transfer).toBeGreaterThan(state.transfer);
    expect(unseen.explanation).toMatch(/unseen/i);
  });

  it("records a misconception after failed unseen transfer", () => {
    const next = updateMastery(state, { id: "evidence_unseen_2", kind: "assessment", unseen: true, correct: false, occurredAt: "2026-07-18T09:20:00+05:30" });
    expect(next.status).toBe("misconception_detected");
  });

  it("recognizes potential-energy language", () => {
    expect(diagnosePotentialMisconception("It changes because qV and charge changes").detected).toBe(true);
  });
});
