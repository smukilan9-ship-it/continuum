import { describe, expect, it } from "vitest";
import { DEMO_EMAIL, DEMO_USERNAME, PASSWORD_MIN_LENGTH, passwordSchema, resolveLoginIdentifier } from "../apps/web/lib/password-policy";
import { demoAccountPassword, demoLoginEnabled } from "../apps/web/lib/env";

describe("password policy", () => {
  it("requires at least six characters", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(6);
    expect(passwordSchema.safeParse("12345").success).toBe(false);
    expect(passwordSchema.safeParse("123456").success).toBe(true);
    expect(passwordSchema.safeParse("demo123").success).toBe(true);
  });

  it("does not accept the four-character demo password through the public schema", () => {
    // The <6 exception is only available to the server-side seed command, never
    // to registration/login validation.
    expect(passwordSchema.safeParse("demo").success).toBe(false);
  });

  it("caps password length to prevent slow-hash abuse", () => {
    expect(passwordSchema.safeParse("a".repeat(201)).success).toBe(false);
  });
});

describe("demo login resolution", () => {
  it("maps the bare demo username to the demo email, passing everything else through", () => {
    expect(resolveLoginIdentifier(DEMO_USERNAME)).toBe(DEMO_EMAIL);
    expect(resolveLoginIdentifier("DEMO")).toBe(DEMO_EMAIL);
    expect(resolveLoginIdentifier("maya@continuum.demo")).toBe("maya@continuum.demo");
  });
});

describe("demo login flag gating", () => {
  it("is on by default outside production", () => {
    expect(demoLoginEnabled({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("is off in production unless explicitly enabled", () => {
    expect(demoLoginEnabled({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
    expect(demoLoginEnabled({ NODE_ENV: "production", DEMO_LOGIN_ENABLED: "true" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("can be force-disabled everywhere", () => {
    expect(demoLoginEnabled({ NODE_ENV: "development", DEMO_LOGIN_ENABLED: "false" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("defaults the demo password to demo123 and honours an override", () => {
    expect(demoAccountPassword({} as NodeJS.ProcessEnv)).toBe("demo123");
    expect(demoAccountPassword({ DEMO_ACCOUNT_PASSWORD: "demo" } as NodeJS.ProcessEnv)).toBe("demo");
  });
});
