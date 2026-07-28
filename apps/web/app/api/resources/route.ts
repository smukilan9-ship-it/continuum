import { randomUUID } from "node:crypto";
import { updateMastery } from "@continuum/domain";
import { outcomeReceiptSchema, resourceActivitySchema, type ResourceRecommendation } from "@continuum/schemas";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { checkpointScore } from "@/lib/resource-verification";
import { getStore } from "@/lib/store";
import { logRequestFailure, publicErrorMessage } from "@/lib/api-errors";

export const runtime = "nodejs";

const commaList = z.preprocess(
  (value) => typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : value,
  z.array(z.string().min(1).max(100)).max(20).optional(),
);

const recommendationRequest = z.object({
  topic: z.string().min(2).max(500).default("electric potential"),
  goalId: z.string().optional(),
  conceptId: z.string().optional(),
  goalType: z.enum(["school", "exam", "university", "research", "coding"]).default("school"),
  need: z.enum(["diagnosis", "conceptual_intuition", "canonical_explanation", "guided_practice", "official_exam_simulation", "source_exploration", "research_evidence", "coding_practice"]).default("conceptual_intuition"),
  level: z.string().max(200).optional(),
  minutesAvailable: z.coerce.number().int().positive().max(480).optional(),
  costPreference: z.enum(["free_only", "free_preferred", "any"]).default("free_only"),
  preferredFormats: commaList,
  excludeResourceIds: commaList,
  rejectionReasons: commaList,
  feedback: z.string().max(1000).optional(),
});

const actionRequest = z.discriminatedUnion("action", [
  recommendationRequest.extend({ action: z.literal("start") }),
  z.object({ action: z.literal("return"), activityId: z.string().min(3), evidence: z.string().max(10_000).optional() }),
  z.object({ action: z.literal("verify"), activityId: z.string().min(3), answer: z.string().max(10_000).optional(), score: z.number().min(0).max(1).optional(), artifactReference: z.string().max(2000).optional() }),
]);

function id(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function serializedActivity(row: Record<string, unknown>) {
  const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value;
  return resourceActivitySchema.parse({
    ...row,
    goalId: row.goalId == null ? undefined : row.goalId,
    conceptId: row.conceptId == null ? undefined : row.conceptId,
    startedAt: iso(row.startedAt),
    returnedAt: row.returnedAt == null ? undefined : iso(row.returnedAt),
    verifiedAt: row.verifiedAt == null ? undefined : iso(row.verifiedAt),
    verificationScore: row.verificationScore == null ? undefined : row.verificationScore,
  });
}

type VerificationOutcome = {
  outcome: "verified" | "recorded" | "not_sufficient";
  score: number;
  message: string;
  explanation: string;
};

function validSectionScore(value: number) {
  return Number.isInteger(value) && value >= 200 && value <= 800 && value % 10 === 0;
}

function assessVerification(
  recommendation: ResourceRecommendation,
  input: { answer?: string; artifactReference?: string },
): VerificationOutcome {
  const contract = recommendation.selected.verification;
  const answer = (input.answer ?? input.artifactReference ?? "").trim();
  const threshold = contract.passingScore ?? 1;
  if (!answer) return {
    outcome: "not_sufficient",
    score: 0,
    message: "This does not show completion yet",
    explanation: `Add the information requested here: ${contract.prompt}`,
  };

  if (contract.kind === "checkpoint") {
    if (!contract.expectedAnswer) return {
      outcome: "recorded",
      score: 0,
      message: "Evidence recorded",
      explanation: "Continuum saved your response, but this open-ended working cannot be checked automatically. Complete a checkpoint with a known answer to verify progress immediately.",
    };
    const score = checkpointScore(answer, contract.expectedAnswer);
    return score >= threshold
      ? { outcome: "verified", score, message: "Progress verified", explanation: "Your answer satisfies the saved return checkpoint." }
      : { outcome: "not_sufficient", score, message: "This does not show completion yet", explanation: "The answer does not satisfy the return checkpoint yet. Check your working and edit the response below." };
  }

  if (contract.kind === "score_import" && recommendation.selected.id === "resource_bluebook_sat") {
    const test = answer.match(/\b(?:bb|test|practice\s*test)\s*#?\s*(\d{1,2})\b/i)?.[1];
    const readingWriting = Number(answer.match(/\b(?:rw|r&w|reading(?:\s+and|\s*&)?\s+writing)\s*[:=-]?\s*(\d{3})\b/i)?.[1]);
    const math = Number(answer.match(/\bmath\s*[:=-]?\s*(\d{3})\b/i)?.[1]);
    if (!test || !validSectionScore(readingWriting) || !validSectionScore(math)) return {
      outcome: "not_sufficient",
      score: 0,
      message: "This does not show completion yet",
      explanation: "Enter the Bluebook test number plus both section scores, for example: “Test 10 · Reading and Writing 760 · Math 760”. A total such as “BB10 1520” is not enough.",
    };
    return {
      outcome: "verified",
      score: 1,
      message: "Progress verified",
      explanation: `Bluebook Test ${test} was recorded with Reading and Writing ${readingWriting} and Math ${math}.`,
    };
  }

  if (contract.kind === "score_import" && recommendation.selected.id === "resource_khan_sat") {
    const counts = answer.match(/(\d+)\s*\/\s*(\d+)/);
    const correct = Number(counts?.[1]);
    const attempted = Number(counts?.[2]);
    const namedSkill = answer.replace(/\d+\s*\/\s*\d+/, "").trim().length >= 3;
    if (!counts || !namedSkill || attempted < 1 || correct < 0 || correct > attempted) return {
      outcome: "not_sufficient",
      score: 0,
      message: "This does not show completion yet",
      explanation: "Enter the skill name and a correct/attempted count, for example: “Advanced Math · 8/10”.",
    };
    const score = correct / attempted;
    return score >= threshold
      ? { outcome: "verified", score, message: "Progress verified", explanation: `The named skill set was completed at ${correct}/${attempted}, meeting the saved threshold.` }
      : { outcome: "not_sufficient", score, message: "This does not show completion yet", explanation: `The saved target is ${Math.round(threshold * 100)}%. Review the missed items, then edit this result after another set.` };
  }

  if (contract.kind === "score_import") {
    const raw = Number(answer.match(/\d+(?:\.\d+)?/)?.[0]);
    const score = raw > 1 && raw <= 100 ? raw / 100 : raw;
    if (!Number.isFinite(score) || score < 0 || score > 1) return {
      outcome: "not_sufficient",
      score: 0,
      message: "This does not show completion yet",
      explanation: "Enter the named activity and a valid percentage or score between 0 and 1.",
    };
    return score >= threshold
      ? { outcome: "verified", score, message: "Progress verified", explanation: "The structured score meets the saved completion threshold." }
      : { outcome: "not_sufficient", score, message: "This does not show completion yet", explanation: `The saved completion threshold is ${Math.round(threshold * 100)}%. You can edit the score after another attempt.` };
  }

  if (contract.kind === "explicit_confirmation") {
    const confirmed = /\b(complete|completed|done|yes|finished)\b/i.test(answer);
    return confirmed
      ? { outcome: "verified", score: 1, message: "Progress verified", explanation: "Your explicit completion confirmation satisfies this activity’s saved contract." }
      : { outcome: "not_sufficient", score: 0, message: "This does not show completion yet", explanation: "Confirm clearly that the stated activity is complete, or edit the response with what remains." };
  }

  return {
    outcome: "recorded",
    score: 0,
    message: "Evidence recorded",
    explanation: contract.kind === "artifact"
      ? "Continuum saved the artifact reference, but it cannot inspect or run that external artifact automatically. Add accessible test output or complete a deterministic checkpoint to verify progress."
      : "Continuum saved this reflection, but a personal reflection has no deterministic right answer. Complete a checkpoint or structured score activity to verify progress.",
  };
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "resource-read", Number(process.env.RESOURCE_READS_PER_MINUTE ?? 60), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Resource lookup rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "60" } });
  const url = new URL(request.url);
  const activityId = url.searchParams.get("activityId");
  if (activityId) {
    if (activityId.length < 3) return NextResponse.json({ error: "Invalid resource activity" }, { status: 400 });
    const row = await getStore(user.id).getResourceActivity(activityId);
    if (!row) return NextResponse.json({ error: "Resource activity not found" }, { status: 404 });
    const metadata = (row.metadata ?? {}) as { recommendation?: ResourceRecommendation };
    if (!metadata.recommendation) return NextResponse.json({ error: "This activity has no saved recommendation" }, { status: 409 });
    return NextResponse.json({ activity: serializedActivity(row), recommendation: metadata.recommendation }, { headers: { "cache-control": "private, no-store" } });
  }
  const parsed = recommendationRequest.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid recommendation request", issues: parsed.error.issues }, { status: 400 });
  try {
    const recommendation = await getStore(user.id).recommendResource(parsed.data);
    return NextResponse.json({ recommendation }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    logRequestFailure("resource_selection_failed", {}, error);
    return NextResponse.json({ error: publicErrorMessage(error, "No eligible resource was found") }, { status: 422 });
  }
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin resource writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "resource-write", Number(process.env.RESOURCE_ACTIONS_PER_HOUR ?? 120), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Resource action rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "3600" } });
  const parsed = actionRequest.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid resource action", issues: parsed.error.issues }, { status: 400 });
  const store = getStore(user.id);
  const now = new Date().toISOString();

  if (parsed.data.action === "start") {
    const recommendation = await store.recommendResource(parsed.data);
    const conceptId = recommendation.conceptId ?? await store.ensureConcept(parsed.data.topic);
    const activity = resourceActivitySchema.parse({
      id: id("activity"), userId: user.id, resourceId: recommendation.selected.id, recommendationId: recommendation.id,
      goalId: recommendation.goalId, conceptId, status: "started", startedAt: now, evidenceIds: [],
    });
    await store.saveResourceActivity(activity, { recommendation });
    await store.appendEvent({ type: "resource.activity.started", summary: `Started ${recommendation.selected.title} with a guided return checkpoint.`, entityIds: [activity.id, recommendation.selected.id], payload: { recommendationId: recommendation.id, resourceId: recommendation.selected.id, guidedTask: recommendation.selected.completionInstructions, verificationPlan: recommendation.verificationPlan }, goalId: recommendation.goalId, importance: 0.72 }, now);
    return NextResponse.json({ recommendation, activity });
  }

  const row = await store.getResourceActivity(parsed.data.activityId);
  if (!row) return NextResponse.json({ error: "Resource activity not found" }, { status: 404 });
  const activity = serializedActivity(row);
  const metadata = (row.metadata ?? {}) as { recommendation?: ResourceRecommendation; returnEvidence?: string };
  const recommendation = metadata.recommendation;
  if (!recommendation) return NextResponse.json({ error: "This activity has no server-side verification contract" }, { status: 409 });

  if (parsed.data.action === "return") {
    if (activity.status !== "started") return NextResponse.json({ error: "Only a started activity can be marked returned" }, { status: 409 });
    const returned = resourceActivitySchema.parse({ ...activity, status: "returned", returnedAt: now });
    await store.saveResourceActivity(returned, { ...metadata, returnEvidence: parsed.data.evidence });
    await store.appendEvent({ type: "resource.activity.returned", summary: `Returned from ${recommendation.selected.title}; mastery is unchanged until verification.`, entityIds: [returned.id], payload: { resourceId: returned.resourceId, evidenceProvided: Boolean(parsed.data.evidence) }, goalId: returned.goalId, importance: 0.62 }, now);
    return NextResponse.json({ activity: returned, verification: recommendation.selected.verification });
  }

  if (!activity.returnedAt || !["returned", "needs_review"].includes(activity.status)) return NextResponse.json({ error: "Return from the external resource before verification" }, { status: 409 });
  const contract = recommendation.selected.verification;
  const assessment = assessVerification(recommendation, parsed.data);
  const passed = assessment.outcome === "verified";
  const evidenceId = id(contract.kind === "checkpoint" ? "attempt" : "evidence");
  const verified = resourceActivitySchema.parse({
    ...activity,
    status: passed ? "verified" : assessment.outcome === "recorded" ? "needs_review" : "returned",
    ...(passed ? { verifiedAt: now } : {}),
    evidenceIds: assessment.outcome === "not_sufficient" ? activity.evidenceIds : [...activity.evidenceIds, evidenceId],
    verificationScore: assessment.score,
  });
  await store.saveResourceActivity(verified, { ...metadata, answer: parsed.data.answer, score: parsed.data.score, artifactReference: parsed.data.artifactReference });

  if (!passed) {
    await store.appendEvent({
      type: assessment.outcome === "recorded" ? "resource.evidence.recorded" : "resource.verification.insufficient",
      summary: assessment.outcome === "recorded"
        ? `Recorded evidence from ${recommendation.selected.title}; automatic verification is not available for this evidence type.`
        : `The return checkpoint for ${recommendation.selected.title} is missing required information or does not pass yet.`,
      entityIds: assessment.outcome === "recorded" ? [activity.id, evidenceId] : [activity.id],
      payload: { kind: contract.kind, score: assessment.score, outcome: assessment.outcome },
      goalId: activity.goalId,
      importance: 0.8,
    }, now);
    return NextResponse.json({ verified: false, activity: verified, ...assessment });
  }

  const masteryBefore = await store.getLearningState(activity.conceptId);
  const mastery = updateMastery(masteryBefore, { id: evidenceId, kind: "assessment", correct: true, unseen: true, occurredAt: now });
  await store.saveLearningState(mastery);
  const event = await store.appendEvent({ type: "resource.verification.passed", summary: `Verified progress after ${recommendation.selected.title} with a deterministic return check.`, entityIds: [activity.id, evidenceId, mastery.conceptId], payload: { resourceId: activity.resourceId, score: assessment.score, masteryBefore, masteryAfter: mastery, scheduleFollowup: "15-minute spaced review in 24 hours" }, goalId: activity.goalId, importance: 0.92 }, now);
  const receipt = outcomeReceiptSchema.parse({ id: id("receipt"), userId: user.id, sessionId: activity.id, goalId: activity.goalId, summary: `Completed ${recommendation.selected.title} and passed the return checkpoint.`, completed: recommendation.selected.completionInstructions, conceptsLearned: [mastery.conceptId], nextActions: ["Complete a 15-minute spaced review in about 24 hours."], evidenceIds: [evidenceId], sourceEventIds: [event.id], createdAt: now });
  await store.saveReceipt(receipt);
  const followup = activity.goalId ? await store.scheduleResourceFollowup({
    goalId: activity.goalId,
    activityId: activity.id,
    title: `Review: ${recommendation.selected.title}`,
    evidence: "Pass one unseen transfer checkpoint",
    startsAt: new Date(Date.parse(now) + 24 * 3600_000).toISOString(),
    minutes: 15,
  }) : undefined;
  return NextResponse.json({ verified: true, activity: verified, masteryBefore, mastery, receipt, ...assessment, scheduleUpdate: followup ? { status: "scheduled", followup } : { status: "not_scheduled", reason: "This activity was not linked to a goal." } });
}
