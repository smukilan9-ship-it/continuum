import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cookieAuthenticatedMutationRoutes = [
  "ai",
  "code",
  "code/checkpoint",
  "connections/zotero",
  "integrations",
  "integrations/credentials",
  "learning",
  "memory",
  "onboarding",
  "proposals",
  "research/discovery",
  "resources",
  "retrieval",
  "schedule",
  "sources",
  "state",
];

function routeSource(route: string) {
  return readFileSync(new URL(`../apps/web/app/api/${route}/route.ts`, import.meta.url), "utf8");
}

describe("authenticated API authorization matrix", () => {
  for (const route of cookieAuthenticatedMutationRoutes) {
    it(`${route} binds the session user and protects cookie-authenticated writes`, () => {
      const source = routeSource(route);
      expect(source).toContain("getRequestUser");
      expect(source).toContain("sameOriginWrite");
      expect(source).not.toMatch(/userId\s*:\s*parsed\.data\.userId/);
    });
  }

  it("provider credential writes additionally require HTTPS and reauthentication for replacement and deletion", () => {
    const source = routeSource("integrations/credentials");
    expect(source).toContain("httpsSubmission");
    expect(source).toContain("reauthenticate");
    expect(source).toContain("Enter your current password before replacing this credential");
    expect(source).toContain("Current password is incorrect");
  });
});
