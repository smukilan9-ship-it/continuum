import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser, sameOriginWrite } from "@/lib/auth";
import { aiErrorResponse, runStructuredAi } from "@/lib/ai-gateway";
import { buildAcademicPrompt } from "@/lib/prompt-context";
import { getStore } from "@/lib/store";
import { promptContracts } from "@/lib/prompt-registry";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  taskClass: z.enum(["misconception_diagnosis", "lesson_generation"]),
  prompt: z.string().min(10).max(8000),
  sourceLocked: z.boolean().default(false),
});

// Model-facing schemas contain only the fields a language model can actually
// produce. Server-controlled identifiers, timestamps, and provenance are never
// delegated to the model — that is what previously made every structured
// generation fail schema validation and fall through the whole fallback chain.
const diagnosisContentSchema = z.object({
  score: z.number().min(0).max(1),
  misconceptionLabel: z.string().max(160).nullable().default(null),
  misconceptionExplanation: z.string().max(1200).nullable().default(null),
  missingPrerequisites: z.array(z.string().max(160)).max(8).default([]),
  recommendedIntervention: z.string().min(1).max(1200),
  rationale: z.string().min(1).max(1600),
});

const lessonContentSchema = z.object({
  title: z.string().min(1).max(200),
  explanation: z.string().min(1).max(4000),
  checksForUnderstanding: z.array(z.string().max(400)).min(1).max(6),
});

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin AI calls are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid generation request", issues: parsed.error.issues }, { status: 400 });
  try {
    const relevantContext = await getStore(user.id).read("load_context", { focus: parsed.data.prompt.slice(0, 500), maxTokens: 800 });
    const academicPrompt = buildAcademicPrompt({
      surface: "learning",
      taskClass: parsed.data.taskClass,
      userRequest: parsed.data.prompt,
      educationLevel: user.educationLevel,
      curriculum: "Use the learner's stored board/curriculum when present; otherwise do not infer one.",
      relevantContext,
      outputContract: promptContracts.learning[parsed.data.taskClass],
      additionalPolicy: parsed.data.sourceLocked ? ["This task is source-locked. Make no factual claim beyond supplied source evidence."] : [],
    });
    const common = {
      request,
      userId: user.id,
      feature: parsed.data.taskClass === "misconception_diagnosis" ? "learn.diagnosis" : "learn.lesson",
      taskClass: parsed.data.taskClass,
      system: academicPrompt.system,
      prompt: academicPrompt.prompt,
      maxOutputTokens: 1800,
      sourceLocked: parsed.data.sourceLocked,
      cacheable: true,
    };
    const result = parsed.data.taskClass === "misconception_diagnosis"
      ? await runStructuredAi({ ...common, schema: diagnosisContentSchema })
      : await runStructuredAi({ ...common, schema: lessonContentSchema });
    return NextResponse.json({ output: result.output, assistance: { reason: result.decision.reason, verification: result.decision.verification, fallbackUsed: result.decision.fallbackUsed } });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
