import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOAL_VIEWS = ["overview", "plan", "study", "sources"] as const;
type GoalView = (typeof GOAL_VIEWS)[number];

/**
 * §16.3 `GET /api/goals/[id]?view=`. Per-view payloads for §9.6, so switching
 * tabs fetches only that tab (AC-G3) and never carries another goal's objects
 * (AC-G1).
 *
 * §16.10 requires ownership to be verified before anything is returned: the
 * store's read resolves the goal against the caller's own id first and answers
 * 404 — not 403 — when it does not, so the endpoint cannot be used to probe
 * which goal ids exist.
 */
export async function GET(request: Request, { params }: { params: Promise<{ goalId: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "goal-read", Number(process.env.STATE_READS_PER_MINUTE ?? 120), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Read rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "60" } });

  const { goalId } = await params;
  if (!goalId || goalId.length > 200 || !/^[a-zA-Z0-9_-]+$/.test(goalId)) {
    return NextResponse.json({ error: "Invalid goal id" }, { status: 400 });
  }
  const requested = new URL(request.url).searchParams.get("view") ?? "overview";
  if (!GOAL_VIEWS.includes(requested as GoalView)) return NextResponse.json({ error: "Unknown goal view" }, { status: 400 });

  const data = await getStore(user.id).goalView(goalId, requested as GoalView);
  if (!data) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  return NextResponse.json({ data, view: requested, freshness: new Date().toISOString() }, { headers: { "cache-control": "private, no-store" } });
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  outcome: z.string().trim().min(1).max(2_000).optional(),
  targetDate: z.iso.datetime().optional(),
  status: z.enum(["active", "paused", "completed", "archived"]).optional(),
  deleted: z.literal(true).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Nothing to change" });

/**
 * §9.6's `⋯` menu — Edit goal, Archive, Delete — needs a write, and shipping
 * the menu without one would be exactly the dead control this redesign exists
 * to remove. Deleting is a soft delete that also retires the goal's tasks and
 * milestones, so nothing referencing them dangles and a restore stays possible.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ goalId: string }> }) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin goal writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "goal-write", Number(process.env.STATE_WRITES_PER_HOUR ?? 180), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Write rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "3600" } });

  const { goalId } = await params;
  if (!goalId || goalId.length > 200 || !/^[a-zA-Z0-9_-]+$/.test(goalId)) {
    return NextResponse.json({ error: "Invalid goal id" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Check the goal change and try again", issues: parsed.error.issues }, { status: 400 });

  const store = getStore(user.id);
  const goal = await store.updateGoal(goalId, parsed.data);
  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  await store.appendEvent({
    type: parsed.data.deleted ? "goal.deleted" : parsed.data.status === "archived" ? "goal.archived" : "goal.updated",
    summary: parsed.data.deleted
      ? `Deleted the goal “${String(goal.title)}” and retired its tasks.`
      : `Updated the goal “${String(goal.title)}”.`,
    entityIds: [goalId],
    payload: { changes: parsed.data },
  });
  return NextResponse.json({ goal });
}
