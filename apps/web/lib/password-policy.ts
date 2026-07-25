import { z } from "zod";

/**
 * Single source of truth for the account password policy.
 *
 * Production accounts require at least PASSWORD_MIN_LENGTH characters. The one
 * documented exception is the disposable hackathon demo account, which the
 * seeding command (server-side only, behind an explicit flag) may provision
 * with a shorter password. That exception never touches the public
 * registration path, so real accounts can never be created below the minimum.
 */
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 200;
export const PASSWORD_HELP = `At least ${PASSWORD_MIN_LENGTH} characters.`;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH);

/** The canonical demo identity. Shared with the seed command and demo-login route. */
export const DEMO_USERNAME = "demo";
export const DEMO_EMAIL = "demo@continuum.demo";

/** Match both public identifiers for the seeded demo account. */
export function isDemoLoginIdentifier(identifier: string): boolean {
  const normalized = identifier.trim().toLowerCase();
  return normalized === DEMO_USERNAME || normalized === DEMO_EMAIL;
}

/**
 * Accept either an email or the bare demo username on the login form. Anything
 * that is not the demo username is passed through untouched so the normal email
 * path (and its validation) is unchanged.
 */
export function resolveLoginIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase() === DEMO_USERNAME ? DEMO_EMAIL : identifier;
}
