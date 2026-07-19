import { issueToken, safeOAuthRedirect, verifyClientRegistration } from "@/lib/oauth";
import { scopes as supportedScopes } from "@continuum/domain";
import { NextResponse } from "next/server";
import { enforceRateLimit, getRequestUser, safeReturnTo, sameOriginWrite } from "@/lib/auth";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function registeredClient(clientId: string, redirectUri: string) {
  const client = verifyClientRegistration(clientId);
  if (!safeOAuthRedirect(redirectUri) || !client.redirectUris.includes(redirectUri)) throw new Error("Redirect URI was not registered by this OAuth client");
  return client;
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) {
    const url = new URL(request.url);
    const login = new URL("/login", url.origin);
    login.searchParams.set("returnTo", safeReturnTo(`${url.pathname}${url.search}`));
    return NextResponse.redirect(login);
  }
  const rate = await enforceRateLimit(request, "oauth-authorize-view", Number(process.env.OAUTH_AUTHORIZATIONS_PER_HOUR ?? 60), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "slow_down", error_description: "Authorization rate limit exceeded" }, { status: 429, headers: { "retry-after": "3600" } });
  const params = new URL(request.url).searchParams;
  const redirectUri = params.get("redirect_uri") ?? "";
  let client;
  try { client = registeredClient(params.get("client_id") ?? "", redirectUri); } catch (error) {
    return NextResponse.json({ error: "invalid_client", error_description: error instanceof Error ? error.message : "OAuth client validation failed" }, { status: 400 });
  }
  const challenge = params.get("code_challenge") ?? "";
  const state = params.get("state") ?? "";
  if (params.get("response_type") !== "code" || params.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || state.length > 512) {
    return NextResponse.json({ error: "invalid_request", error_description: "A safe redirect URI and PKCE S256 challenge are required" }, { status: 400 });
  }
  const requested = (params.get("scope") ?? "memory:read goals:read learning:read research:read schedule:read").split(" ").filter((scope) => supportedScopes.includes(scope as (typeof supportedScopes)[number]) && client.scopes.includes(scope));
  const fields = ["client_id", "redirect_uri", "state", "code_challenge"].map((name) => `<input type="hidden" name="${name}" value="${escapeHtml(params.get(name) ?? "")}">`).join("");
  const choices = requested.map((scope) => `<label class="scope"><input type="checkbox" name="scope" value="${escapeHtml(scope)}" checked><span><strong>${escapeHtml(scope)}</strong><small>${scope.endsWith(":write") || scope.endsWith(":commit") || scope.endsWith(":propose") || scope.endsWith(":invoke") ? "Can change state or use a provider" : "Read-only access"}</small></span></label>`).join("");
  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorize Continuum</title><style>body{font-family:system-ui;background:#0b2748;color:#14283d;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px}.card{width:min(480px,calc(100vw - 40px));background:#fff;padding:30px;border-radius:14px}.eyebrow{font-size:11px;letter-spacing:1.3px;color:#25679f;font-weight:800}h1{font-weight:750;font-size:30px;line-height:1.15;margin:9px 0}p{font-size:14px;line-height:1.55;color:#60758a}.scopes{display:grid;gap:7px;background:#edf5fc;padding:12px;border-radius:8px;max-height:290px;overflow:auto}.scope{display:flex;align-items:center;gap:10px;background:#fff;padding:10px;border:1px solid #d7e4ef;border-radius:7px}.scope input{width:17px;height:17px}.scope span{display:flex;flex-direction:column;gap:2px}.scope strong{font-size:13px}.scope small{font-size:11px;color:#60758a}.actions{display:grid;grid-template-columns:1fr 2fr;gap:8px;margin-top:15px}button{height:43px;border:0;border-radius:8px;background:#15548d;color:white;font-weight:700;cursor:pointer}button.deny{background:#edf2f6;color:#52687d}.note{font-size:11px;text-align:center;margin-top:11px}</style></head><body><main class="card"><span class="eyebrow">CONTINUUM · MCP OAUTH</span><h1>Share only what this assistant needs.</h1><p><strong>${escapeHtml(client.clientName)}</strong> will return to <strong>${escapeHtml(new URL(redirectUri).hostname)}</strong> after this decision. Uncheck any permission you do not want to grant.</p><form method="post">${fields}<div class="scopes">${choices || "<p>This client requested no supported scopes.</p>"}</div><div class="actions"><button class="deny" type="submit" name="decision" value="deny">Deny</button><button type="submit" name="decision" value="approve">Approve selected</button></div></form><p class="note">Short-lived access token · PKCE protected · revocable</p></main></body></html>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "invalid_request", error_description: "Cross-origin authorization was rejected" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const rate = await enforceRateLimit(request, "oauth-authorize", Number(process.env.OAUTH_AUTHORIZATIONS_PER_HOUR ?? 60), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "slow_down", error_description: "Authorization rate limit exceeded" }, { status: 429, headers: { "retry-after": "3600" } });
  const form = await request.formData().catch(() => undefined);
  if (!form) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const challenge = String(form.get("code_challenge") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  let client;
  try { client = registeredClient(clientId, redirectUri); } catch (error) {
    return NextResponse.json({ error: "invalid_client", error_description: error instanceof Error ? error.message : "OAuth client validation failed" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || String(form.get("state") ?? "").length > 512) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  if (form.get("decision") === "deny") {
    const target = new URL(redirectUri);
    target.searchParams.set("error", "access_denied");
    const state = form.get("state");
    if (state) target.searchParams.set("state", String(state));
    return NextResponse.redirect(target, 303);
  }
  const requestedScopes = form.getAll("scope").map(String).filter((scope) => supportedScopes.includes(scope as (typeof supportedScopes)[number]) && client.scopes.includes(scope));
  const now = Math.floor(Date.now() / 1000);
  const code = await issueToken({ sub: user.id, clientId, scopes: requestedScopes, type: "code", exp: now + 300, redirectUri, codeChallenge: challenge });
  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  const state = form.get("state");
  if (state) target.searchParams.set("state", String(state));
  return NextResponse.redirect(target, 303);
}
