import { randomUUID } from "node:crypto";
import { NeonRepository } from "@continuum/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser, enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { credentialEncryptionVersion, sealCredential } from "@/lib/credential-vault";
import {
  credentialProviderMetadata,
  credentialProviders,
  maskedCredential,
  providerCredentialEnvelope,
  readUserProviderCredential,
  verifyProviderCredential,
} from "@/lib/provider-credentials";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const providerSchema = z.enum(credentialProviders);
const writeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("configure"), provider: providerSchema, secret: z.string().trim().min(8).max(2_000), currentPassword: z.string().min(1).max(200).optional() }),
  z.object({ action: z.literal("test"), provider: providerSchema }),
]);
const deleteSchema = z.object({ provider: providerSchema, currentPassword: z.string().min(1).max(200) });

function httpsSubmission(request: Request) {
  const url = new URL(request.url);
  const forwarded = request.headers.get("x-forwarded-proto");
  return url.protocol === "https:" || forwarded === "https" || (process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
}

async function reauthenticate(user: { id: string; email: string }, password: string | undefined) {
  if (!password) return false;
  const verified = await authenticateUser(user.email, password);
  return verified?.id === user.id;
}

function publicRecord(row: {
  provider: string;
  createdAt: Date;
  updatedAt: Date;
}, metadata: {
  maskedSuffix: string;
  status: string;
  lastValidatedAt: string;
  lastUsedAt?: string;
}, encryptionVersion: number) {
  const provider = providerSchema.parse(row.provider);
  return {
    provider,
    ...credentialProviderMetadata[provider],
    status: metadata.status,
    masked: `•••• ${metadata.maskedSuffix}`,
    encryptionVersion,
    lastValidatedAt: metadata.lastValidatedAt,
    lastUsedAt: metadata.lastUsedAt,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "credential-status", 60, 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Credential status limit reached" }, { status: 429 });
  const configured = process.env.DATABASE_URL
    ? (await Promise.all(credentialProviders.map((provider) => readUserProviderCredential(user.id, provider))))
      .filter((credential): credential is NonNullable<typeof credential> => Boolean(credential))
      .map((credential) => publicRecord(credential.integration, credential.metadata, credential.encryptionVersion))
    : [];
  return NextResponse.json({
    providers: credentialProviders.map((provider) => ({ provider, ...credentialProviderMetadata[provider] })),
    configured,
  }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!httpsSubmission(request)) return NextResponse.json({ error: "Provider credentials require HTTPS" }, { status: 400 });
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin credential writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "credential-write", 20, 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Credential change limit reached" }, { status: 429 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Persistent provider credentials require DATABASE_URL" }, { status: 503 });
  const parsed = writeSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid credential action" }, { status: 400 });

  const repo = new NeonRepository();
  const existing = await repo.getIntegration(user.id, parsed.data.provider);
  if (parsed.data.action === "configure") {
    if (existing && !await reauthenticate(user, parsed.data.currentPassword)) return NextResponse.json({ error: "Enter your current password before replacing this credential" }, { status: 403 });
    const health = await verifyProviderCredential(parsed.data.provider, parsed.data.secret);
    if (health.status === "invalid") return NextResponse.json({ error: "The provider rejected this credential", status: health.status, code: health.code }, { status: 422 });
    if (health.status === "degraded") return NextResponse.json({ error: "The provider could not validate this credential right now", status: health.status, code: health.code }, { status: 503 });
    const sealed = sealCredential(providerCredentialEnvelope(parsed.data.provider, parsed.data.secret, health.status, health.checkedAt));
    const masked = maskedCredential(parsed.data.secret);
    const saved = await repo.upsertIntegration({
      id: existing?.id ?? `integration_credential_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
      userId: user.id,
      provider: parsed.data.provider,
      encryptedCredentials: sealed,
      scopes: ["provider:read"],
    });
    await getStore(user.id).appendEvent({
      type: existing ? "integration.credential.replaced" : "integration.credential.connected",
      summary: `${credentialProviderMetadata[parsed.data.provider].name} credential ${existing ? "replaced" : "connected"} after a live health check.`,
      entityIds: [saved?.id ?? existing?.id ?? parsed.data.provider],
      payload: { provider: parsed.data.provider, status: "connected", encryptionVersion: credentialEncryptionVersion(sealed) },
      source: { surface: "standalone_app" },
      importance: 0.4,
    });
    return NextResponse.json({ provider: parsed.data.provider, status: "connected", masked, lastValidatedAt: health.checkedAt, encryptionVersion: credentialEncryptionVersion(sealed) }, { status: existing ? 200 : 201, headers: { "cache-control": "no-store" } });
  }

  const credential = await readUserProviderCredential(user.id, parsed.data.provider);
  if (!credential) return NextResponse.json({ error: "This provider is not configured" }, { status: 404 });
  const health = await verifyProviderCredential(parsed.data.provider, credential.secret);
  await repo.upsertIntegration({
    id: credential.integration.id,
    userId: user.id,
    provider: parsed.data.provider,
    encryptedCredentials: sealCredential({
      ...credential.metadata,
      status: health.status,
      lastValidatedAt: health.checkedAt,
    }),
    scopes: credential.integration.scopes,
  });
  await getStore(user.id).appendEvent({
    type: "integration.credential.checked",
    summary: `${credentialProviderMetadata[parsed.data.provider].name} credential health checked.`,
    entityIds: [credential.integration.id],
    payload: { provider: parsed.data.provider, status: health.status, code: health.code },
    source: { surface: "standalone_app" },
    importance: 0.2,
  });
  return NextResponse.json({ provider: parsed.data.provider, ...health }, { status: health.status === "invalid" ? 422 : health.status === "degraded" ? 503 : 200, headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!httpsSubmission(request)) return NextResponse.json({ error: "Provider credentials require HTTPS" }, { status: 400 });
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin credential writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Provider and current password are required" }, { status: 400 });
  if (!await reauthenticate(user, parsed.data.currentPassword)) return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
  const repo = new NeonRepository();
  const existing = await repo.getIntegration(user.id, parsed.data.provider);
  if (!existing) return NextResponse.json({ revoked: false }, { status: 404 });
  const revoked = await repo.revokeIntegration(user.id, parsed.data.provider);
  await getStore(user.id).appendEvent({
    type: "integration.credential.revoked",
    summary: `${credentialProviderMetadata[parsed.data.provider].name} credential revoked.`,
    entityIds: [existing.id],
    payload: { provider: parsed.data.provider, status: "revoked" },
    source: { surface: "standalone_app" },
    importance: 0.4,
  });
  return NextResponse.json({ revoked }, { headers: { "cache-control": "no-store" } });
}
