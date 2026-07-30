import { revokeToken } from "@/lib/oauth";
import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/auth";

export async function POST(request: Request) {
  const rate = await enforceRateLimit(request, "oauth-revoke", Number(process.env.OAUTH_REVOCATIONS_PER_MINUTE ?? 60), 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "slow_down" }, { status: 429, headers: { "retry-after": "60" } });
  const form = await request.formData().catch(() => undefined);
  if (!form) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  // The request URL matters: without it a token minted for this deployment's
  // own origin fails to verify here, the catch below swallows it, and the
  // revocation silently does nothing while returning 200 (AC-MCP5).
  try { await revokeToken(String(form.get("token") ?? ""), request.url); } catch { /* OAuth revocation is intentionally idempotent. */ }
  return new NextResponse(null, { status: 200, headers: { "cache-control": "no-store" } });
}
