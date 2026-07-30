import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NeonRepository } from "@continuum/db";
import { createPasswordCredential, verifyPassword, verifyUserPassword } from "./auth";

export const PASSWORD_RESET_PURPOSE = "password_reset";
export const EMAIL_VERIFICATION_PURPOSE = "email_verification";

/** Reset links are short-lived: long enough to switch to an inbox, no longer. */
const RESET_TTL_MS = 30 * 60_000;
const VERIFICATION_TTL_MS = 24 * 60 * 60_000;

/** Only the hash is stored, so a database read cannot reconstruct a live link. */
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newToken() {
  return randomBytes(32).toString("base64url");
}

/**
 * Issues a single-use reset token.
 *
 * Always resolves, whether or not the account exists — the caller renders the
 * same panel either way, so the response cannot be used to test which usernames
 * are registered. `createAuthToken` consumes any earlier unconsumed token for
 * the same purpose, so requesting a second link invalidates the first.
 */
export async function issuePasswordReset(username: string) {
  const repo = new NeonRepository();
  // Accounts are keyed by username, which is stored as the users.email column.
  const found = await repo.findUserForRecovery(username.trim().toLowerCase()).catch(() => undefined);
  if (!found?.user) return { issued: false as const };

  const token = newToken();
  await repo.createAuthToken({
    id: `token_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
    userId: found.user.id,
    purpose: PASSWORD_RESET_PURPOSE,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
    metadata: { requestedAt: new Date().toISOString() },
  });
  return { issued: true as const, token, userId: found.user.id };
}

/**
 * Consumes a reset token and replaces the password.
 *
 * Every other session is revoked, because a reset is the one moment where the
 * account may have been compromised. The token is consumed inside the same
 * transaction that reads it, so a replayed link fails.
 */
export async function completePasswordReset(token: string, nextPassword: string) {
  const repo = new NeonRepository();
  const consumed = await repo.consumeAuthToken(hashToken(token), [PASSWORD_RESET_PURPOSE]);
  if (!consumed) return { ok: false as const, state: "invalid" as const };

  const history = await repo.recentPasswordHistory(consumed.userId, 5);
  for (const previous of history) {
    if (await verifyPassword(nextPassword, previous.passwordSalt, previous.passwordHash)) {
      return { ok: false as const, state: "reused" as const };
    }
  }

  const credential = await createPasswordCredential(nextPassword);
  await repo.replacePassword({ userId: consumed.userId, passwordHash: credential.passwordHash, passwordSalt: credential.salt });
  return { ok: true as const, userId: consumed.userId };
}

/** Reports whether a reset link is still usable, without consuming it. */
export async function inspectPasswordReset(token: string) {
  const repo = new NeonRepository();
  const found = await repo.inspectAuthToken(hashToken(token), [PASSWORD_RESET_PURPOSE]).catch(() => undefined);
  if (!found) return { usable: false as const };
  if (found.consumedAt) return { usable: false as const };
  if (found.expiresAt.getTime() <= Date.now()) return { usable: false as const };
  return { usable: true as const };
}

export async function issueEmailVerification(userId: string) {
  const repo = new NeonRepository();
  const token = newToken();
  await repo.createAuthToken({
    id: `token_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
    userId,
    purpose: EMAIL_VERIFICATION_PURPOSE,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS).toISOString(),
  });
  return { token };
}

export async function completeEmailVerification(token: string) {
  const repo = new NeonRepository();
  const consumed = await repo.consumeAuthToken(hashToken(token), [EMAIL_VERIFICATION_PURPOSE]);
  if (!consumed) return { ok: false as const };
  await repo.verifyEmail(consumed.userId);
  return { ok: true as const, userId: consumed.userId };
}

export async function changePassword(userId: string, currentPassword: string, nextPassword: string, keepSessionId?: string) {
  const repo = new NeonRepository();
  const user = await repo.getUser(userId);
  if (!user) return { ok: false as const, state: "invalid" as const };
  if (!await verifyUserPassword(userId, currentPassword)) {
    return { ok: false as const, state: "invalid" as const };
  }
  const history = await repo.recentPasswordHistory(userId, 5);
  for (const previous of history) {
    if (await verifyPassword(nextPassword, previous.passwordSalt, previous.passwordHash)) {
      return { ok: false as const, state: "reused" as const };
    }
  }
  const credential = await createPasswordCredential(nextPassword);
  await repo.replacePassword({ userId, passwordHash: credential.passwordHash, passwordSalt: credential.salt, keepSessionId });
  return { ok: true as const };
}
