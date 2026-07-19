import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { getStore } from "@/lib/store";

const checkpoint = z.object({
  topic: z.string().min(2).max(500),
  goalId: z.string().max(200).optional(),
  learned: z.string().min(2).max(2_000),
  nextAction: z.string().min(2).max(500),
});

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin checkpoint writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = checkpoint.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Add what you learned and one next action" }, { status: 400 });
  const rate = await enforceRateLimit(request, "code-checkpoint", 30, 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Checkpoint limit reached" }, { status: 429 });
  const result = await getStore(user.id).write("sync_session", {
    sessionId: `code_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
    goalId: parsed.data.goalId,
    summary: `Coding checkpoint: ${parsed.data.topic}. ${parsed.data.learned}`,
    completed: [`Worked on ${parsed.data.topic}`],
    conceptsLearned: [parsed.data.learned],
    nextActions: [parsed.data.nextAction],
    decisions: [], misconceptions: [], unresolvedQuestions: [], evidenceIds: [], mode: "auto_low_impact",
  }, new Date().toISOString(), "standalone_app");
  return NextResponse.json({ receipt: result.data, changeSummary: result.summary }, { status: 201 });
}
