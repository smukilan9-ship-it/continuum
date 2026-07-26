import { scopes as supportedScopes } from "@continuum/domain";
import { NextResponse } from "next/server";
import {
  issueToken,
  parseAuthorizationRequest,
  verifyToken,
} from "@/lib/oauth";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { getStore } from "@/lib/store";

const protocolFields = [
  "client_id",
  "redirect_uri",
  "response_type",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
  "resource",
] as const;

function consentPage(request: Request, error?: string) {
  const source = new URL(request.url);
  const target = new URL("/oauth/authorize", source.origin);
  for (const name of protocolFields) {
    const value = source.searchParams.get(name);
    if (value) target.searchParams.set(name, value);
  }
  if (error) target.searchParams.set("oauth_error", error);
  return target;
}

function formProtocolUrl(request: Request, form: FormData) {
  const url = new URL(request.url);
  for (const name of protocolFields) {
    const value = form.get(name);
    if (value) url.searchParams.set(name, String(value));
  }
  return url;
}

function formError(request: Request, form: FormData | undefined, code: string, status = 400) {
  if (form?.get("ux") === "continuum") {
    const source = formProtocolUrl(request, form);
    const target = consentPage(new Request(source), code);
    return NextResponse.redirect(target, 303);
  }
  return NextResponse.json({ error: "invalid_request", error_description: code }, { status });
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) {
    const url = new URL(request.url);
    const target = new URL("/login", url.origin);
    target.searchParams.set("returnTo", `/oauth/authorize${url.search}`);
    return NextResponse.redirect(target);
  }
  const rate = await enforceRateLimit(
    request,
    "oauth-authorize-view",
    Number(process.env.OAUTH_AUTHORIZATIONS_PER_HOUR ?? 60),
    60 * 60_000,
    user.id,
  );
  if (!rate.allowed) return NextResponse.redirect(consentPage(request, "rate_limited"), 303);
  try {
    await parseAuthorizationRequest(new URL(request.url).searchParams, supportedScopes);
  } catch {
    return NextResponse.redirect(consentPage(request, "invalid_request"), 303);
  }
  return NextResponse.redirect(consentPage(request), 307);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id");
  if (!sameOriginWrite(request)) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Cross-origin authorization was rejected" },
      { status: 403 },
    );
  }
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const rate = await enforceRateLimit(
    request,
    "oauth-authorize",
    Number(process.env.OAUTH_AUTHORIZATIONS_PER_HOUR ?? 60),
    60 * 60_000,
    user.id,
  );
  if (!rate.allowed) return formError(request, undefined, "rate_limited", 429);

  const form = await request.formData().catch(() => undefined);
  if (!form) return formError(request, form, "invalid_form");

  let authorization;
  try {
    authorization = await parseAuthorizationRequest(formProtocolUrl(request, form).searchParams, supportedScopes);
  } catch {
    return formError(request, form, "invalid_request");
  }

  try {
    const consent = await verifyToken(String(form.get("consent_token") ?? ""), "consent");
    const consentMatches = consent.sub === user.id
      && consent.clientId === authorization.clientId
      && consent.redirectUri === authorization.redirectUri
      && consent.codeChallenge === authorization.codeChallenge
      && consent.state === authorization.state
      && consent.resource === authorization.resource
      && authorization.requestedScopes.every((scope) => consent.scopes.includes(scope));
    if (!consentMatches) return formError(request, form, "invalid_state");
    await getStore(user.id).consumeOAuthGrant(consent.jti, "consent");

    if (form.get("decision") === "deny") {
      const target = new URL(authorization.redirectUri);
      target.searchParams.set("error", "access_denied");
      target.searchParams.set("state", authorization.state);
      console.info(JSON.stringify({ level: "info", message: "oauth_authorization_denied", requestId, client: authorization.client.clientName, redirectHost: target.host, ms: Date.now() - startedAt }));
      return NextResponse.redirect(target, 303);
    }
    if (form.get("decision") !== "approve") return formError(request, form, "invalid_decision");

    const selectedScopes = form.getAll("scope")
      .map(String)
      .filter((scope) => consent.scopes.includes(scope) && authorization.client.scopes.includes(scope));
    const now = Math.floor(Date.now() / 1000);
    const code = await issueToken({
      sub: user.id,
      clientId: authorization.clientId,
      scopes: selectedScopes,
      type: "code",
      exp: now + 300,
      redirectUri: authorization.redirectUri,
      codeChallenge: authorization.codeChallenge,
      resource: authorization.resource,
    });
    const target = new URL(authorization.redirectUri);
    target.searchParams.set("code", code);
    target.searchParams.set("state", authorization.state);
    console.info(JSON.stringify({ level: "info", message: "oauth_authorization_code_issued", requestId, client: authorization.client.clientName, redirectHost: target.host, ms: Date.now() - startedAt }));
    return NextResponse.redirect(target, 303);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", message: "oauth_authorization_failed", requestId, error: error instanceof Error ? error.message : "Unknown authorization failure", ms: Date.now() - startedAt }));
    return formError(request, form, "authorization_failed");
  }
}
