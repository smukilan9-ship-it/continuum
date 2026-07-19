import { describe, expect, it } from "vitest";
import { applicationBaseUrl, environmentStatus, publicRegistrationEnabled } from "../apps/web/lib/env";

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

  it("rejects missing credential encryption and partial Google OAuth configuration", () => {
    expect(environmentStatus({ ...productionMinimum, APP_BASE_URL: "https://continuum.example", INTEGRATION_CREDENTIAL_ENCRYPTION_KEY: "short" }).ready).toBe(false);
    expect(environmentStatus({ ...productionMinimum, APP_BASE_URL: "https://continuum.example", GOOGLE_CLIENT_ID: "client-id" }).ready).toBe(false);
  });

  it("keeps public registration closed by default in production", () => {
    expect(publicRegistrationEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(publicRegistrationEnabled({ NODE_ENV: "production", PUBLIC_REGISTRATION_ENABLED: "true" })).toBe(true);
    expect(publicRegistrationEnabled({ NODE_ENV: "development" })).toBe(true);
  });
});
