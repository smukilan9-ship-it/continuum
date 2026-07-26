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
  });
});
