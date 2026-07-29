/**
 * Study sessions (redesign.md §14.1) — the server-side replacement for the
 * localStorage draft. `GET` resumes one, `POST` opens one, `PATCH` advances a
 * phase. Every call is scoped to the session user; a session id is never on its
 * own sufficient to read or move a row.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { createStudySession, getStudySession, latestOpenStudySession, updateStudySession } from "../sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  goalId: z.string().min(3).max(200).optional(),
  conceptId: z.string().min(3).max(200).optional(),
  lesson: z.record(z.string(), z.unknown()).optional(),
});

const patchSchema = z.object({
  sessionId: z.string().min(3).max(200),
  phase: z.enum(["learn", "check", "result", "done"]).optional(),
  lesson: z.record(z.string(), z.unknown()).optional(),
  answer: z.string().max(4_000).optional(),
});

/**
 * The stored checkpoint carries its answer key, so it is summarised rather than
 * returned. Sending the row verbatim would hand the learner the answer to the
 * question they are about to be asked.
 */
function safeSession(session: Awaited<ReturnType<typeof getStudySession>>) {
  if (!session) return undefined;
  const { checkpoint, ...rest } = session;
  return {
    ...rest,
    checkpoint: checkpoint && typeof checkpoint.prompt === "string"
      ? { id: checkpoint.id, prompt: checkpoint.prompt, answerType: checkpoint.answerType, choices: checkpoint.choices, origin: checkpoint.origin }
      : undefined,
  };
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  const session = sessionId ? await getStudySession(sessionId, user.id) : await latestOpenStudySession(user.id);
  if (sessionId && !session) return NextResponse.json({ error: "That study session is not available" }, { status: 404 });
  return NextResponse.json({ session: safeSession(session) ?? null }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin study session writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "study-session-write", Number(process.env.STUDY_SESSIONS_PER_HOUR ?? 120), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Study session rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "3600" } });
  const parsed = createSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid study session", issues: parsed.error.issues }, { status: 400 });
  const session = await createStudySession({ userId: user.id, ...parsed.data });
  return NextResponse.json({ session: safeSession(session) }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin study session writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "study-session-write", Number(process.env.STUDY_SESSIONS_PER_HOUR ?? 120), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Study session rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "3600" } });
  const parsed = patchSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid study session update", issues: parsed.error.issues }, { status: 400 });
  const { sessionId, ...patch } = parsed.data;
  const session = await updateStudySession(sessionId, user.id, {
    ...patch,
    ...(patch.phase === "done" ? { completedAt: new Date().toISOString() } : {}),
  });
  if (!session) return NextResponse.json({ error: "That study session is not available" }, { status: 404 });
  return NextResponse.json({ session: safeSession(session) });
}
