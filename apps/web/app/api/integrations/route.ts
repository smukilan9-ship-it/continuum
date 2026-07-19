import { createHash, randomBytes, randomUUID } from "node:crypto";
import { configuredProviders, embeddingProviderStatus, featherlessStatus, groqStatus } from "@continuum/ai";
import { NeonRepository } from "@continuum/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { verifyClientRegistration } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_obsidian_token"), name: z.string().min(1).max(80).default("My Obsidian vault") }),
  z.object({ action: z.literal("revoke_integration_token"), tokenId: z.string().min(3) }),
  z.object({ action: z.literal("revoke_mcp_client"), clientId: z.string().min(3) }),
]);

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function appOrigin(request: Request) {
  return process.env.APP_BASE_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "integration-status", Number(process.env.INTEGRATION_STATUS_REQUESTS_PER_MINUTE ?? 30), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Integration status rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "60" } });
  const origin = appOrigin(request);
  const [featherless, groq, persistent] = await Promise.all([
    featherlessStatus(),
    groqStatus(),
    process.env.DATABASE_URL ? Promise.all([new NeonRepository().listOAuthConnections(user.id), new NeonRepository().listIntegrationTokens(user.id)]) : Promise.resolve([[], []] as const),
  ]);
  const [grants, integrationTokens] = persistent;
  const grouped = new Map<string, { clientId: string; name: string; scopes: Set<string>; expiresAt: Date; connectedAt: Date }>();
  for (const grant of grants) {
    const current = grouped.get(grant.clientId);
    let name = "MCP client";
    try { name = verifyClientRegistration(grant.clientId).clientName; } catch { /* Older registrations remain revocable. */ }
    if (current) {
      grant.scopes.forEach((scope) => current.scopes.add(scope));
      if (grant.expiresAt > current.expiresAt) current.expiresAt = grant.expiresAt;
    } else grouped.set(grant.clientId, { clientId: grant.clientId, name, scopes: new Set(grant.scopes), expiresAt: grant.expiresAt, connectedAt: grant.createdAt });
  }
  return NextResponse.json({
    mcp: {
      endpoint: `${origin}/api/mcp`,
      oauthMetadata: `${origin}/.well-known/oauth-authorization-server`,
      status: process.env.DATABASE_URL && process.env.MCP_JWT_SIGNING_SECRET ? "ready" : process.env.NODE_ENV === "production" ? "misconfigured" : "development",
      connections: [...grouped.values()].map((connection) => ({ ...connection, scopes: [...connection.scopes], expiresAt: connection.expiresAt.toISOString(), connectedAt: connection.connectedAt.toISOString() })),
      claude: { supported: true, instructions: ["Open Customize → Connectors in Claude.", "Choose Add custom connector.", `Enter ${origin}/api/mcp and complete Continuum OAuth.`, "Enable Continuum for the conversation and review granted scopes."] },
      chatgpt: { supported: false, status: "future_scope" },
    },
    providers: { ...configuredProviders(), embeddings: embeddingProviderStatus(), featherless, groqStatus: groq },
    obsidian: {
      available: Boolean(process.env.DATABASE_URL),
      tokens: integrationTokens.filter((token) => token.provider === "obsidian" && !token.revokedAt).map((token) => ({ ...token, lastUsedAt: token.lastUsedAt?.toISOString(), expiresAt: token.expiresAt?.toISOString(), createdAt: token.createdAt.toISOString() })),
    },
  }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin integration writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "integration-write", Number(process.env.INTEGRATION_WRITES_PER_HOUR ?? 20), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Integration change rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "3600" } });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Persistent integrations require DATABASE_URL" }, { status: 503 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid integration action", issues: parsed.error.issues }, { status: 400 });
  const repo = new NeonRepository();
  if (parsed.data.action === "create_obsidian_token") {
    const token = `ctm_obs_${randomBytes(32).toString("base64url")}`;
    const id = `integration_token_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const expiresAt = new Date(Date.now() + 180 * 24 * 3600_000).toISOString();
    await repo.createIntegrationToken({ id, userId: user.id, provider: "obsidian", name: parsed.data.name, tokenHash: hash(token), scopes: ["documents:read", "documents:write", "memory:write"], expiresAt });
    return NextResponse.json({ id, token, expiresAt, warning: "Copy this token now. Continuum stores only its SHA-256 hash and cannot show it again." }, { status: 201, headers: { "cache-control": "no-store" } });
  }
  if (parsed.data.action === "revoke_integration_token") return NextResponse.json({ revoked: await repo.revokeIntegrationToken(parsed.data.tokenId, user.id) });
  return NextResponse.json({ revokedGrants: await repo.revokeOAuthClient(user.id, parsed.data.clientId) });
}
