import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

type TokenPayload = {
  sub: string;
  clientId: string;
  scopes: string[];
  exp: number;
  iat: number;
  type: "access" | "refresh" | "code";
  redirectUri?: string;
  codeChallenge?: string;
  jti: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __continuumRevokedTokens: Set<string> | undefined;
}
const revokedTokens = globalThis.__continuumRevokedTokens ?? new Set<string>();
if (process.env.NODE_ENV !== "production") globalThis.__continuumRevokedTokens = revokedTokens;

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

export function issueToken(payload: Omit<TokenPayload, "iat" | "jti">) {
  const full: TokenPayload = { ...payload, iat: Math.floor(Date.now() / 1000), jti: randomUUID() };
  const encoded = encode(JSON.stringify(full));
  return `${encoded}.${signature(encoded)}`;
}

export function verifyToken(token: string, expectedType?: TokenPayload["type"]): TokenPayload {
  const [encoded, provided] = token.split(".");
  if (!encoded || !provided) throw new Error("Malformed token");
  const expected = signature(encoded);
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error("Invalid token signature");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
  if (payload.exp <= Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  if (revokedTokens.has(payload.jti)) throw new Error("Token revoked");
  if (expectedType && payload.type !== expectedType) throw new Error("Unexpected token type");
  return payload;
}

export function revokeToken(token: string) {
  const payload = verifyToken(token);
  revokedTokens.add(payload.jti);
}

export function verifyPkce(verifier: string, challenge: string) {
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const left = Buffer.from(computed);
  const right = Buffer.from(challenge);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function authorizedScopes(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return undefined;
  const demoEnabled = (process.env.FEATURE_FLAGS ?? "demo_token").split(",").includes("demo_token");
  const demoToken = process.env.MCP_DEMO_TOKEN ?? (process.env.NODE_ENV !== "production" ? "continuum-demo-2026" : undefined);
  if (demoEnabled && demoToken && token === demoToken) return [
    "memory:read", "memory:write", "goals:read", "goals:write", "learning:read", "learning:write",
    "research:read", "research:write", "schedule:read", "schedule:propose", "schedule:commit", "resources:read", "routing:invoke",
  ];
  try { return verifyToken(token, "access").scopes; } catch { return undefined; }
}
