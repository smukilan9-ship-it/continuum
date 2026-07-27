import { randomUUID } from "node:crypto";
import { diagnosePotentialMisconception, updateMastery } from "@continuum/domain";
import { diagnosticResultSchema, lessonOutputSchema } from "@continuum/schemas";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { evaluateQuestionAnswer } from "@/lib/question-bank";

export const runtime = "nodejs";

const questions = [
  { id: "item_potential_1", prompt: "Which quantity is the same for two charges at one point?", choices: ["Potential energy", "Electric potential", "Work done", "Force"], correct: 1 },
  { id: "item_potential_2", prompt: "Moving along an equipotential surface requires…", choices: ["positive work", "negative work", "zero work", "charge-dependent work"], correct: 2 },
  { id: "item_potential_3", prompt: "At 12 V, what is U for 3 C?", choices: ["4 J", "12 J", "15 J", "36 J"], correct: 3 },
] as const;

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("diagnose"), answers: z.array(z.object({ itemId: z.string(), selectedIndex: z.number().int().min(0).max(3) })).length(3), liveAi: z.boolean().default(false) }),
  z.object({
    action: z.literal("lesson"),
    liveAi: z.boolean().default(false),
    topic: z.string().trim().min(2).max(300).optional(),
    description: z.string().trim().max(2_000).optional(),
    conceptId: z.string().min(3).max(200).optional(),
  }),
  z.object({ action: z.literal("lesson_read"), conceptId: z.string().min(3).max(200).default("concept_potential") }),
  z.object({ action: z.literal("checkpoint"), answer: z.union([z.string(), z.number()]) }),
  z.object({ action: z.literal("ask_question"), selection: z.string().trim().min(8).max(4_000), conceptId: z.string().min(3).max(200).default("concept_potential") }),
  z.object({
    action: z.literal("evaluate_answer"),
    selection: z.string().trim().min(8).max(4_000),
    question: z.string().trim().min(8).max(2_000),
    answer: z.string().trim().min(1).max(8_000),
    conceptId: z.string().min(3).max(200).default("concept_potential"),
    selfConfidence: z.number().min(0).max(1).optional(),
  }),
]);

function seededRoute(task: "diagnostic" | "lesson") {
  return {
    reason: `The reviewed ${task} curriculum path was used because live assistance was not requested.`,
    verification: "schema_passed",
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
    return await response.json() as { output?: unknown; assistance?: unknown };
  } catch {
    return undefined;
  }
}

async function potentialGoalId(store: ReturnType<typeof getStore>) {
  const snapshot = await store.workspace("learn");
  const goals = Array.isArray(snapshot.goals) ? snapshot.goals as Array<Record<string, unknown>> : [];
  const matching = goals.find((goal) => /electrostatic|electric potential|physics/i.test(String(goal.title ?? "")));
  return typeof matching?.id === "string" ? matching.id : undefined;
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

  if (parsed.data.action === "ask_question") {
    const selection = parsed.data.selection.replace(/\s+/g, " ").trim();
    const resolvedConceptId = parsed.data.conceptId.startsWith("concept_") ? parsed.data.conceptId : await store.ensureConcept(selection.slice(0, 180));
    return NextResponse.json({
      question: `What does this mean, and why does it matter: “${selection.slice(0, 420)}${selection.length > 420 ? "…" : ""}”?`,
      conceptId: resolvedConceptId,
      answerType: "natural_language",
    });
  }

  if (parsed.data.action === "evaluate_answer") {
    const evaluation = evaluateQuestionAnswer({
      id: "lesson_selection_question",
      prompt: parsed.data.question,
      expectedAnswer: parsed.data.selection,
      explanation: `A stronger answer preserves the selected idea and explains it in the learner’s own words: ${parsed.data.selection}`,
      type: parsed.data.selection.length > 180 ? "long_answer" : "short_answer",
      difficulty: 0.5,
      sourceChunkIds: [],
    }, parsed.data.answer);
    const evidenceId = `evidence_natural_answer_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const mastery = updateMastery(await store.getLearningState(parsed.data.conceptId), {
      id: evidenceId,
      kind: "guided_practice",
      correct: evaluation.correct,
      score: evaluation.score,
      completeness: evaluation.completeness,
      difficulty: 0.5,
      selfConfidence: parsed.data.selfConfidence,
      occurredAt: now,
    });
    await store.saveLearningState(mastery);
    await store.appendEvent({
      type: "learning.natural.answer.evaluated",
      summary: `${evaluation.verdict === "correct" ? "Complete" : evaluation.verdict === "incomplete" ? "Incomplete" : "Incorrect"} natural-language lesson answer recorded.`,
      entityIds: [evidenceId, parsed.data.conceptId],
      payload: { score: evaluation.score, verdict: evaluation.verdict, mastery },
      goalId: await potentialGoalId(store),
    }, now);
    return NextResponse.json({ evaluation, mastery, evidenceId });
  }

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
      goalId: await potentialGoalId(store),
    }, now);

    const live = data.liveAi ? await tryLiveAi(request, {
      taskClass: "misconception_diagnosis",
      prompt: `Classify this CBSE Physics diagnostic response pattern and return the required diagnostic structure. Deterministic scoring: ${JSON.stringify(checked)}. Preserve the supplied correctness values.`,
      sourceLocked: true,
    }) : undefined;
    return NextResponse.json({
      result,
      mastery,
      assistance: live?.assistance ?? seededRoute("diagnostic"),
      generated: live?.output,
      liveFallback: data.liveAi && !live,
    });
  }

  if (parsed.data.action === "lesson") {
    const requestedTopic = parsed.data.topic?.trim();
    const potentialLesson = !requestedTopic || /electric potential|potential energy/i.test(requestedTopic);
    const seeded = lessonOutputSchema.parse({
      id: potentialLesson ? "lesson_potential_contrast" : `lesson_${(parsed.data.conceptId ?? "planned_concept").replace(/^concept_/, "")}`,
      conceptId: parsed.data.conceptId ?? (potentialLesson ? "concept_potential" : await store.ensureConcept(requestedTopic!)),
      title: potentialLesson ? "Same place. Same potential. Different energy." : `A focused introduction to ${requestedTopic}`,
      explanation: potentialLesson
        ? "Electric potential V belongs to a location in the field. Potential energy U = qV also depends on the charge placed there."
        : parsed.data.description || `Build a clear explanation of ${requestedTopic}, connect it to its prerequisite step, and test the idea without looking back.`,
      checksForUnderstanding: [potentialLesson ? "At a fixed point, what changes when q doubles?" : `Explain ${requestedTopic} in your own words and give one example or application.`],
      sourceChunkIds: potentialLesson ? ["chunk_physics_seed_2"] : [],
      evidenceState: potentialLesson ? "direct_support" : "model_inference",
      promptVersion: potentialLesson ? "physics-seed-v1" : "learning-path-v1",
      model: potentialLesson ? "reviewed-curriculum" : "continuum-learning-path",
    });
    const live = parsed.data.liveAi ? await tryLiveAi(request, {
      taskClass: "lesson_generation",
      prompt: potentialLesson
        ? "Create a concise CBSE Class 12 contrastive lesson explaining why electric potential is a field/location property while U=qV depends on the test charge. Cite only chunk_physics_seed_2."
        : `Create a six-minute lesson on ${requestedTopic}. Stored learning-step description: ${parsed.data.description ?? "not supplied"}. Teach one concept at a time, include one example, and end with a natural-language check. State limitations if the stored context is insufficient.`,
      sourceLocked: potentialLesson,
    }) : undefined;
    const lesson = live?.output ? lessonOutputSchema.safeParse(live.output) : undefined;
    const selected = lesson?.success ? { ...seeded, ...lesson.data, id: seeded.id, conceptId: seeded.conceptId, sourceChunkIds: seeded.sourceChunkIds, evidenceState: seeded.evidenceState, promptVersion: seeded.promptVersion, model: typeof live?.assistance === "object" ? "continuum-routed-model" : seeded.model } : seeded;
    return NextResponse.json({
      lesson: {
        ...selected,
        durationMinutes: 6,
        objectives: potentialLesson
          ? ["Distinguish electric potential from potential energy", "Use U = qV without confusing field and charge properties"]
          : [`Explain the central idea in ${requestedTopic}`, "Connect it to the planned prerequisite", "Answer one check without looking back"],
        sections: potentialLesson
          ? [
            { heading: "Potential belongs to a place", body: "It describes the source charges and location. At a fixed point, changing the test charge does not change V." },
            { heading: "Energy belongs to a charge at that place", body: "U = qV. Doubling q doubles U, and a negative charge changes its sign." },
          ]
          : [
            { heading: "Core idea", body: selected.explanation },
            { heading: "Use it actively", body: `Create one concrete example of ${requestedTopic}, then explain what would change if one important condition changed.` },
          ],
        examples: potentialLesson ? ["At 12 V, a 3 C charge has U = 36 J; a 1 C charge at the same place has U = 12 J."] : [`Use the current learning task as a worked example: ${parsed.data.description ?? requestedTopic}.`],
      },
      assistance: live?.assistance ?? seededRoute("lesson"),
      liveFallback: parsed.data.liveAi && !live,
    });
  }

  if (parsed.data.action === "lesson_read") {
    const evidenceId = `evidence_lesson_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const mastery = updateMastery(await store.getLearningState(parsed.data.conceptId), { id: evidenceId, kind: "lesson_read", occurredAt: now });
    await store.saveLearningState(mastery);
    await store.appendEvent({ type: "learning.lesson.read", summary: "Targeted lesson read; transfer mastery was deliberately unchanged.", entityIds: [evidenceId], payload: { mastery }, goalId: await potentialGoalId(store) }, now);
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
    goalId: await potentialGoalId(store),
  }, now);
  return NextResponse.json({ correct, attemptId, mastery, explanation: mastery.explanation });
}
