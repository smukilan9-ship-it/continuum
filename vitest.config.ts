import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web", import.meta.url)),
      // `server-only` throws on import outside a server bundle, so server modules
      // are unreachable from Node tests without this stub.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      // drizzle-orm is a dependency of @continuum/db, so it is not hoisted to the
      // workspace root where the test files live.
      "drizzle-orm": fileURLToPath(new URL("./packages/db/node_modules/drizzle-orm", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: { reporter: ["text", "json"] },
  },
});
