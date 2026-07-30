import { describe, expect, it } from "vitest";
import { applicationBaseUrl, demoLoginEnabled, environmentStatus, publicRegistrationEnabled } from "../apps/web/lib/env";

const productionMinimum = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://continuum:secret@db.example.com/continuum",
  MCP_JWT_SIGNING_SECRET: "a".repeat(48),
  SESSION_PRIVACY_SALT: "b".repeat(32),
  INTEGRATION_CREDENTIAL_ENCRYPTION_KEY: "c".repeat(64),
  AI_GATEWAY_API_KEY: "gateway-key",
  AI_GATEWAY_ENABLED: "true",
  EMBEDDING_DIMENSIONS: "1536",
};

describe("production environment validation", () => {
  it("accepts an explicit HTTPS application base URL", () => {
    expect(environmentStatus({ ...productionMinimum, APP_BASE_URL: "https://continuum.example" }).ready).toBe(true);
  });

  it("derives the HTTPS base URL for a Vercel preview", () => {
    const env = { ...productionMinimum, VERCEL_URL: "continuum-preview.vercel.app" };
    expect(applicationBaseUrl(env)).toBe("https://continuum-preview.vercel.app");
    expect(environmentStatus(env).ready).toBe(true);
  });

  it("still rejects production without any deployable origin", () => {
    const status = environmentStatus(productionMinimum);
    expect(status.ready).toBe(false);
    expect(status.errors.some((error) => error.startsWith("APP_BASE_URL:"))).toBe(true);
  });

  it("rejects non-PostgreSQL databases and path-based app origins", () => {
    expect(environmentStatus({ ...productionMinimum, DATABASE_URL: "https://db.example.com", APP_BASE_URL: "https://continuum.example" }).ready).toBe(false);
    expect(environmentStatus({ ...productionMinimum, APP_BASE_URL: "https://continuum.example/app" }).ready).toBe(false);
  });

  it("rejects an invalid credential-encryption key", () => {
    expect(environmentStatus({ ...productionMinimum, APP_BASE_URL: "https://continuum.example", INTEGRATION_CREDENTIAL_ENCRYPTION_KEY: "short" }).ready).toBe(false);
  });

  it("keeps public registration open unless the operator closes it", () => {
    expect(publicRegistrationEnabled({ NODE_ENV: "production" })).toBe(true);
    expect(publicRegistrationEnabled({ NODE_ENV: "production", PUBLIC_REGISTRATION_ENABLED: "true" })).toBe(true);
    expect(publicRegistrationEnabled({ NODE_ENV: "production", PUBLIC_REGISTRATION_ENABLED: "false" })).toBe(false);
    expect(publicRegistrationEnabled({ NODE_ENV: "development" })).toBe(true);
  });

  it("accepts the documented demo flag and keeps it disabled by default in production", () => {
    expect(demoLoginEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(demoLoginEnabled({ NODE_ENV: "production", ENABLE_DEMO_LOGIN: "true" })).toBe(true);
    expect(demoLoginEnabled({ NODE_ENV: "production", ENABLE_DEMO_LOGIN: "false", DEMO_LOGIN_ENABLED: "true" })).toBe(false);
  });
});
