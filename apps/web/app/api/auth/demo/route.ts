import { NextResponse } from "next/server";
import { authenticateUser, createAppSession, enforceRateLimit, sameOriginWrite, sessionCookie } from "@/lib/auth";
import { demoAccountPassword, demoLoginEnabled } from "@/lib/env";
import { DEMO_EMAIL } from "@/lib/password-policy";

/**
 * One-click demo sign-in for judges and local demos.
 *
 * This is NOT an authentication bypass: it authenticates the seeded demo
 * account through the exact same password path as any other account, using the
 * server-held demo password. It is disabled unless the demo feature flag is on,
 * and returns 404 when the demo account has not been seeded.
 */
export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin login is not allowed" }, { status: 403 });
  if (!demoLoginEnabled()) return NextResponse.json({ error: "Demo access is not enabled" }, { status: 403 });
  const rate = await enforceRateLimit(request, "demo-login", 30, 15 * 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many demo sign-in attempts", resetAt: rate.resetAt }, { status: 429 });
  const user = await authenticateUser(DEMO_EMAIL, demoAccountPassword());
  if (!user) return NextResponse.json({ error: "The demo account is not available. Run `pnpm seed:demo` first." }, { status: 404 });
  const token = await createAppSession(user.id, request);
  return NextResponse.json({ user }, { headers: { "set-cookie": sessionCookie(token), "cache-control": "no-store" } });
}
