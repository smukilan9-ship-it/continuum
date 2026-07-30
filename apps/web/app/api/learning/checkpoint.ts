/**
 * Per-concept checkpoint items (redesign.md §14.1).
 *
 * The Learn screen used to render one hardcoded physics numerical — "using
 * k = 9x10^9, what is V at 0.75 m from a +2 nC point charge?" — for *every*
 * concept, and the route graded every answer against that single expected
 * value. Studying anything else produced a question about electrostatics.
 *
 * The question now comes from the concept being studied, through three tiers in
 * descending order of confidence:
 *
 *   1. `reviewed_curriculum` — a human-reviewed item with a real answer key.
 *      Only concepts that genuinely have one appear here. This is content, not
 *      a UI branch: nothing about the surface knows which concept it is.
 *   2. `generated` — an item written for this concept by the model.
 *   3. `open_response` — generation failed, so the learner is asked to explain
 *      the idea in their own words and **is told that is what happened**
 *      (§14.1: "fall back to an open-response item and say so honestly").
 *
 * Grading stays on the server in every tier, which is why `correctAnswer` never
 * leaves this module.
 */
import { randomUUID } from "node:crypto";
import { evaluateQuestionAnswer } from "@/lib/question-bank";

export type CheckpointOrigin = "reviewed_curriculum" | "generated" | "open_response";

export type CheckpointItem = {
  id: string;
  conceptId: string;
  prompt: string;
  answerType: "number" | "single_choice" | "short_text";
  choices?: string[];
  /** Server-side only. Never serialised to the client. */
  correctAnswer: string;
  /** Absolute tolerance for `number` items. */
  tolerance?: number;
  explanation: string;
  origin: CheckpointOrigin;
  unseen: true;
};

/**
 * What the learner is allowed to see *before* answering.
 *
 * `explanation` is excluded along with `correctAnswer`: it works the answer
 * through ("V = kq/r = ... = 24 V"), so shipping it with the question would
 * hand over the answer to the check that is about to be marked. It is returned
 * only from grading, as `checkpointExplanation`.
 */
export type PublicCheckpointItem = Omit<CheckpointItem, "correctAnswer" | "tolerance" | "explanation">;

export type CheckpointConcept = { conceptId: string; label: string; description: string };

/**
 * Reviewed items, keyed by concept. An entry here is a claim that a human
 * checked the answer key, so the bar for adding one is the same as for any
 * other curriculum content.
 */
const reviewedItems: Record<string, Omit<CheckpointItem, "id" | "origin" | "unseen">> = {
  concept_potential: {
    conceptId: "concept_potential",
    prompt: "Using k = 9x10^9, what is the electric potential V at 0.75 m from a +2 nC point charge?",
    answerType: "number",
    correctAnswer: String((9e9 * 2e-9) / 0.75),
    tolerance: 0.01,
    explanation: "V = kq/r = (9x10^9 x 2x10^-9) / 0.75 = 24 V. Potential depends on the source charge and the distance, not on any charge you place there.",
  },
};

function itemId() {
  return `item_checkpoint_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

/** Strips the answer key. The only function that should cross the wire boundary. */
export function publicCheckpoint(item: CheckpointItem): PublicCheckpointItem {
  return {
    id: item.id,
    conceptId: item.conceptId,
    prompt: item.prompt,
    answerType: item.answerType,
    choices: item.choices,
    origin: item.origin,
    unseen: item.unseen,
  };
}

/**
 * The honest note shown beside the question. Only the fallback tier gets one:
 * saying "this was generated for you" on every item would be noise, but silently
 * downgrading to a generic prompt would be a lie of omission.
 */
export function checkpointNotice(origin: CheckpointOrigin) {
  return origin === "open_response"
    ? "Continuum could not write a new question for this concept right now, so this is an open response. Explain the idea in your own words — it is marked against the material, not against a keyword list."
    : undefined;
}

function openResponseItem(concept: CheckpointConcept): CheckpointItem {
  return {
    id: itemId(),
    conceptId: concept.conceptId,
    prompt: `Explain ${concept.label} in your own words, then give one example where it applies.`,
    answerType: "short_text",
    correctAnswer: concept.description,
    explanation: `A complete answer states the idea and applies it: ${concept.description}`,
    origin: "open_response",
    unseen: true,
  };
}

/**
 * Asks the existing generation route for a lesson-shaped output and takes its
 * last check for understanding as an unseen prompt. `/api/ai` accepts only
 * `misconception_diagnosis` and `lesson_generation`, and that route is outside
 * this phase's scope, so the item is produced through the contract that exists
 * rather than by widening one that does not.
 */
async function generateItem(request: Request, concept: CheckpointConcept): Promise<CheckpointItem | undefined> {
  try {
    const response = await fetch(new URL("/api/ai", request.url), {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(request.url).origin, cookie: request.headers.get("cookie") ?? "" },
      body: JSON.stringify({
        taskClass: "lesson_generation",
        prompt: `Write one transfer check for "${concept.label}". Stored description: ${concept.description}. The question must apply the idea to a situation the learner has not already seen, must be answerable in two or three sentences, and must not restate the definition. Put the question in checksForUnderstanding and the model answer in explanation.`,
        sourceLocked: false,
      }),
      cache: "no-store",
    });
    if (!response.ok) return undefined;
    const body = await response.json() as { output?: { checksForUnderstanding?: unknown; explanation?: unknown } };
    const checks = Array.isArray(body.output?.checksForUnderstanding) ? body.output.checksForUnderstanding.filter((value): value is string => typeof value === "string" && value.trim().length > 8) : [];
    const prompt = checks.at(-1);
    const expected = typeof body.output?.explanation === "string" ? body.output.explanation.trim() : "";
    if (!prompt || expected.length < 12) return undefined;
    return {
      id: itemId(),
      conceptId: concept.conceptId,
      prompt: prompt.trim(),
      answerType: "short_text",
      correctAnswer: expected,
      explanation: expected,
      origin: "generated",
      unseen: true,
    };
  } catch {
    // A generation outage must degrade to the open-response item, never to a
    // blank check phase — the learner still has something they can answer.
    return undefined;
  }
}

/**
 * Resolves the item for one concept. `liveAi` is opt-in so the deterministic
 * seeded path stays deterministic for tests and for the demo workspace.
 */
export async function resolveCheckpointItem(
  request: Request,
  concept: CheckpointConcept,
  options: { liveAi?: boolean } = {},
): Promise<CheckpointItem> {
  const reviewed = reviewedItems[concept.conceptId];
  if (reviewed) return { ...reviewed, id: itemId(), origin: "reviewed_curriculum", unseen: true };
  if (options.liveAi) {
    const generated = await generateItem(request, concept);
    if (generated) return generated;
  }
  return openResponseItem(concept);
}

export type CheckpointGrade = {
  correct: boolean;
  score: number;
  completeness: number;
  explanation: string;
};

/**
 * One grader for all three tiers. A numeric item is compared numerically —
 * `Number("24 volts")` is `NaN`, so a unit-carrying answer is read from its
 * leading number rather than failed outright.
 */
export function gradeCheckpoint(item: CheckpointItem, answer: string | number): CheckpointGrade {
  const raw = String(answer).trim();
  if (item.answerType === "number") {
    const submitted = Number(raw.replace(/[^0-9eE+\-.]/g, ""));
    const expected = Number(item.correctAnswer);
    const correct = Number.isFinite(submitted) && Number.isFinite(expected) && Math.abs(submitted - expected) <= (item.tolerance ?? 0.01);
    return {
      correct,
      score: correct ? 1 : 0,
      completeness: correct ? 1 : 0,
      explanation: correct ? item.explanation : `Not this time. ${item.explanation}`,
    };
  }
  if (item.answerType === "single_choice") {
    const correct = raw.toLowerCase() === item.correctAnswer.trim().toLowerCase();
    return {
      correct,
      score: correct ? 1 : 0,
      completeness: correct ? 1 : 0,
      explanation: correct ? item.explanation : `The reviewed answer is ${item.correctAnswer}. ${item.explanation}`,
    };
  }
  const evaluation = evaluateQuestionAnswer({
    id: item.id,
    prompt: item.prompt,
    expectedAnswer: item.correctAnswer,
    explanation: item.explanation,
    type: "short_answer",
    difficulty: 0.5,
    sourceChunkIds: [],
  }, raw);
  return {
    correct: evaluation.correct,
    score: evaluation.score,
    completeness: evaluation.completeness,
    explanation: evaluation.explanation,
  };
}
