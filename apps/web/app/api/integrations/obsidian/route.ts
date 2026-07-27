import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { resolveSyncConflict, retryObsidianSync, setObsidianSyncPaused, syncDashboard } from "@/lib/obsidian-sync-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_paused"), paused: z.boolean() }),
  z.object({ action: z.literal("retry"), operationId: z.string().min(3).max(200).optional() }),
  z.object({
    action: z.literal("resolve_conflict"),
    conflictId: z.string().min(3).max(200),
    resolution: z.enum(["use_continuum", "use_obsidian", "manual_merge", "duplicate_both", "postpone"]),
    mergedContent: z.string().max(2 * 1024 * 1024).optional(),
  }),
]);

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "obsidian-dashboard", 60, 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Too many sync dashboard requests", resetAt: rate.resetAt }, { status: 429 });
  return NextResponse.json(await syncDashboard(user.id), { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin sync writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "obsidian-dashboard-write", 60, 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Too many sync changes", resetAt: rate.resetAt }, { status: 429 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid sync action", issues: parsed.error.issues }, { status: 400 });
  try {
    if (parsed.data.action === "set_paused") return NextResponse.json(await setObsidianSyncPaused(user.id, parsed.data.paused));
    if (parsed.data.action === "retry") return NextResponse.json(await retryObsidianSync(user.id, parsed.data.operationId));
    return NextResponse.json(await resolveSyncConflict({ userId: user.id, ...parsed.data }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sync action failed" }, { status: 409 });
  }
}
