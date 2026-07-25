import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser, sameOriginWrite } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { buildAcademicPrompt } from "@/lib/prompt-context";
import { aiErrorResponse, runStreamingAi } from "@/lib/ai-gateway";

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
  provider: z.literal("auto").default("auto"),
});

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin code requests are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = codeRequest.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Check the topic, request, and code length before trying again" }, { status: 400 });
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
    const streamed = await runStreamingAi({
      request,
      userId: user.id,
      feature: "code.feedback",
      taskClass: "code_reasoning",
      system: academicPrompt.system,
      prompt: academicPrompt.prompt,
      maxOutputTokens: 1800,
    });
    return streamed.result.toTextStreamResponse({ headers: { "cache-control": "no-store" } });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
