import { issueToken, mcpResource, validMcpResource, verifyClientRegistration, verifyPkce, verifyToken } from "@/lib/oauth";
import { getStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/auth";

async function tokenResponse(payload: { sub: string; clientId: string; scopes: string[]; resource: string }) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: await issueToken({ ...payload, type: "access", exp: now + 3600 }),
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: await issueToken({ ...payload, type: "refresh", exp: now + 30 * 24 * 3600 }),
    scope: payload.scopes.join(" "),
  };
}

export async function POST(request: Request) {
  const rate = await enforceRateLimit(request, "oauth-token", Number(process.env.OAUTH_TOKEN_REQUESTS_PER_MINUTE ?? 60), 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "slow_down", error_description: "Token endpoint rate limit exceeded" }, { status: 429, headers: { "retry-after": "60" } });
  const form = await request.formData().catch(() => undefined);
  if (!form) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  try {
    if (form.get("grant_type") === "authorization_code") {
      const code = await verifyToken(String(form.get("code") ?? ""), "code");
      const clientId = String(form.get("client_id") ?? "");
      verifyClientRegistration(clientId);
      if (clientId !== code.clientId) throw new Error("Authorization code was issued to a different client");
      const resource = String(form.get("resource") ?? code.resource ?? mcpResource());
      if (!validMcpResource(resource) || resource !== code.resource) throw new Error("Resource indicator does not match the authorization request");
      if (code.redirectUri !== String(form.get("redirect_uri") ?? "") || !code.codeChallenge || !verifyPkce(String(form.get("code_verifier") ?? ""), code.codeChallenge)) throw new Error("PKCE or redirect URI verification failed");
      await getStore(code.sub).consumeOAuthCode(code.jti);
      return NextResponse.json(await tokenResponse({ ...code, resource }), { headers: { "cache-control": "no-store" } });
    }
    if (form.get("grant_type") === "refresh_token") {
      const raw = String(form.get("refresh_token") ?? "");
      const refresh = await verifyToken(raw, "refresh");
      const clientId = String(form.get("client_id") ?? "");
      verifyClientRegistration(clientId);
      if (clientId !== refresh.clientId) throw new Error("Refresh token was issued to a different client");
      const resource = String(form.get("resource") ?? refresh.resource ?? mcpResource());
      if (!validMcpResource(resource) || resource !== refresh.resource) throw new Error("Resource indicator does not match the refresh token");
      await getStore(refresh.sub).consumeOAuthGrant(refresh.jti, "refresh");
      return NextResponse.json(await tokenResponse({ ...refresh, resource }), { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "invalid_grant", error_description: error instanceof Error ? error.message : "Token exchange failed" }, { status: 400 });
  }
}
