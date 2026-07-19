import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { enforceRateLimit, getRequestUser } from "@/lib/auth";
import { sealCredential } from "@/lib/credential-vault";
import { googleAuthorizationUrl, googleCalendarConfigured } from "@/lib/google-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.redirect(new URL("/login?returnTo=/integrations", request.url));
  const origin = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
  if (!googleCalendarConfigured()) return NextResponse.redirect(new URL("/integrations?connection_error=google_not_configured#google-calendar", origin));
  const rate = await enforceRateLimit(request, "google-calendar-connect", 12, 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.redirect(new URL("/integrations?connection_error=rate_limited#google-calendar", origin));
  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(googleAuthorizationUrl({ origin, state, loginHint: user.email }));
  response.cookies.set("continuum_google_oauth", sealCredential({ state, userId: user.id, issuedAt: Date.now() }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/connections/google/callback", maxAge: 600 });
  return response;
}
