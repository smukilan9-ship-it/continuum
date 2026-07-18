import { issueToken, revokeToken, verifyPkce, verifyToken } from "@/lib/oauth";
import { NextResponse } from "next/server";

function tokenResponse(payload: { sub: string; clientId: string; scopes: string[] }) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: issueToken({ ...payload, type: "access", exp: now + 3600 }),
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: issueToken({ ...payload, type: "refresh", exp: now + 30 * 24 * 3600 }),
    scope: payload.scopes.join(" "),
  };
}

export async function POST(request: Request) {
  const form = await request.formData();
  try {
    if (form.get("grant_type") === "authorization_code") {
      const code = verifyToken(String(form.get("code") ?? ""), "code");
      if (code.redirectUri !== String(form.get("redirect_uri") ?? "") || !code.codeChallenge || !verifyPkce(String(form.get("code_verifier") ?? ""), code.codeChallenge)) throw new Error("PKCE or redirect URI verification failed");
      revokeToken(String(form.get("code")));
      return NextResponse.json(tokenResponse(code), { headers: { "cache-control": "no-store" } });
    }
    if (form.get("grant_type") === "refresh_token") {
      const raw = String(form.get("refresh_token") ?? "");
      const refresh = verifyToken(raw, "refresh");
      revokeToken(raw);
      return NextResponse.json(tokenResponse(refresh), { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "invalid_grant", error_description: error instanceof Error ? error.message : "Token exchange failed" }, { status: 400 });
  }
}
