import { randomUUID } from "node:crypto";
import { updateMastery } from "@continuum/domain";
import { outcomeReceiptSchema, resourceActivitySchema, type ResourceRecommendation } from "@continuum/schemas";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

const recommendationRequest = z.object({
  topic: z.string().min(2).max(500).default("electric potential"),
  goalId: z.string().optional(),
  conceptId: z.string().optional(),
  goalType: z.enum(["school", "exam", "university", "research", "coding"]).default("school"),
  need: z.enum(["diagnosis", "conceptual_intuition", "canonical_explanation", "guided_practice", "official_exam_simulation", "source_exploration", "research_evidence", "coding_practice"]).default("conceptual_intuition"),
  level: z.string().max(200).optional(),
  minutesAvailable: z.coerce.number().int().positive().max(480).optional(),
  costPreference: z.enum(["free_only", "free_preferred", "any"]).default("free_only"),
  preferredFormats: z.array(z.string()).max(12).optional(),
});

const actionRequest = z.discriminatedUnion("action", [
  recommendationRequest.extend({ action: z.literal("start") }),
  z.object({ action: z.literal("return"), activityId: z.string().min(3), evidence: z.string().max(10_000).optional() }),
  z.object({ action: z.literal("verify"), activityId: z.string().min(3), answer: z.string().max(10_000).optional(), score: z.number().min(0).max(1).optional(), artifactReference: z.string().max(2000).optional() }),
]);

function id(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function normal(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9.+-]/g, "");
  if (["n", "false", "unchanged"].includes(normalized)) return "no";
  if (["y", "true"].includes(normalized)) return "yes";
  return normalized;
}

function checkpointScore(answer: string | undefined, expected: string | undefined) {
  if (!answer || !expected) return 0;
  const actualNumber = Number(answer);
  const expectedNumber = Number(expected);
  if (Number.isFinite(actualNumber) && Number.isFinite(expectedNumber)) return Math.abs(actualNumber - expectedNumber) <= Math.max(0.01, Math.abs(expectedNumber) * 0.005) ? 1 : 0;
  return normal(answer) === normal(expected) ? 1 : 0;
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "No eligible resource was found" }, { status: 422 });
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
  const score = contract.kind === "checkpoint"
    ? checkpointScore(parsed.data.answer, contract.expectedAnswer)
    : contract.kind === "score_import"
      ? parsed.data.score ?? 0
      : parsed.data.artifactReference || parsed.data.answer ? 1 : 0;
  const threshold = contract.passingScore ?? 1;
  const automaticallyVerifiable = (contract.kind === "checkpoint" && typeof contract.expectedAnswer === "string") || contract.kind === "explicit_confirmation";
  const passed = automaticallyVerifiable && score >= threshold;
  const evidenceId = id(contract.kind === "checkpoint" ? "attempt" : "evidence");
  const verified = resourceActivitySchema.parse({
    ...activity,
    status: passed ? "verified" : automaticallyVerifiable ? "returned" : "needs_review",
    ...(passed ? { verifiedAt: now } : {}),
    evidenceIds: [...activity.evidenceIds, evidenceId],
    verificationScore: score,
  });
  await store.saveResourceActivity(verified, { ...metadata, answer: parsed.data.answer, score: parsed.data.score, artifactReference: parsed.data.artifactReference });

  if (!passed) {
    await store.appendEvent({ type: "resource.verification.pending", summary: automaticallyVerifiable ? `The return checkpoint for ${recommendation.selected.title} did not pass; mastery was not increased.` : `Evidence from ${recommendation.selected.title} needs review before progress is accepted.`, entityIds: [activity.id, evidenceId], payload: { kind: contract.kind, score, threshold }, goalId: activity.goalId, importance: 0.8 }, now);
    return NextResponse.json({ verified: false, activity: verified, score, needsReview: !automaticallyVerifiable });
  }

  const masteryBefore = await store.getLearningState(activity.conceptId);
  const mastery = updateMastery(masteryBefore, { id: evidenceId, kind: "assessment", correct: true, unseen: true, occurredAt: now });
  await store.saveLearningState(mastery);
  const event = await store.appendEvent({ type: "resource.verification.passed", summary: `Verified progress after ${recommendation.selected.title} with an unseen checkpoint.`, entityIds: [activity.id, evidenceId, mastery.conceptId], payload: { resourceId: activity.resourceId, score, masteryBefore, masteryAfter: mastery, scheduleFollowup: "15-minute spaced review in 24 hours" }, goalId: activity.goalId, importance: 0.92 }, now);
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
  return NextResponse.json({ verified: true, activity: verified, mastery, receipt, scheduleUpdate: followup ? { status: "scheduled", followup } : { status: "not_scheduled", reason: "This activity was not linked to a goal." } });
}
