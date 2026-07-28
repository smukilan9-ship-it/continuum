import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { logRequestFailure, publicErrorMessage } from "@/lib/api-errors";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), proposalId: z.string().min(3) }),
  z.object({ action: z.literal("reject"), proposalId: z.string().min(3) }),
  z.object({ action: z.literal("commit_schedule"), proposalId: z.string().min(3) }),
]);

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin proposal changes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "proposal-review", Number(process.env.PROPOSAL_REVIEWS_PER_HOUR ?? 60), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Proposal review rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "3600" } });
  const parsed = actionSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid proposal action", issues: parsed.error.issues }, { status: 400 });
  const now = new Date().toISOString();
  const store = getStore(user.id);
  try {
    if (parsed.data.action === "reject") {
      const result = await store.write("reject_proposal", { proposalId: parsed.data.proposalId }, now, "standalone_app");
      return NextResponse.json({ result: result.data, changeSummary: result.summary });
    }
    if (parsed.data.action === "confirm") {
      const result = await store.write("confirm_proposal", { proposalId: parsed.data.proposalId, confirmedBy: user.id, confirmedAt: now }, now, "standalone_app");
      return NextResponse.json({ result: result.data, changeSummary: result.summary });
    }
    const result = await store.write("commit_schedule_change", { proposalId: parsed.data.proposalId, confirmation: { confirmedBy: user.id, confirmedAt: now } }, now, "standalone_app");
    return NextResponse.json({ result: result.data, changeSummary: result.summary });
  } catch (error) {
    logRequestFailure("proposal_review_failed", {}, error);
    return NextResponse.json({ error: publicErrorMessage(error, "The proposal could not be reviewed") }, { status: 409 });
  }
}
