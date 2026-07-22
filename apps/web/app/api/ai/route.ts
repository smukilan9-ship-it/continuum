import { configuredProviders, generateStructured, routeTask } from "@continuum/ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { checkDailyAiBudget, logModelUsage } from "@/lib/ai-budget";
import { buildAcademicPrompt } from "@/lib/prompt-context";
import { getStore } from "@/lib/store";

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
  const rate = await enforceRateLimit(request, "ai", Number(process.env.AI_REQUESTS_PER_MINUTE ?? 30), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "AI request rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "60" } });
  const providers = configuredProviders();
  const availableProviders = [
    ...(providers.groq ? ["groq" as const] : []),
    ...(providers.featherless ? ["featherless" as const] : []),
    ...(providers.gemini ? ["gemini" as const] : []),
    ...(providers.aiGateway ? ["ai_gateway" as const] : []),
  ];
  if (!availableProviders.length) return NextResponse.json({ error: "Cloud assistance is temporarily unavailable" }, { status: 503 });
  const decision = routeTask({
    id: `route_${Date.now()}`,
    taskClass: parsed.data.taskClass,
    sourceLocked: parsed.data.sourceLocked,
    availableProviders,
  });
  try {
    await checkDailyAiBudget(user.id, 10_000);
    const relevantContext = await getStore(user.id).read("load_context", { focus: parsed.data.prompt.slice(0, 500), maxTokens: 800 });
    const academicPrompt = buildAcademicPrompt({
      surface: "learning",
      taskClass: parsed.data.taskClass,
      userRequest: parsed.data.prompt,
      educationLevel: user.educationLevel,
      curriculum: "Use the learner's stored board/curriculum when present; otherwise do not infer one.",
      relevantContext,
      outputContract: parsed.data.taskClass === "misconception_diagnosis"
        ? "Return the diagnostic schema with a calibrated score, explicit misconception evidence, prerequisites, intervention, and rationale."
        : "Return the lesson schema with a concise explanation and one to six checks for understanding.",
      additionalPolicy: parsed.data.sourceLocked ? ["This task is source-locked. Make no factual claim beyond supplied source evidence."] : [],
    });
    const common = {
      decision,
      system: academicPrompt.system,
      prompt: academicPrompt.prompt,
      maxOutputTokens: 1800,
      userId: user.id,
    };
    const result = parsed.data.taskClass === "misconception_diagnosis"
      ? await generateStructured({ ...common, schema: diagnosisContentSchema })
      : await generateStructured({ ...common, schema: lessonContentSchema });
    await logModelUsage({ userId: user.id, decision: result.decision, usage: result.usage });
    return NextResponse.json({ output: result.output, assistance: { reason: result.decision.reason, verification: result.decision.verification, fallbackUsed: result.decision.fallbackUsed } });
  } catch {
    return NextResponse.json({ error: "Cloud assistance could not complete this request" }, { status: 502 });
  }
}
