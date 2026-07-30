import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * Shared for both projects. `@` and the two stubs are what the node suite has
 * always needed; `react`/`react-dom` matter only to the jsdom project but are
 * harmless here and keep the two lists from drifting apart.
 */
const alias = {
  "@": resolvePath("./apps/web"),
  // `server-only` throws on import outside a server bundle, so server modules
  // are unreachable from Node tests without this stub.
  "server-only": resolvePath("./tests/stubs/server-only.ts"),
  // drizzle-orm is a dependency of @continuum/db, so it is not hoisted to the
  // workspace root where the test files live.
  "drizzle-orm": resolvePath("./packages/db/node_modules/drizzle-orm"),
};

/**
 * React lives in `apps/web/node_modules`, not at the workspace root, so a test
 * file sitting in `tests/` cannot resolve it. Aliasing also guarantees the test,
 * `@testing-library/react`, and the components under test all share **one**
 * React instance — two copies produce "invalid hook call" rather than a useful
 * failure.
 */
const reactAlias = {
  ...alias,
  react: resolvePath("./apps/web/node_modules/react"),
  "react-dom": resolvePath("./apps/web/node_modules/react-dom"),
  // Same reason, plus one more: `vi.mock("next/navigation")` keys the mock on
  // the *resolved* module id. Without this the specifier is unresolvable from
  // `tests/`, the mock registers against a different id than the component
  // imported, and `useRouter` throws its "app router to be mounted" invariant.
  next: resolvePath("./apps/web/node_modules/next"),
};

export default defineConfig({
  test: {
    coverage: { reporter: ["text", "json"] },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          // `.test.ts` only: the component suite is `.test.tsx` and must not be
          // pulled into the environment that has no DOM.
          include: ["tests/**/*.test.ts"],
        },
      },
      {
        resolve: { alias: reactAlias },
        // The kit is authored for Next's automatic runtime, so there is no
        // `import React` to satisfy the classic transform.
        esbuild: { jsx: "automatic", jsxImportSource: "react" },
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["tests/components/**/*.test.tsx"],
          setupFiles: ["./tests/components/setup.ts"],
          // Radix measures and portals on mount; a shared document between two
          // files in the same worker leaks dialogs across tests.
          restoreMocks: true,
        },
      },
    ],
  },
});
