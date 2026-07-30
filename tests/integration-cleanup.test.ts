import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);

describe("obsolete integration cleanup", () => {
  it("removes the retired scholarly and external-calendar routes", () => {
    for (const path of [
      "apps/web/app/api/connections/google/start/route.ts",
      "apps/web/app/api/connections/google/callback/route.ts",
      "apps/web/app/api/connections/google/sync/route.ts",
      "apps/web/app/api/connections/google/disconnect/route.ts",
      "apps/web/lib/google-calendar.ts",
    ]) {
      expect(existsSync(new URL(path, root)), path).toBe(false);
    }
  });

  it("keeps active discovery, connections, and routing surfaces free of retired provider choices", () => {
    const files = [
      "apps/web/components/integrations-screen.tsx",
      "apps/web/components/workspace/research-screen.tsx",
      "apps/web/app/api/research/discovery/route.ts",
      "apps/web/lib/scholarly.ts",
      "apps/web/lib/provider-credentials.ts",
      "packages/ai/src/policy.ts",
      "packages/mcp/src/index.ts",
    ];
    for (const path of files) {
      const source = readFileSync(new URL(path, root), "utf8");
      expect(source, path).not.toMatch(/semantic scholar|google scholar|google calendar/i);
    }
  });
});
