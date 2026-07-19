import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { enforceRateLimit, safeReturnTo } from "@/lib/auth";
import { sealCredential } from "@/lib/credential-vault";
import { applicationBaseUrl } from "@/lib/env";
import { googleSignInConfigured, googleSignInUrl } from "@/lib/google-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = applicationBaseUrl() ?? requestUrl.origin;
  if (!googleSignInConfigured()) return NextResponse.redirect(new URL("/login?auth_error=google_not_configured", origin));
  const rate = await enforceRateLimit(request, "google-sign-in-start", 30, 15 * 60_000);
  if (!rate.allowed) return NextResponse.redirect(new URL("/login?auth_error=rate_limited", origin));
  const state = randomBytes(24).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const returnTo = safeReturnTo(requestUrl.searchParams.get("returnTo"));
  const requestedTimezone = requestUrl.searchParams.get("timezone") ?? "UTC";
  let timezone = "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: requestedTimezone }).format(); timezone = requestedTimezone.slice(0, 80); } catch { /* UTC is the safe fallback. */ }
  const response = NextResponse.redirect(googleSignInUrl({ origin, state, codeChallenge }));
  response.cookies.set("continuum_google_signin", sealCredential({ state, codeVerifier, returnTo, timezone, issuedAt: Date.now() }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/google/callback", maxAge: 600 });
  return response;
}
