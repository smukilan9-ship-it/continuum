import { randomUUID } from "node:crypto";
import { configuredProviders, routeTask, streamGeneration } from "@continuum/ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkDailyAiBudget, logModelUsage } from "@/lib/ai-budget";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { buildAcademicPrompt } from "@/lib/prompt-context";

export const runtime = "nodejs";
export const maxDuration = 60;

const codeRequest = z.object({
  mode: z.enum(["explain", "debug", "practice", "review"]),
  language: z.string().min(1).max(40),
  topic: z.string().min(2).max(500),
  prompt: z.string().min(2).max(8_000),
  code: z.string().max(20_000).default(""),
  runtime: z.object({
    status: z.string().max(80).optional(),
    outcome: z.string().max(80).optional(),
    stdout: z.string().max(40_000).optional(),
    stderr: z.string().max(40_000).optional(),
    exitCode: z.number().int().nullable().optional(),
    durationMs: z.number().min(0).max(120_000).optional(),
    tests: z.array(z.object({ name: z.string().max(200), passed: z.boolean(), actual: z.string().max(20_000).optional(), expected: z.string().max(20_000).optional() })).max(50).optional(),
  }).default({ status: "not_run" }),
  goalId: z.string().max(200).optional(),
  provider: z.enum(["auto", "featherless", "groq"]).default("auto"),
});

function availableRoutes() {
  const providers = configuredProviders();
  return [providers.featherless ? "featherless" as const : undefined, providers.groq ? "groq" as const : undefined]
    .filter((provider): provider is "featherless" | "groq" => Boolean(provider));
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin code requests are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = codeRequest.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Check the topic, request, and code length before trying again" }, { status: 400 });
  const rate = await enforceRateLimit(request, "code-coach", Number(process.env.CODE_REQUESTS_PER_MINUTE ?? 12), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "You have reached the short-term coding limit. Try again in a minute." }, { status: 429, headers: { "retry-after": "60" } });
  const available = availableRoutes();
  if (!available.length) return NextResponse.json({ error: "The code coach is temporarily unavailable" }, { status: 503 });
  if (parsed.data.provider !== "auto" && !available.includes(parsed.data.provider)) return NextResponse.json({ error: "The selected cloud route is temporarily unavailable" }, { status: 503 });
  await checkDailyAiBudget(user.id, 8_000);

  const selectedProviders = parsed.data.provider === "auto" ? available : [parsed.data.provider];
  const decision = routeTask({
    id: `route_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
    taskClass: "code_reasoning",
    sourceLocked: false,
    availableProviders: selectedProviders,
  });
  const context = await getStore(user.id).read("load_context", {
    focus: `${parsed.data.topic} ${parsed.data.language}`,
    goalId: parsed.data.goalId,
    maxTokens: 900,
  });
  const academicPrompt = buildAcademicPrompt({
    surface: "code",
    taskClass: "code_reasoning",
    userRequest: `${parsed.data.mode.toUpperCase()}: ${parsed.data.prompt}`,
    educationLevel: user.educationLevel,
    subject: "Computer Science",
    topic: parsed.data.topic,
    answerStyle: "plain Markdown; concise first; fenced code only when useful",
    relevantContext: context,
    sourceContent: { language: parsed.data.language, exactSourceCode: parsed.data.code },
    runtimeData: parsed.data.runtime,
    outputContract: parsed.data.mode === "debug"
      ? "Identify the cause from actual runtime evidence, show the smallest correction, and explain a verification step."
      : parsed.data.mode === "practice"
        ? "Give one bounded exercise, a success criterion, and progressive hints before a complete solution."
        : "Teach the relevant concept, stay consistent with actual runtime evidence, and include one short check for understanding.",
  });

  try {
    const streamed = await streamGeneration({ decision, system: academicPrompt.system, prompt: academicPrompt.prompt, maxOutputTokens: 1800, userId: user.id, abortSignal: request.signal });
    void Promise.resolve(streamed.result.totalUsage)
      .then((usage) => logModelUsage({ userId: user.id, decision: streamed.decision, usage }))
      .catch(() => undefined);
    return streamed.result.toTextStreamResponse({ headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The code coach could not start. Your work is still in the editor." }, { status: 502 });
  }
}
