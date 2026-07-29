import { describe, expect, it } from "vitest";
import { recommendBestResource } from "../packages/domain/src/resources";
import { checkpointScore } from "../apps/web/lib/resource-verification";
import { POST as resourceAction } from "../apps/web/app/api/resources/route";

async function postResource(body: Record<string, unknown>) {
  return resourceAction(new Request("http://localhost:3000/api/resources", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  }));
}

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
    expect(() => recommendBestResource({ id: "recommendation_none", topic: "medieval Icelandic paleography", need: "canonical_explanation", costPreference: "free_only", now: "2026-07-19T00:00:00.000Z" })).toThrow(/no curated resource covers/i);
  });

  it("respects free-only access preferences", () => {
    const recommendation = recommendBestResource({ id: "recommendation_research", topic: "research papers source exploration", need: "source_exploration", goalType: "research", costPreference: "free_only", now: "2026-07-19T00:00:00.000Z" });
    expect(recommendation.selected.cost).toBe("free");
    expect(recommendation.selected.id).not.toBe("resource_claude_science");
  });

  it("uses rejection feedback and excludes the rejected resource from the next ranking", () => {
    const original = recommendBestResource({ id: "recommendation_first", topic: "electric potential voltage equipotential", need: "conceptual_intuition", minutesAvailable: 15, costPreference: "free_only" });
    const replacement = recommendBestResource({
      id: "recommendation_second",
      topic: "electric potential voltage equipotential",
      need: "conceptual_intuition",
      minutesAvailable: 15,
      costPreference: "free_only",
      excludeResourceIds: [original.selected.id],
      rejectionReasons: ["different_format"],
      preferredFormats: ["textbook"],
      feedback: "I need a readable textbook section",
    });
    expect(replacement.selected.id).not.toBe(original.selected.id);
    expect(replacement.selected.formats).toContain("textbook");
  });

  it("requires Bluebook section scores instead of silently accepting a total", async () => {
    const startedResponse = await postResource({
      action: "start",
      topic: "digital SAT official full length practice",
      need: "official_exam_simulation",
      goalType: "exam",
      minutesAvailable: 150,
      costPreference: "free_only",
    });
    expect(startedResponse.status).toBe(200);
    const started = await startedResponse.json() as { activity: { id: string } };
    await postResource({ action: "return", activityId: started.activity.id });

    const insufficient = await postResource({ action: "verify", activityId: started.activity.id, answer: "BB10 1520" });
    expect(insufficient.status).toBe(200);
    await expect(insufficient.json()).resolves.toMatchObject({
      outcome: "not_sufficient",
      message: "This does not show completion yet",
      explanation: expect.stringMatching(/both section scores/i),
    });

    const verified = await postResource({ action: "verify", activityId: started.activity.id, answer: "Test 10 · Reading and Writing 760 · Math 760" });
    await expect(verified.json()).resolves.toMatchObject({ outcome: "verified", message: "Progress verified" });
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

describe("topical relevance floor", () => {
  it("refuses an unrelated resource that matches on one incidental word", () => {
    // "energy" alone used to match an NCERT electrostatics chapter, which then
    // won on authority and was described as addressing quantum annealing.
    expect(() => recommendBestResource({
      id: "req_unrelated",
      topic: "energy gaps in adiabatic quantum computation",
      need: "conceptual_intuition",
      costPreference: "free_only",
    })).toThrow(/No curated resource covers/);
  });

  it("still matches a genuinely relevant topic", () => {
    const result = recommendBestResource({
      id: "req_relevant",
      topic: "electric potential and potential energy",
      need: "conceptual_intuition",
      costPreference: "free_only",
    });
    expect(result.selected.topicTags.join(" ")).toMatch(/potential/);
  });

  it("matches a single-word topic that fully overlaps", () => {
    const result = recommendBestResource({
      id: "req_sat",
      topic: "SAT",
      need: "official_exam_simulation",
      costPreference: "free_only",
    });
    expect(result.selected.topicTags).toContain("SAT");
  });
});
