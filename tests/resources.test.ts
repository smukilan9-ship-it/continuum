import { describe, expect, it } from "vitest";
import { recommendBestResource } from "../packages/domain/src/resources";
import { checkpointScore } from "../apps/web/lib/resource-verification";

describe("outcome-first resource broker", () => {
  it("chooses PhET over the native tutor for interactive potential intuition", () => {
    const recommendation = recommendBestResource({ id: "recommendation_phet", topic: "electric potential voltage equipotential", need: "conceptual_intuition", goalType: "school", minutesAvailable: 15, costPreference: "free_only", now: "2026-07-19T00:00:00.000Z" });
    expect(recommendation.selected.id).toBe("resource_phet_charges_fields");
    expect(recommendation.decision).toBe("external");
    expect(recommendation.whyBetterThanNative).toMatch(/visual|manipulable/i);
    expect(recommendation.selected.completionInstructions.length).toBeGreaterThan(0);
    expect(recommendation.verificationPlan).toBeTruthy();
  });

  it("keeps a short targeted misconception repair native", () => {
    const recommendation = recommendBestResource({ id: "recommendation_native", topic: "electric potential potential energy misconception", need: "diagnosis", goalType: "school", minutesAvailable: 10, costPreference: "free_only", now: "2026-07-19T00:00:00.000Z" });
    expect(recommendation.selected.id).toBe("resource_native_potential");
    expect(recommendation.decision).toBe("native");
    expect(recommendation.selected.nativeContent?.length).toBeGreaterThan(1);
    expect(recommendation.selected.verification.expectedAnswer).toBe("24");
  });

  it("prefers the official Bluebook environment for SAT simulation", () => {
    const recommendation = recommendBestResource({ id: "recommendation_sat", topic: "digital SAT official full length practice", need: "official_exam_simulation", goalType: "exam", minutesAvailable: 150, costPreference: "free_only", now: "2026-07-19T00:00:00.000Z" });
    expect(recommendation.selected.id).toBe("resource_bluebook_sat");
    expect(recommendation.selected.authority).toBe("official");
  });

  it("refuses an irrelevant link when the reviewed registry has no topical match", () => {
    expect(() => recommendBestResource({ id: "recommendation_none", topic: "medieval Icelandic paleography", need: "canonical_explanation", costPreference: "free_only", now: "2026-07-19T00:00:00.000Z" })).toThrow(/no eligible/i);
  });

  it("respects free-only access preferences", () => {
    const recommendation = recommendBestResource({ id: "recommendation_research", topic: "research papers source exploration", need: "source_exploration", goalType: "research", costPreference: "free_only", now: "2026-07-19T00:00:00.000Z" });
    expect(recommendation.selected.cost).toBe("free");
    expect(recommendation.selected.id).not.toBe("resource_claude_science");
  });

  it("accepts a correct short answer with an explanation without accepting contradictions", () => {
    expect(checkpointScore("No. Doubling the test charge doubles U, while V at that point stays the same.", "no")).toBe(1);
    expect(checkpointScore("Yes, it will double.", "no")).toBe(0);
    expect(checkpointScore("The change is negative along the field direction.", "negative")).toBe(1);
  });

  it("accepts one numeric answer with units and rejects answer fishing", () => {
    expect(checkpointScore("24 V", "24")).toBe(1);
    expect(checkpointScore("I tried 12 V, then 24 V", "24")).toBe(0);
  });
});
