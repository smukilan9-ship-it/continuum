import { NextResponse } from "next/server";
import { enforceRateLimit, getRequestUser } from "@/lib/auth";

export async function GET(request: Request) {
  const rate = await enforceRateLimit(request, "session-read", Number(process.env.SESSION_READS_PER_MINUTE ?? 120), 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Session rate limit exceeded" }, { status: 429, headers: { "cache-control": "no-store", "retry-after": "60" } });
  const user = await getRequestUser(request);
  return user ? NextResponse.json({ user }, { headers: { "cache-control": "private, no-store" } }) : NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
}
