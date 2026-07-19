import { randomUUID } from "node:crypto";
import { NeonRepository } from "@continuum/db";
import { NextResponse } from "next/server";
import { createAppSession, enforceRateLimit, safeReturnTo, sessionCookie } from "@/lib/auth";
import { openCredential } from "@/lib/credential-vault";
import { applicationBaseUrl } from "@/lib/env";
import { exchangeGoogleSignInCode, googleVerifiedIdentity } from "@/lib/google-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SignInState = { state: string; codeVerifier: string; returnTo: string; timezone: string; issuedAt: number };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = applicationBaseUrl() ?? url.origin;
  const finish = (target: string, session?: string) => {
    const response = NextResponse.redirect(new URL(target, origin));
    response.cookies.delete("continuum_google_signin");
    if (session) response.headers.append("set-cookie", sessionCookie(session));
    return response;
  };
  const rate = await enforceRateLimit(request, "google-sign-in-callback", 30, 15 * 60_000);
  if (!rate.allowed) return finish("/login?auth_error=rate_limited");
  const sealed = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("continuum_google_signin="))?.split("=").slice(1).join("=");
  if (!sealed) return finish("/login?auth_error=session_expired");
  try {
    const state = openCredential<SignInState>(decodeURIComponent(sealed));
    if (state.state !== url.searchParams.get("state") || Date.now() - state.issuedAt > 600_000) return finish("/login?auth_error=invalid_state");
    const code = url.searchParams.get("code");
    if (!code || url.searchParams.get("error")) return finish("/login?auth_error=cancelled");
    if (!/^[A-Za-z0-9_-]{64}$/.test(state.codeVerifier)) return finish("/login?auth_error=invalid_state");
    const accessToken = await exchangeGoogleSignInCode({ code, origin, codeVerifier: state.codeVerifier });
    const identity = await googleVerifiedIdentity(accessToken);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 24);
    const user = await new NeonRepository().resolveOrCreateOAuthUser({ id: `user_${suffix}`, identityId: `identity_google_${suffix}`, provider: "google", subject: identity.subject, email: identity.email, displayName: identity.displayName, timezone: state.timezone });
    const token = await createAppSession(user.id, request);
    return finish(safeReturnTo(state.returnTo), token);
  } catch {
    return finish("/login?auth_error=google_failed");
  }
}
