import { describe, expect, it } from "vitest";

describe("security headers", () => {
  it("keeps OAuth popup communication available without relaxing the whole app", async () => {
    const { default: nextConfig } = await import("../apps/web/next.config.mjs");
    const rules = await nextConfig.headers?.();
    expect(rules).toBeDefined();

    const globalRule = rules?.find((rule) => rule.source === "/(.*)");
    expect(globalRule?.headers).toContainEqual({
      key: "Cross-Origin-Opener-Policy",
      value: "same-origin",
    });

    for (const source of ["/login", "/oauth/authorize", "/api/oauth/authorize"]) {
      expect(rules?.find((rule) => rule.source === source)?.headers).toContainEqual({
        key: "Cross-Origin-Opener-Policy",
        value: "unsafe-none",
      });
    }

    for (const source of ["/oauth/authorize", "/api/oauth/authorize"]) {
      const csp = rules?.find((rule) => rule.source === source)?.headers
        .find((header) => header.key === "Content-Security-Policy")?.value;
      expect(csp).toContain("form-action 'self' https:");
      expect(csp).toContain("http://localhost:*");
      expect(csp).not.toBe(globalRule?.headers.find((header) => header.key === "Content-Security-Policy")?.value);
    }
  });
});
