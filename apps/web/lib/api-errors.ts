/**
 * Guards against internal detail escaping into API response bodies.
 *
 * Most thrown errors in this codebase carry deliberately user-facing copy
 * ("This block conflicts with a protected commitment"), and returning those is
 * good product behaviour. Driver and framework errors do not: a Drizzle failure
 * once returned raw SQL, `$1…$26` placeholders, an internal user id, and 25
 * DOIs straight into a red banner on the OpenAlex screen.
 *
 * `publicErrorMessage` keeps the first kind and replaces the second.
 */

const unsafeSignals = [
  /\bfailed query\b/i,
  /\bselect\s+[\w"*]+.*\bfrom\b/i,
  /\binsert\s+into\b/i,
  /\bupdate\s+\w+\s+set\b/i,
  /\bdelete\s+from\b/i,
  /\bwhere\b.*=\s*\$\d/i,
  /\$\d+\s*,\s*\$\d+/,
  /\bparams:/i,
  /\bat\s+\w+\s*\(https?:\/\//i,
  /\bhttps?:\/\/[^\s]*_next\//i,
  /\b(?:pg|postgres|neon|drizzle|sqlite|ECONNREFUSED|ETIMEDOUT|ENOTFOUND)\b/i,
  /\buser_[a-z0-9]{4,}\b/i,
  /\b(?:relation|column|constraint)\s+"[^"]+"/i,
  /\n\s{2,}at\s/,
  /\bapi_key=/i,
  /\bBearer\s+[\w-]{12,}/i,
];

export function isPublicSafeMessage(message: string) {
  if (!message.trim()) return false;
  // Long or multi-line messages are dumps, not copy written for a person.
  if (message.length > 240 || message.split("\n").length > 3) return false;
  return !unsafeSignals.some((pattern) => pattern.test(message));
}

/**
 * Returns the error's own message when it reads as intentional user-facing copy,
 * and `fallback` otherwise. Always log the original server-side before calling.
 */
export function publicErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  return isPublicSafeMessage(message) ? message : fallback;
}

/** Structured server log for a request failure. Never include secrets. */
export function logRequestFailure(event: string, context: Record<string, unknown>, error: unknown) {
  console.error(event, JSON.stringify({
    ...context,
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  }));
}
