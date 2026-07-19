import { randomUUID } from "node:crypto";
import { diagnosePotentialMisconception, updateMastery } from "@continuum/domain";
import { diagnosticResultSchema, lessonOutputSchema } from "@continuum/schemas";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";

export const runtime = "nodejs";

const questions = [
  { id: "item_potential_1", prompt: "Which quantity is the same for two charges at one point?", choices: ["Potential energy", "Electric potential", "Work done", "Force"], correct: 1 },
  { id: "item_potential_2", prompt: "Moving along an equipotential surface requires…", choices: ["positive work", "negative work", "zero work", "charge-dependent work"], correct: 2 },
  { id: "item_potential_3", prompt: "At 12 V, what is U for 3 C?", choices: ["4 J", "12 J", "15 J", "36 J"], correct: 3 },
] as const;

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("diagnose"), answers: z.array(z.object({ itemId: z.string(), selectedIndex: z.number().int().min(0).max(3) })).length(3), liveAi: z.boolean().default(false) }),
  z.object({ action: z.literal("lesson"), liveAi: z.boolean().default(false) }),
  z.object({ action: z.literal("lesson_read") }),
  z.object({ action: z.literal("checkpoint"), answer: z.union([z.string(), z.number()]) }),
]);

function seededRoute(task: "diagnostic" | "lesson") {
  return {
    route: "seeded",
    model: `continuum/${task}-seed-v1`,
    reason: "Live AI is off, so the validated curriculum seed was used for a stable demo path.",
    sourceMode: "source_locked",
    verification: "schema_passed",
    costClass: "none",
    fallbackUsed: false,
  };
}

async function tryLiveAi(request: Request, body: Record<string, unknown>) {
  try {
    const response = await fetch(new URL("/api/ai", request.url), {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(request.url).origin, cookie: request.headers.get("cookie") ?? "" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok) return undefined;
    return await response.json() as { output?: unknown; decision?: unknown };
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin learning writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "learning-write", Number(process.env.LEARNING_ACTIONS_PER_HOUR ?? 120), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Learning action rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "3600" } });
  const parsed = requestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid learning action", issues: parsed.error.issues }, { status: 400 });
  const store = getStore(user.id);
  const now = new Date().toISOString();

  if (parsed.data.action === "diagnose") {
    const data = parsed.data;
    const attemptId = `attempt_diagnostic_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const checked = questions.map((question) => {
      const submitted = data.answers.find((answer) => answer.itemId === question.id);
      const selectedIndex = submitted?.selectedIndex ?? -1;
      return { itemId: question.id, answer: question.choices[selectedIndex] ?? "No answer", correct: selectedIndex === question.correct };
    });
    const misconceptionSignal = !checked[0]!.correct || !checked[2]!.correct;
    const diagnosis = diagnosePotentialMisconception(misconceptionSignal ? "potential energy depends on charge qV" : "potential is a field property");
    const result = diagnosticResultSchema.parse({
      id: `diagnostic_${attemptId.replace(/^attempt_diagnostic_/, "")}`,
      assessmentId: "assessment_potential",
      score: checked.filter((answer) => answer.correct).length / checked.length,
      answers: checked,
      missingPrerequisites: [],
      ...(diagnosis.detected ? {
        misconception: {
          id: `misconception_${attemptId.replace(/^attempt_diagnostic_/, "")}`,
          conceptId: "concept_potential",
          label: diagnosis.label,
          description: diagnosis.explanation,
          evidenceAttemptId: attemptId,
          confidence: 0.91,
          status: "confirmed",
          detectedAt: now,
        },
      } : {}),
      recommendedIntervention: diagnosis.detected ? "Contrast electric potential with charge-dependent potential energy, then use an unseen numerical." : "Skip remediation and use an unseen transfer numerical.",
      rationale: diagnosis.detected ? "The Q1/Q3 response pattern crosses the field-property and charge-dependent boundary." : "All three diagnostic answers distinguish the concepts correctly.",
      createdAt: now,
    });

    const current = await store.getLearningState();
    const mastery = diagnosis.detected
      ? updateMastery(current, { id: attemptId, kind: "assessment", correct: false, unseen: true, occurredAt: now })
      : updateMastery(current, { id: attemptId, kind: "guided_practice", correct: true, occurredAt: now });
    await store.saveLearningState(mastery);
    await store.appendEvent({
      type: "learning.diagnostic.completed",
      summary: diagnosis.detected ? "Diagnostic confirmed the potential-versus-energy misconception." : "Diagnostic completed without a misconception signal.",
      entityIds: [attemptId, ...(result.misconception ? [result.misconception.id] : [])],
      payload: { score: result.score, result, mastery },
      goalId: "goal_physics",
    }, now);

    const live = data.liveAi ? await tryLiveAi(request, {
      taskClass: "misconception_diagnosis",
      prompt: `Classify this CBSE Physics diagnostic response pattern and return the required diagnostic structure. Deterministic scoring: ${JSON.stringify(checked)}. Preserve the supplied correctness values.`,
      sourceLocked: true,
    }) : undefined;
    return NextResponse.json({
      result,
      mastery,
      route: live?.decision ?? seededRoute("diagnostic"),
      generated: live?.output,
      liveFallback: data.liveAi && !live,
    });
  }

  if (parsed.data.action === "lesson") {
    const seeded = lessonOutputSchema.parse({
      id: "lesson_potential_contrast",
      conceptId: "concept_potential",
      title: "Same place. Same potential. Different energy.",
      explanation: "Electric potential V belongs to a location in the field. Potential energy U = qV also depends on the charge placed there.",
      checksForUnderstanding: ["At a fixed point, what changes when q doubles?"],
      sourceChunkIds: ["chunk_physics_seed_2"],
      evidenceState: "direct_support",
      promptVersion: "physics-seed-v1",
      model: "continuum/lesson-seed-v1",
    });
    const live = parsed.data.liveAi ? await tryLiveAi(request, {
      taskClass: "lesson_generation",
      prompt: "Create a concise CBSE Class 12 contrastive lesson explaining why electric potential is a field/location property while U=qV depends on the test charge. Cite only chunk_physics_seed_2.",
      sourceLocked: true,
    }) : undefined;
    const lesson = live?.output ? lessonOutputSchema.safeParse(live.output) : undefined;
    return NextResponse.json({ lesson: lesson?.success ? lesson.data : seeded, route: live?.decision ?? seededRoute("lesson"), liveFallback: parsed.data.liveAi && !live });
  }

  if (parsed.data.action === "lesson_read") {
    const evidenceId = `evidence_lesson_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const mastery = updateMastery(await store.getLearningState(), { id: evidenceId, kind: "lesson_read", occurredAt: now });
    await store.saveLearningState(mastery);
    await store.appendEvent({ type: "learning.lesson.read", summary: "Targeted lesson read; transfer mastery was deliberately unchanged.", entityIds: [evidenceId], payload: { mastery }, goalId: "goal_physics" }, now);
    return NextResponse.json({ mastery, transferChanged: false });
  }

  const numericAnswer = Number(parsed.data.answer);
  const expected = (9e9 * 2e-9) / 0.75;
  const correct = Number.isFinite(numericAnswer) && Math.abs(numericAnswer - expected) <= 0.01;
  const attemptId = `attempt_checkpoint_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const mastery = updateMastery(await store.getLearningState(), { id: attemptId, kind: "assessment", correct, unseen: true, occurredAt: now });
  await store.saveLearningState(mastery);
  await store.appendEvent({
    type: "learning.checkpoint.completed",
    summary: correct ? "Correct unseen checkpoint raised transfer mastery." : "Unseen checkpoint kept the misconception active.",
    entityIds: [attemptId, "concept_potential"],
    payload: { correct, answer: numericAnswer, expected, unseen: true, mastery },
    goalId: "goal_physics",
  }, now);
  return NextResponse.json({ correct, attemptId, mastery, explanation: mastery.explanation });
}
