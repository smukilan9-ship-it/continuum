import { describe, expect, it } from "vitest";
import { sameOriginWrite } from "../apps/web/lib/request-security";

function request(url: string, origin?: string) {
  return new Request(url, { method: "POST", headers: origin ? { origin } : undefined });
}

describe("same-origin write protection", () => {
  it("accepts the configured application origin in production", () => {
    expect(sameOriginWrite(request("https://internal.invalid/api/state", "https://continuum.example"), {
      NODE_ENV: "production",
      APP_BASE_URL: "https://continuum.example/",
    })).toBe(true);
  });

  it("rejects missing, malformed, and cross-site origins in production", () => {
    const env = { NODE_ENV: "production", APP_BASE_URL: "https://continuum.example" };
    expect(sameOriginWrite(request("https://continuum.example/api/state"), env)).toBe(false);
    expect(sameOriginWrite(request("https://continuum.example/api/state", "not-a-url"), env)).toBe(false);
    expect(sameOriginWrite(request("https://continuum.example/api/state", "https://evil.example"), env)).toBe(false);
  });

  it("accepts a deployment's exact same origin without baking its hostname into the bundle", () => {
    expect(sameOriginWrite(request("https://continuum-feature-abc.vercel.app/api/state", "https://continuum-feature-abc.vercel.app"), {
      NODE_ENV: "production",
      APP_BASE_URL: "https://continuum.example",
    })).toBe(true);
  });

  it("accepts loopback host and port differences only in development", () => {
    const localRequest = request("http://localhost:3000/api/state", "http://127.0.0.1:3001");
    expect(sameOriginWrite(localRequest, { NODE_ENV: "development", APP_BASE_URL: "http://localhost:3000" })).toBe(true);
    expect(sameOriginWrite(localRequest, { NODE_ENV: "production", APP_BASE_URL: "https://continuum.example" })).toBe(false);
  });

  it("still rejects non-loopback development origins", () => {
    expect(sameOriginWrite(request("http://localhost:3000/api/state", "https://evil.example"), {
      NODE_ENV: "development",
      APP_BASE_URL: "http://localhost:3000",
    })).toBe(false);
  });
});
