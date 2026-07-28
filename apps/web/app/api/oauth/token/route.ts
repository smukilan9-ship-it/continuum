import { randomUUID } from "node:crypto";
import { NeonRepository } from "@continuum/db";
import { issueToken, mcpResource, validMcpResource, verifyClientRegistration, verifyPkce, verifyToken } from "@/lib/oauth";
import { getStore } from "@/lib/store";
import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/auth";
import { publicErrorMessage } from "@/lib/api-errors";

async function tokenResponse(payload: { sub: string; clientId: string; scopes: string[]; resource: string }) {
  const now = Math.floor(Date.now() / 1000);
  const registration = await verifyClientRegistration(payload.clientId);
  const connection = process.env.DATABASE_URL
    ? new NeonRepository().upsertOAuthConnection({
      id: `oauth_connection_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
      userId: payload.sub,
      clientId: payload.clientId,
      clientName: registration.clientName,
      scopes: payload.scopes,
    })
    : Promise.resolve();
  const [accessToken, refreshToken] = await Promise.all([
    issueToken({ ...payload, type: "access", exp: now + 3600 }),
    issueToken({ ...payload, type: "refresh", exp: now + 30 * 24 * 3600 }),
    connection,
  ]);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refreshToken,
    scope: payload.scopes.join(" "),
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id");
  const rate = await enforceRateLimit(request, "oauth-token", Number(process.env.OAUTH_TOKEN_REQUESTS_PER_MINUTE ?? 60), 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "slow_down", error_description: "Token endpoint rate limit exceeded" }, { status: 429, headers: { "retry-after": "60" } });
  const form = await request.formData().catch(() => undefined);
  if (!form) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  try {
    if (form.get("grant_type") === "authorization_code") {
      const code = await verifyToken(String(form.get("code") ?? ""), "code");
      const clientId = String(form.get("client_id") ?? "");
      await verifyClientRegistration(clientId);
      if (clientId !== code.clientId) throw new Error("Authorization code was issued to a different client");
      const resource = String(form.get("resource") ?? code.resource ?? mcpResource());
      if (!validMcpResource(resource) || resource !== code.resource) throw new Error("Resource indicator does not match the authorization request");
      if (code.redirectUri !== String(form.get("redirect_uri") ?? "") || !code.codeChallenge || !verifyPkce(String(form.get("code_verifier") ?? ""), code.codeChallenge)) throw new Error("PKCE or redirect URI verification failed");
      await getStore(code.sub).consumeOAuthCode(code.jti);
      const payload = await tokenResponse({ ...code, resource });
      console.info(JSON.stringify({ level: "info", message: "oauth_token_issued", requestId, grantType: "authorization_code", ms: Date.now() - startedAt }));
      return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
    }
    if (form.get("grant_type") === "refresh_token") {
      const raw = String(form.get("refresh_token") ?? "");
      const refresh = await verifyToken(raw, "refresh");
      const clientId = String(form.get("client_id") ?? "");
      await verifyClientRegistration(clientId);
      if (clientId !== refresh.clientId) throw new Error("Refresh token was issued to a different client");
      const resource = String(form.get("resource") ?? refresh.resource ?? mcpResource());
      if (!validMcpResource(resource) || resource !== refresh.resource) throw new Error("Resource indicator does not match the refresh token");
      await getStore(refresh.sub).consumeOAuthGrant(refresh.jti, "refresh");
      const payload = await tokenResponse({ ...refresh, resource });
      console.info(JSON.stringify({ level: "info", message: "oauth_token_issued", requestId, grantType: "refresh_token", ms: Date.now() - startedAt }));
      return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", message: "oauth_token_failed", requestId, error: error instanceof Error ? error.message : "Token exchange failed", ms: Date.now() - startedAt }));
    return NextResponse.json({ error: "invalid_grant", error_description: publicErrorMessage(error, "Token exchange failed") }, { status: 400 });
  }
}
