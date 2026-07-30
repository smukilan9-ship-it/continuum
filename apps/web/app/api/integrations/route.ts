import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NeonRepository } from "@continuum/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { openCredential } from "@/lib/credential-vault";

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

function isoDate(value: Date | string | null | undefined) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "integration-status", Number(process.env.INTEGRATION_STATUS_REQUESTS_PER_MINUTE ?? 30), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Integration status rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "60" } });
  const origin = appOrigin(request);
  const repo = process.env.DATABASE_URL ? new NeonRepository() : undefined;
  const [grants, integrationTokens, activity, zotero] = repo ? await Promise.all([
    repo.listOAuthConnections(user.id),
    repo.listIntegrationTokens(user.id),
    repo.listMcpClientActivity(user.id),
    repo.getIntegration(user.id, "zotero"),
  ]) : [[], [], [], undefined] as const;
  const activityByClient = new Map(activity.map((entry) => [entry.clientId, entry]));
  let zoteroDetails: { username?: string; lastSyncAt?: string } = {};
  try { if (zotero?.encryptedCredentials) { const value = openCredential<{ username?: string; lastSyncAt?: string }>(zotero.encryptedCredentials); zoteroDetails = { username: value.username, lastSyncAt: value.lastSyncAt }; } } catch { /* Surface connected state without exposing a credential error. */ }
  return NextResponse.json({
    mcp: {
      endpoint: `${origin}/mcp`,
      connections: grants.map((connection) => {
        const used = activityByClient.get(connection.clientId);
        return {
          clientId: connection.clientId,
          name: connection.clientName,
          scopes: connection.scopes,
          connectedAt: isoDate(connection.connectedAt),
          lastAuthorizedAt: isoDate(connection.lastAuthorizedAt),
          lastUsedAt: isoDate(used?.lastUsedAt),
          calls: Number(used?.calls ?? 0),
        };
      }),
      claude: { supported: true, instructions: ["In Claude, open Customize → Connectors.", "Choose Add custom connector.", `Paste ${origin}/mcp as the remote MCP URL.`, "Sign in to Continuum, review the requested permissions, then enable the connector for your chat."] },
    },
    zotero: { connected: Boolean(zotero), available: Boolean(process.env.DATABASE_URL), ...zoteroDetails, scopes: zotero?.scopes ?? [] },
    notebooklm: { mode: "source_pack", accountConnectionAvailable: false },
    obsidian: {
      available: Boolean(process.env.DATABASE_URL),
      tokens: integrationTokens.filter((token) => token.provider === "obsidian" && !token.revokedAt).map((token) => ({ ...token, lastUsedAt: isoDate(token.lastUsedAt), expiresAt: isoDate(token.expiresAt), createdAt: isoDate(token.createdAt) })),
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
