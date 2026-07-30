import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { NeonRepository } from "@continuum/db";
import { getStore } from "@/lib/store";

type TokenPayload = {
  iss: string;
  aud: string;
  resource: string;
  sub: string;
  clientId: string;
  scopes: string[];
  exp: number;
  iat: number;
  type: "access" | "refresh" | "code" | "consent";
  redirectUri?: string;
  codeChallenge?: string;
  state?: string;
  jti: string;
};

function issuer() {
  const value = process.env.MCP_OAUTH_ISSUER_URL ?? process.env.APP_BASE_URL;
  if (!value && process.env.NODE_ENV === "production") throw new Error("MCP OAuth issuer is required in production");
  return (value ?? "http://localhost:3000").replace(/\/$/, "");
}

export function mcpResource() {
  return `${issuer()}/mcp`;
}

/**
 * RFC 8707 resource indicators, checked against every address this deployment
 * actually answers on.
 *
 * It used to compare only against `APP_BASE_URL`, while
 * `/.well-known/oauth-protected-resource/mcp` advertises the *serving* origin.
 * On any deployment where the two differ — every preview, and production
 * whenever `APP_BASE_URL` is an alias — a client that followed discovery
 * correctly, which is exactly what Claude does, had its authorization request
 * rejected with `invalid_request`. Found by the §12.6 procedure against a
 * preview build; it would have failed identically for a real user.
 */
export function validMcpResource(value: string | null | undefined, requestUrl?: string) {
  if (!value) return true;
  const origins = [issuer()];
  if (requestUrl) {
    try { origins.push(new URL(requestUrl).origin); } catch { /* Ignore an unparseable request URL. */ }
  }
  return origins.some((origin) => value === `${origin}/mcp` || value === `${origin}/api/mcp`);
}

export type OAuthClientRegistration = {
  clientName: string;
  redirectUris: string[];
  scopes: string[];
  grantTypes: Array<"authorization_code" | "refresh_token">;
  iat: number;
};

export type AuthorizedMcpIdentity = {
  userId: string;
  clientId: string;
  scopes: string[];
  tokenId: string;
  authentication: "oauth" | "development_token";
};

function secret() {
  if (process.env.MCP_JWT_SIGNING_SECRET) return process.env.MCP_JWT_SIGNING_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("MCP_JWT_SIGNING_SECRET is required in production");
  return "continuum-local-development-secret-change-me";
}

function encode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function signature(encodedPayload: string) {
  return createHmac("sha256", secret()).update(encodedPayload).digest("base64url");
}

function signaturesMatch(provided: string, expected: string) {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function safeOAuthRedirect(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch { return false; }
}

function issueSignedClientRegistration(input: Omit<OAuthClientRegistration, "iat">) {
  const encoded = encode(JSON.stringify({ ...input, iat: Math.floor(Date.now() / 1000) } satisfies OAuthClientRegistration));
  const signed = `client.${encoded}`;
  return `${signed}.${signature(signed)}`;
}

export async function issueClientRegistration(input: Omit<OAuthClientRegistration, "iat">) {
  if (process.env.DATABASE_URL) {
    const clientId = `mcp_client_${randomBytes(18).toString("base64url")}`;
    await new NeonRepository().registerOAuthClient({
      id: clientId,
      name: input.clientName,
      redirectUris: input.redirectUris,
      scopes: input.scopes,
    });
    return clientId;
  }
  return issueSignedClientRegistration(input);
}

export async function verifyClientRegistration(clientId: string): Promise<OAuthClientRegistration> {
  if (clientId.length > 16_384) throw new Error("Unknown OAuth client");
  if (clientId.startsWith("mcp_client_") && process.env.DATABASE_URL) {
    const client = await new NeonRepository().getOAuthClient(clientId);
    if (!client || client.redirectUris.some((uri) => !safeOAuthRedirect(uri))) throw new Error("Unknown OAuth client");
    return {
      clientName: client.name,
      redirectUris: client.redirectUris,
      scopes: client.scopes,
      grantTypes: ["authorization_code", "refresh_token"],
      iat: Math.floor(client.createdAt.getTime() / 1000),
    };
  }
  const [prefix, encoded, provided] = clientId.split(".");
  if (prefix !== "client" || !encoded || !provided || !signaturesMatch(provided, signature(`client.${encoded}`))) throw new Error("Unknown OAuth client");
  const registration = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthClientRegistration;
  if (!registration.clientName || !Array.isArray(registration.redirectUris) || !registration.redirectUris.length || registration.redirectUris.some((uri) => !safeOAuthRedirect(uri))) throw new Error("Invalid OAuth client registration");
  return registration;
}

export type AuthorizationRequest = {
  clientId: string;
  client: OAuthClientRegistration;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  resource: string;
  requestedScopes: string[];
};

export async function parseAuthorizationRequest(params: URLSearchParams, supportedScopes: readonly string[], requestUrl?: string): Promise<AuthorizationRequest> {
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const client = await verifyClientRegistration(clientId);
  if (!safeOAuthRedirect(redirectUri) || !client.redirectUris.includes(redirectUri)) {
    throw new Error("The callback address does not match this client registration");
  }
  const codeChallenge = params.get("code_challenge") ?? "";
  const state = params.get("state") ?? "";
  const resource = params.get("resource") ?? mcpResource();
  if (
    params.get("response_type") !== "code"
    || params.get("code_challenge_method") !== "S256"
    || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)
    || !state
    || state.length > 512
    || !validMcpResource(resource, requestUrl)
  ) {
    throw new Error("This authorization request is missing valid state, PKCE, or resource information");
  }
  const allowed = new Set(supportedScopes);
  const requestedScopes = (params.get("scope") ?? "memory:read goals:read learning:read research:read schedule:read")
    .split(" ")
    .filter((scope) => allowed.has(scope) && client.scopes.includes(scope));
  return { clientId, client, redirectUri, state, codeChallenge, resource, requestedScopes };
}

export async function issueOAuthConsent(userId: string, request: AuthorizationRequest) {
  // `request.resource` was already validated against the serving origin when
  // the authorization request was parsed, so it is trusted here rather than
  // re-checked against the configured issuer alone.
  return issueToken({
    trustedResource: true,
    sub: userId,
    clientId: request.clientId,
    scopes: request.requestedScopes,
    type: "consent",
    exp: Math.floor(Date.now() / 1000) + 10 * 60,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    state: request.state,
    resource: request.resource,
  });
}

/**
 * `trustedResource` marks a resource the caller has already validated against
 * the origin this deployment is being served on. Without it, a preview build
 * silently rewrote the requested resource to `{APP_BASE_URL}/mcp`, and the
 * consent token then disagreed with the form it was issued for — which the POST
 * handler correctly rejected as an expired approval.
 */
export async function issueToken(payload: Omit<TokenPayload, "iat" | "jti" | "iss" | "aud" | "resource"> & { resource?: string; trustedResource?: boolean }) {
  const { trustedResource, ...rest } = payload;
  const resource = payload.resource && (trustedResource || validMcpResource(payload.resource)) ? payload.resource : mcpResource();
  const full: TokenPayload = { ...rest, resource, iss: issuer(), aud: resource, iat: Math.floor(Date.now() / 1000), jti: randomUUID() };
  const encoded = encode(JSON.stringify(full));
  await getStore(full.sub).registerOAuthGrant({
    jti: full.jti,
    userId: full.sub,
    clientId: full.clientId,
    kind: full.type,
    scopes: full.scopes,
    expiresAt: new Date(full.exp * 1000).toISOString(),
  });
  return `${encoded}.${signature(encoded)}`;
}

export async function verifyToken(token: string, expectedType?: TokenPayload["type"], requestUrl?: string): Promise<TokenPayload> {
  if (token.length > 16_384) throw new Error("Malformed token");
  const [encoded, provided] = token.split(".");
  if (!encoded || !provided) throw new Error("Malformed token");
  const expected = signature(encoded);
  if (!signaturesMatch(provided, expected)) throw new Error("Invalid token signature");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
  const legacyAudience = payload.aud === "continuum-mcp" && !payload.resource;
  if (legacyAudience) payload.resource = mcpResource();
  else if (payload.iss !== issuer() || payload.aud !== payload.resource || !validMcpResource(payload.resource, requestUrl)) throw new Error("Token issuer, audience, or resource is invalid");
  if (payload.iss !== issuer()) throw new Error("Token issuer is invalid");
  if (payload.exp <= Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  if (await getStore(payload.sub).oauthGrantUnavailable(payload.jti)) throw new Error("Token revoked or already used");
  if (expectedType && payload.type !== expectedType) throw new Error("Unexpected token type");
  return payload;
}

export async function revokeToken(token: string, requestUrl?: string) {
  const payload = await verifyToken(token, undefined, requestUrl);
  await getStore(payload.sub).revokeOAuthGrant(payload.jti);
}

export function verifyPkce(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier) || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const left = Buffer.from(computed);
  const right = Buffer.from(challenge);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function authorizedMcpIdentity(request: Request): Promise<AuthorizedMcpIdentity | undefined> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return undefined;
  const demoEnabled = process.env.NODE_ENV !== "production";
  const demoToken = process.env.MCP_DEMO_TOKEN ?? (process.env.NODE_ENV !== "production" ? "continuum-demo-2026" : undefined);
  if (demoEnabled && demoToken && signaturesMatch(createHash("sha256").update(token).digest("hex"), createHash("sha256").update(demoToken).digest("hex"))) {
    return {
      userId: process.env.MCP_DEMO_USER_ID ?? "user_maya",
      clientId: "development-token",
      tokenId: "development-token",
      authentication: "development_token",
      scopes: [
        "memory:read", "memory:write", "goals:read", "goals:write", "learning:read", "learning:write",
        "research:read", "research:write", "schedule:read", "schedule:propose", "schedule:commit", "resources:read", "routing:invoke",
      ],
    };
  }
  try {
    const payload = await verifyToken(token, "access", request.url);
    return { userId: payload.sub, clientId: payload.clientId, scopes: payload.scopes, tokenId: payload.jti, authentication: "oauth" };
  } catch { return undefined; }
}

export async function authorizedScopes(request: Request) {
  return (await authorizedMcpIdentity(request))?.scopes;
}
