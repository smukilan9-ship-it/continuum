import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
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

export function validMcpResource(value: string | null | undefined) {
  return !value || value === mcpResource() || value === `${issuer()}/api/mcp`;
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

export function issueClientRegistration(input: Omit<OAuthClientRegistration, "iat">) {
  const encoded = encode(JSON.stringify({ ...input, iat: Math.floor(Date.now() / 1000) } satisfies OAuthClientRegistration));
  const signed = `client.${encoded}`;
  return `${signed}.${signature(signed)}`;
}

export function verifyClientRegistration(clientId: string): OAuthClientRegistration {
  if (clientId.length > 16_384) throw new Error("Unknown OAuth client");
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

export function parseAuthorizationRequest(params: URLSearchParams, supportedScopes: readonly string[]): AuthorizationRequest {
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const client = verifyClientRegistration(clientId);
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
    || !validMcpResource(resource)
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
  return issueToken({
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

export async function issueToken(payload: Omit<TokenPayload, "iat" | "jti" | "iss" | "aud" | "resource"> & { resource?: string }) {
  const resource = payload.resource && validMcpResource(payload.resource) ? payload.resource : mcpResource();
  const full: TokenPayload = { ...payload, resource, iss: issuer(), aud: resource, iat: Math.floor(Date.now() / 1000), jti: randomUUID() };
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

export async function verifyToken(token: string, expectedType?: TokenPayload["type"]): Promise<TokenPayload> {
  if (token.length > 16_384) throw new Error("Malformed token");
  const [encoded, provided] = token.split(".");
  if (!encoded || !provided) throw new Error("Malformed token");
  const expected = signature(encoded);
  if (!signaturesMatch(provided, expected)) throw new Error("Invalid token signature");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
  const legacyAudience = payload.aud === "continuum-mcp" && !payload.resource;
  if (legacyAudience) payload.resource = mcpResource();
  else if (payload.iss !== issuer() || payload.aud !== payload.resource || !validMcpResource(payload.resource)) throw new Error("Token issuer, audience, or resource is invalid");
  if (payload.iss !== issuer()) throw new Error("Token issuer is invalid");
  if (payload.exp <= Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  if (await getStore(payload.sub).oauthGrantUnavailable(payload.jti)) throw new Error("Token revoked or already used");
  if (expectedType && payload.type !== expectedType) throw new Error("Unexpected token type");
  return payload;
}

export async function revokeToken(token: string) {
  const payload = await verifyToken(token);
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
    const payload = await verifyToken(token, "access");
    return { userId: payload.sub, clientId: payload.clientId, scopes: payload.scopes, tokenId: payload.jti, authentication: "oauth" };
  } catch { return undefined; }
}

export async function authorizedScopes(request: Request) {
  return (await authorizedMcpIdentity(request))?.scopes;
}
