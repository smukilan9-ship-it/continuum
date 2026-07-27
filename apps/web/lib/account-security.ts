import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { NeonRepository } from "@continuum/db";
import { applicationBaseUrl } from "./env";
import { authTokenHash, createPasswordCredential, verifyPassword } from "./auth";
import { securityEmail, sendSecurityEmail, type SecurityEmailKind } from "./transactional-email";

const verificationTtlMs = 24 * 60 * 60_000;
const recoveryTtlMs = 30 * 60_000;

function rawToken() {
  return randomBytes(32).toString("base64url");
}

function originFor(request: Request) {
  return applicationBaseUrl() ?? new URL(request.url).origin;
}

async function issue(input: {
  request: Request;
  userId: string;
  email: string;
  displayName?: string;
  purpose: "verify_email" | "reset_password" | "convert_account";
}) {
  const token = rawToken();
  const expiresAt = new Date(Date.now() + (input.purpose === "verify_email" ? verificationTtlMs : recoveryTtlMs));
  await new NeonRepository().createAuthToken({
    id: `auth_token_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
    userId: input.userId,
    purpose: input.purpose,
    tokenHash: authTokenHash(token),
    expiresAt: expiresAt.toISOString(),
  });
  const pathname = input.purpose === "verify_email" ? "/verify-email" : "/reset-password";
  const actionUrl = `${originFor(input.request)}${pathname}?token=${encodeURIComponent(token)}`;
  const message = securityEmail({
    to: input.email,
    displayName: input.displayName,
    kind: input.purpose,
    actionUrl,
  });
  const delivery = await sendSecurityEmail(message);
  return { expiresAt: expiresAt.toISOString(), delivery };
}

export async function issueVerificationEmail(request: Request, userId: string) {
  const row = await new NeonRepository().findUserForRecovery((await new NeonRepository().getUser(userId))?.email ?? "");
  if (!row) return undefined;
  return issue({
    request,
    userId,
    email: row.user.email,
    displayName: row.profile.displayName,
    purpose: "verify_email",
  });
}

export async function requestRecoveryEmail(request: Request, email: string) {
  const repo = new NeonRepository();
  const row = await repo.findUserForRecovery(email);
  if (!row) return undefined;
  const purpose = row.credential ? "reset_password" : "convert_account";
  return issue({
    request,
    userId: row.user.id,
    email: row.user.email,
    displayName: row.profile.displayName,
    purpose,
  });
}

export async function verifyEmailToken(token: string) {
  const repo = new NeonRepository();
  const consumed = await repo.consumeAuthToken(authTokenHash(token), ["verify_email"]);
  if (!consumed) return false;
  return repo.verifyEmail(consumed.userId);
}

export async function inspectRecoveryToken(token: string) {
  const row = await new NeonRepository().inspectAuthToken(authTokenHash(token), ["reset_password", "convert_account"]);
  if (!row) return { valid: false, state: "invalid" as const };
  if (row.consumedAt) return { valid: false, state: "used" as const };
  if (row.expiresAt <= new Date()) return { valid: false, state: "expired" as const };
  return { valid: true, state: "valid" as const, purpose: row.purpose };
}

export async function resetPassword(token: string, password: string) {
  const repo = new NeonRepository();
  const inspected = await repo.inspectAuthToken(authTokenHash(token), ["reset_password", "convert_account"]);
  if (!inspected || inspected.consumedAt || inspected.expiresAt <= new Date()) return { ok: false as const, state: "invalid" as const };
  const history = await repo.recentPasswordHistory(inspected.userId, 5);
  for (const previous of history) {
    if (await verifyPassword(password, previous.passwordSalt, previous.passwordHash)) {
      return { ok: false as const, state: "reused" as const };
    }
  }
  const consumed = await repo.consumeAuthToken(authTokenHash(token), ["reset_password", "convert_account"]);
  if (!consumed) return { ok: false as const, state: "invalid" as const };
  const credential = await createPasswordCredential(password);
  await repo.replacePassword({ userId: consumed.userId, passwordHash: credential.passwordHash, passwordSalt: credential.salt });
  const user = await repo.getUser(consumed.userId);
  if (user) {
    await sendSecurityEmail(securityEmail({
      to: user.email,
      displayName: user.displayName,
      kind: "password_changed",
    })).catch(() => undefined);
  }
  return { ok: true as const, converted: consumed.purpose === "convert_account" };
}

export async function changePassword(userId: string, currentPassword: string, nextPassword: string, keepSessionId?: string) {
  const repo = new NeonRepository();
  const user = await repo.getUser(userId);
  if (!user) return { ok: false as const, state: "invalid" as const };
  const row = await repo.findUserForLogin(user.email);
  if (!row || !await verifyPassword(currentPassword, row.credential.passwordSalt, row.credential.passwordHash)) {
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
  await sendSecurityEmail(securityEmail({
    to: user.email,
    displayName: user.displayName,
    kind: "password_changed",
  })).catch(() => undefined);
  return { ok: true as const };
}

export function safeRecoveryResponse() {
  return {
    accepted: true,
    message: "If an eligible Continuum account exists, a secure email has been sent.",
  };
}

export type { SecurityEmailKind };
