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

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_HELP = `${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters using letters, numbers, underscores, or hyphens.`;
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters`)
  .max(USERNAME_MAX_LENGTH, `Username must be at most ${USERNAME_MAX_LENGTH} characters`)
  .regex(/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/, "Username must start and end with a letter or number");

/** The canonical demo identity. Shared with the seed command and demo-login route. */
export const DEMO_USERNAME = "demo";
export const DEMO_EMAIL = "demo@continuum.demo";

/** Match both public identifiers for the seeded demo account. */
export function isDemoLoginIdentifier(identifier: string): boolean {
  const normalized = identifier.trim().toLowerCase();
  return normalized === DEMO_USERNAME || normalized === DEMO_EMAIL;
}

/**
 * Keep the seeded demo account compatible with its historical database
 * identifier. Other usernames pass through unchanged.
 */
export function resolveLoginIdentifier(identifier: string): string {
  const normalized = identifier.trim().toLowerCase();
  return normalized === DEMO_USERNAME ? DEMO_EMAIL : normalized;
}
