import "server-only";

import { NeonRepository } from "@continuum/db";
import { createPasswordCredential, verifyPassword, verifyUserPassword } from "./auth";

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
