import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const security = read("apps/web/lib/account-security.ts");
const passwordRoute = read("apps/web/app/api/auth/password/route.ts");
const verificationRoute = read("apps/web/app/api/auth/verification/route.ts");
const loginForm = read("apps/web/components/login-form.tsx");
const accountScreen = read("apps/web/components/workspace/account-screen.tsx");
const recoveryForms = read("apps/web/components/recovery-forms.tsx");

/** The body of one exported function, bounded so it cannot bleed into the next. */
function functionBody(source: string, name: string) {
  const start = source.indexOf(`export async function ${name}`);
  if (start < 0) throw new Error(`${name} not found`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

describe("account recovery exists", () => {
  it("ships the three routes that were advertised but never built", () => {
    for (const page of ["apps/web/app/forgot-password/page.tsx", "apps/web/app/reset-password/page.tsx", "apps/web/app/verify-email/page.tsx"]) {
      expect(read(page).length).toBeGreaterThan(0);
    }
  });

  it("no longer tells the user recovery is unavailable", () => {
    for (const source of [loginForm, accountScreen, recoveryForms]) {
      expect(source).not.toMatch(/not available yet/i);
      expect(source).not.toMatch(/Keep your password somewhere safe/i);
    }
  });

  it("offers a forgot-password link from sign-in", () => {
    expect(loginForm).toMatch(/\/forgot-password/);
    expect(loginForm).toMatch(/Forgot password\?/);
  });
});

describe("reset tokens are safe by construction", () => {
  it("stores only a hash, never the token itself", () => {
    expect(security).toMatch(/createHash\("sha256"\)/);
    expect(security).toMatch(/tokenHash: hashToken\(token\)/);
  });

  it("uses a cryptographically random token", () => {
    expect(security).toMatch(/randomBytes\(32\)/);
  });

  it("expires reset links in 30 minutes and verification in 24 hours", () => {
    expect(security).toMatch(/RESET_TTL_MS = 30 \* 60_000/);
    expect(security).toMatch(/VERIFICATION_TTL_MS = 24 \* 60 \* 60_000/);
  });

  it("consumes the token when completing a reset, so a link cannot be replayed", () => {
    expect(security).toMatch(/consumeAuthToken\(hashToken\(token\), \[PASSWORD_RESET_PURPOSE\]\)/);
  });

  it("checks password history so a reset cannot reinstate a recent password", () => {
    expect(security).toMatch(/recentPasswordHistory/);
  });

  it("inspects without consuming, so opening the page does not burn the link", () => {
    const inspect = functionBody(security, "inspectPasswordReset");
    expect(inspect).toMatch(/inspectAuthToken/);
    expect(inspect).not.toMatch(/consumeAuthToken/);
  });
});

describe("the request endpoint cannot be used to enumerate accounts", () => {
  const requestBranch = passwordRoute.slice(
    passwordRoute.indexOf('=== "request_reset"'),
    passwordRoute.indexOf('=== "perform_reset"'),
  );

  it("returns the same acknowledgement whatever happened", () => {
    // One unconditional response for the whole branch: unknown user, throttled
    // request, and successful issue all resolve to `{ requested: true }`.
    expect(requestBranch).toMatch(/return NextResponse\.json\(\{ requested: true \}\)/);
    expect(requestBranch.match(/return NextResponse\.json\(\{ requested: true \}\)/g)).toHaveLength(1);
  });

  it("never reveals whether the account existed", () => {
    expect(requestBranch).not.toMatch(/not found/i);
    expect(requestBranch).not.toMatch(/no such (user|account)/i);
    expect(requestBranch).not.toMatch(/status: 404/);
  });

  it("does not return a throttling error that a missing account would not produce", () => {
    expect(requestBranch).not.toMatch(/status: 429/);
  });

  it("never returns the token to the browser", () => {
    expect(requestBranch).not.toMatch(/token:/);
    expect(passwordRoute).not.toMatch(/json\(\{[^}]*token[^}]*\}\)/);
  });

  it("swallows lookup failures rather than surfacing them", () => {
    expect(requestBranch).toMatch(/\.catch\(/);
  });
});

describe("recovery endpoints are rate limited", () => {
  it("limits reset requests, reset attempts, and verification separately", () => {
    expect(passwordRoute).toMatch(/"password-reset-request", 5/);
    expect(passwordRoute).toMatch(/"password-reset-perform", 10/);
    expect(verificationRoute).toMatch(/"email-verify-confirm", 10/);
    expect(verificationRoute).toMatch(/"email-verify-send", 3/);
  });

  it("rejects cross-origin writes on both routes", () => {
    expect(passwordRoute).toMatch(/sameOriginWrite/);
    expect(verificationRoute).toMatch(/sameOriginWrite/);
  });

  it("requires a signed-in user before sending a verification link", () => {
    const send = verificationRoute.slice(verificationRoute.indexOf("const user = await getRequestUser"));
    expect(send).toMatch(/if \(!user\) return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\)/);
  });
});

describe("reset consequences are stated and enforced", () => {
  it("revokes other sessions on a completed reset", () => {
    // replacePassword without keepSessionId revokes every session for the user.
    const complete = functionBody(security, "completePasswordReset");
    expect(complete).toMatch(/replacePassword\(\{ userId: consumed\.userId/);
    // changePassword keeps the current session alive on purpose; a reset must
    // not, because the account may be compromised.
    expect(complete).not.toMatch(/keepSessionId/);
  });

  it("tells the user that is what happened", () => {
    expect(recoveryForms).toMatch(/every other session was signed out/i);
  });
});
