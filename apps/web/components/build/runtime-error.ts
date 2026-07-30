/**
 * Pure error-presentation helpers for the console (redesign.md §14.3).
 *
 * These moved here from `code-screen.tsx` unchanged — §14.3 requires the error
 * lead, the "Go to line n" affordance, and the bundle-URL-stripped traceback to
 * be retained verbatim. `code-screen.tsx` re-exports both so the existing
 * `tests/code-screen-helpers.test.ts` import path keeps resolving.
 */

/**
 * Strips the JS stack a browser runtime appends to SQLite errors.
 *
 * The Errors pane showed `near "while": syntax error at a.handleError
 * (https://…/_next/static/chunks/6796.js)` — a minified bundle URL is
 * meaningless to a learner. The full text still reaches Technical details.
 */
export function cleanRuntimeMessage(message: string) {
  return message
    .split("\n")
    .map((line) => line.replace(/\s+at\s+\S+\s*\(?https?:\/\/\S+\)?/g, "").replace(/\s+at\s+\S+\s+\(?[^\s)]+:\d+:\d+\)?/g, "").trimEnd())
    .filter((line) => line.trim() && !/^\s*at\s/.test(line))
    .join("\n")
    .trim();
}

/**
 * Best-effort line number from a runtime error, for the "Go to line" affordance.
 * Python tracebacks were already handled; JS/TS and SQLite are added here.
 */
export function errorLineFrom(language: string, message: string, source: string) {
  const python = message.match(/File "[^"]*", line (\d+)/);
  if (python) return Number(python[1]);
  const generic = message.match(/(?:^|\s)(?:at\s)?[^\s:]+:(\d+):\d+/);
  if (generic) return Number(generic[1]);
  const lineWord = message.match(/\bline\s+(\d+)/i);
  if (lineWord) return Number(lineWord[1]);
  if (language === "sql") {
    // SQLite reports the offending token, not a position. Find the statement
    // that contains it so "Go to line" still lands somewhere useful.
    const token = message.match(/near "([^"]+)"/)?.[1];
    if (token) {
      const index = source.split("\n").findIndex((line) => line.includes(token));
      if (index >= 0) return index + 1;
    }
  }
  return 0;
}
