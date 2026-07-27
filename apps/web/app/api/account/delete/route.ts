import { del } from "@vercel/blob";
import { NeonRepository } from "@continuum/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { accountPrivateFiles, deleteAccountData } from "@/lib/account-data";
import { currentSession, enforceRateLimit, getRequestUser, sameOriginWrite, verifyPassword } from "@/lib/auth";
import { prepareObsidianAccountDeletion } from "@/lib/obsidian-sync-engine";
import { securityEmail, sendSecurityEmail } from "@/lib/transactional-email";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  password: z.string().min(1).max(200),
  confirmation: z.literal("DELETE"),
  preserveObsidianNotes: z.boolean(),
});

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin account deletion is not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Password, typed DELETE confirmation, and an Obsidian preservation choice are required." }, { status: 400 });
  const rate = await enforceRateLimit(request, "account-delete", 3, 24 * 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Too many account-deletion attempts" }, { status: 429 });
  const session = await currentSession(request);
  if (!session || Date.now() - session.authenticatedAt.getTime() > 15 * 60_000) {
    return NextResponse.json({ error: "Sign out and sign in again before deleting this account." }, { status: 403 });
  }
  const repo = new NeonRepository();
  const login = await repo.findUserForLogin(user.email);
  if (!login || !await verifyPassword(parsed.data.password, login.credential.passwordSalt, login.credential.passwordHash)) {
    return NextResponse.json({ error: "Password confirmation failed." }, { status: 403 });
  }
  if (!parsed.data.preserveObsidianNotes) {
    const pending = await repo.listIntegrationTokens(user.id);
    const bridgeOnline = pending.some((token) => token.provider === "obsidian" && token.lastUsedAt && Date.now() - token.lastUsedAt.getTime() < 5 * 60_000);
    if (!bridgeOnline) {
      return NextResponse.json({
        error: "The Obsidian bridge must be online to delete local notes. Reconnect it or choose to preserve local notes.",
        code: "obsidian_bridge_required",
      }, { status: 409 });
    }
    const obsidian = await prepareObsidianAccountDeletion(user.id);
    if (obsidian.pending) {
      return NextResponse.json({
        error: `${obsidian.pending} synchronized Obsidian note${obsidian.pending === 1 ? " is" : "s are"} queued for local deletion. Keep the bridge running, then submit deletion again after it acknowledges the queue.`,
        code: "obsidian_deletion_pending",
        pending: obsidian.pending,
        queued: obsidian.queued,
      }, { status: 409 });
    }
  }
  const files = await accountPrivateFiles(user.id);
  if (files.length) {
    try { await del([...new Set(files)]); }
    catch { return NextResponse.json({ error: "Private file cleanup failed. No database records were deleted; retry safely." }, { status: 502 }); }
  }
  const confirmation = securityEmail({ to: user.email, displayName: user.displayName, kind: "account_deleted" });
  await deleteAccountData(user.id);
  await sendSecurityEmail(confirmation).catch(() => undefined);
  return NextResponse.json({
    deleted: true,
    privateFilesDeleted: files.length,
    obsidianNotes: parsed.data.preserveObsidianNotes ? "preserved" : "deleted_and_bridge_acknowledged",
  }, { headers: { "clear-site-data": "\"cache\", \"cookies\", \"storage\"", "cache-control": "no-store" } });
}
