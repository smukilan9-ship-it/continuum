import { NeonRepository } from "@continuum/db";
import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth";
import { openCredential, sealCredential } from "@/lib/credential-vault";
import { exchangeGoogleCode, googleAccountEmail, googleCalendarScopes, newGoogleIntegrationId } from "@/lib/google-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? url.origin;
  const failure = (reason: string) => {
    const response = NextResponse.redirect(new URL(`/integrations?connection_error=${encodeURIComponent(reason)}#google-calendar`, origin));
    response.cookies.delete("continuum_google_oauth");
    return response;
  };
  const user = await getRequestUser(request);
  const sealedState = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("continuum_google_oauth="))?.split("=").slice(1).join("=");
  if (!user || !sealedState) return failure("session_expired");
  try {
    const state = openCredential<{ state: string; userId: string; issuedAt: number }>(decodeURIComponent(sealedState));
    if (state.userId !== user.id || state.state !== url.searchParams.get("state") || Date.now() - state.issuedAt > 600_000) return failure("invalid_oauth_state");
    const code = url.searchParams.get("code");
    if (!code || url.searchParams.get("error")) return failure(url.searchParams.get("error") ?? "authorization_cancelled");
    const token = await exchangeGoogleCode({ code, origin });
    const email = await googleAccountEmail(token.accessToken);
    const repo = new NeonRepository();
    const existing = await repo.getIntegration(user.id, "google-calendar");
    await repo.upsertIntegration({ id: existing?.id ?? newGoogleIntegrationId(), userId: user.id, provider: "google-calendar", encryptedCredentials: sealCredential({ ...token, email, pushedBlockIds: [] }), scopes: [...googleCalendarScopes] });
    const response = NextResponse.redirect(new URL("/integrations?connected=google-calendar#google-calendar", origin));
    response.cookies.delete("continuum_google_oauth");
    return response;
  } catch {
    return failure("google_connection_failed");
  }
}
