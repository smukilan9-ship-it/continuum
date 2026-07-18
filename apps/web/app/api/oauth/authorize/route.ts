import { issueToken } from "@/lib/oauth";
import { scopes as supportedScopes } from "@continuum/domain";
import { NextResponse } from "next/server";

function safeRedirect(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch { return false; }
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const redirectUri = params.get("redirect_uri") ?? "";
  if (params.get("response_type") !== "code" || params.get("code_challenge_method") !== "S256" || !params.get("code_challenge") || !safeRedirect(redirectUri)) {
    return NextResponse.json({ error: "invalid_request", error_description: "A safe redirect URI and PKCE S256 challenge are required" }, { status: 400 });
  }
  const fields = ["client_id", "redirect_uri", "scope", "state", "code_challenge"].map((name) => `<input type="hidden" name="${name}" value="${(params.get(name) ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">`).join("");
  const requested = (params.get("scope") ?? "memory:read goals:read learning:read research:read schedule:read").split(" ").filter((scope) => supportedScopes.includes(scope as (typeof supportedScopes)[number]));
  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorize Continuum</title><style>body{font-family:system-ui;background:#15372a;color:#171b18;display:grid;place-items:center;min-height:100vh;margin:0}.card{width:min(440px,calc(100vw - 40px));background:#fbfaf6;padding:28px;border-radius:15px}.eyebrow{font-size:10px;letter-spacing:1.5px;color:#657067;font-weight:700}h1{font-family:Georgia,serif;font-weight:400;font-size:32px;margin:8px 0}p,li{font-size:12px;line-height:1.5;color:#677067}ul{background:#f0efe9;padding:14px 14px 14px 32px;border-radius:8px}button{width:100%;height:43px;border:0;border-radius:8px;background:#214e3d;color:white;font-weight:700;cursor:pointer}.note{font-size:9px;text-align:center;margin-top:10px}</style></head><body><main class="card"><span class="eyebrow">CONTINUUM · MCP OAUTH</span><h1>Share only what this assistant needs.</h1><p>The client requests these explicit scopes:</p><ul>${requested.map((scope) => `<li>${scope}</li>`).join("")}</ul><form method="post">${fields}<button type="submit">Approve connection</button></form><p class="note">Short-lived access token · PKCE protected · revocable</p></main></body></html>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const challenge = String(form.get("code_challenge") ?? "");
  if (!safeRedirect(redirectUri) || !challenge) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const requestedScopes = String(form.get("scope") ?? "memory:read").split(" ").filter((scope) => supportedScopes.includes(scope as (typeof supportedScopes)[number]));
  const now = Math.floor(Date.now() / 1000);
  const code = issueToken({ sub: "user_maya", clientId: String(form.get("client_id") ?? "mcp-client"), scopes: requestedScopes, type: "code", exp: now + 300, redirectUri, codeChallenge: challenge });
  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  const state = form.get("state");
  if (state) target.searchParams.set("state", String(state));
  return NextResponse.redirect(target, 303);
}
