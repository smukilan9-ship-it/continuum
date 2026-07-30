import { NextResponse } from "next/server";
import { z } from "zod";

import { runStructuredAi } from "@/lib/ai-gateway";
import { getRequestUser, enforceRateLimit, sameOriginWrite } from "@/lib/auth";
import { logRequestFailure, publicErrorMessage } from "@/lib/api-errors";
import { GRADER_CONTRACT, explainGrade, settleScore } from "@/lib/learning/explain-back";
import { getStore } from "@/lib/store";

/**
 * Grades an explain-back attempt.
 *
 * The learner wrote the idea with the source hidden. Here it is compared to the
 * passage it came from and the result feeds two things: the mastery record and
 * the review schedule. That second one is why the score is settled server-side
 * from the rubric rather than taken from the model — an inflated score buys a
 * longer interval, and the learner then forgets the concept without ever being
 * asked about it again.
 */
const body = z.object({
  conceptId: z.string().min(3),
  answer: z.string().min(1).max(4_000),
  /** The passage the learner is being graded against. */
  sourceText: z.string().min(1).max(8_000),
  sourceChunkId: z.string().optional(),
  conceptTitle: z.string().min(1).max(200),
  seconds: z.number().min(0).max(3_600).optional(),
});

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "explain-back", Number(process.env.EXPLAIN_CHECKS_PER_HOUR ?? 120), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Too many checks in an hour", resetAt: rate.resetAt }, { status: 429 });

  const parsed = body.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid explain-back submission", issues: parsed.error.issues }, { status: 400 });

  const { conceptId, answer, sourceText, conceptTitle, seconds } = parsed.data;

  try {
    const { output: graded } = await runStructuredAi({
      request,
      userId: user.id,
      feature: "learning.explain",
      // Diagnosing what a learner has misunderstood, which is what this is.
      taskClass: "misconception_diagnosis",
      schema: explainGrade,
      system: GRADER_CONTRACT,
      prompt: [
        `Concept: ${conceptTitle}`,
        "",
        "Passage the learner could not see:",
        sourceText,
        "",
        "The learner's explanation:",
        answer,
      ].join("\n"),
    });

    const grade = settleScore(graded);
    const store = getStore(user.id);
    const now = new Date().toISOString();

    // The evidence is the explanation, so `unseen` is true: the learner
    // produced this from memory rather than picking it from options.
    const result = await store.write("record_learning_evidence", {
      conceptId,
      attemptId: `explain_${Date.now().toString(36)}`,
      correct: grade.verdict !== "misconceived",
      unseen: true,
      explanationScore: grade.score,
      seconds,
    }, now, "standalone_app");

    return NextResponse.json({ grade, mastery: result.data, changeSummary: result.summary });
  } catch (error) {
    logRequestFailure("explain_back_failed", { conceptId }, error);
    return NextResponse.json({ error: publicErrorMessage(error, "The check could not be graded. Your answer was not lost — try again.") }, { status: 502 });
  }
}
