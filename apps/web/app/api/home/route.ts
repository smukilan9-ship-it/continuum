import { NextResponse } from "next/server";
import { enforceRateLimit, getRequestUser } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * §16.3 `GET /api/home`. Home's own read, replacing its slice of the
 * whole-workspace snapshot (C25). Everything it returns is scoped to the caller
 * by the store, which binds their user id (§16.10).
 */
export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "home-read", Number(process.env.STATE_READS_PER_MINUTE ?? 120), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Read rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "60" } });
  const data = await getStore(user.id).homeData();
  return NextResponse.json({ data, freshness: new Date().toISOString() }, { headers: { "cache-control": "private, no-store" } });
}
