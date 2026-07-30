import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * A screen may only read fields its view actually returns.
 *
 * This bug has now shipped three times, each time silently:
 *
 *   - Study rendered concept names from `conceptId`, because the `learn` view
 *     did not join `concepts`. A student read "SQL param".
 *   - Study rendered "best N%" from `bank.attempts`, which no list view
 *     returns. The label never appeared, so a completed set looked untouched.
 *   - Study's Material column read `sources` and `papers`, which the `learn`
 *     view did not return. The panel was permanently empty and told a learner
 *     with three attached documents that they had none.
 *
 * None of them threw. Every view spreads `...empty`, so a missing field reads
 * as an empty array, which renders as a legitimate-looking "nothing here yet".
 * That is the worst possible failure for a product whose whole claim is that it
 * knows your material — and it is exactly what an empty-state design is for, so
 * no reviewer looking at the screen would question it.
 *
 * Static, deliberately: it needs no database, so it runs on every commit.
 */
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(`${root}${path}`, "utf8");

const repo = read("packages/db/src/repo.ts");

/** The keys the named view's `return { … }` literal sets, `...empty` aside. */
function viewKeys(view: string): Set<string> {
  const start = repo.indexOf(`if (view === "${view}")`);
  expect(start, `view "${view}" not found in repo.ts`).toBeGreaterThan(-1);
  const returnAt = repo.indexOf("return {", start);
  // Walk braces so a nested object or arrow body cannot end the literal early.
  let depth = 0;
  let end = returnAt + "return ".length;
  for (; end < repo.length; end += 1) {
    if (repo[end] === "{") depth += 1;
    else if (repo[end] === "}") { depth -= 1; if (depth === 0) break; }
  }
  const body = repo.slice(returnAt, end);
  return new Set([...body.matchAll(/(?:^|[{,\s])([a-zA-Z][a-zA-Z0-9]*)\s*:/g)].map((match) => match[1]!));
}

/** Every `state.foo` a component and its helpers read. */
function stateReads(...paths: string[]): Set<string> {
  const keys = new Set<string>();
  for (const path of paths) {
    for (const match of read(path).matchAll(/\bstate\.([a-zA-Z][a-zA-Z0-9]*)/g)) keys.add(match[1]!);
  }
  return keys;
}

/** Every screen, the view it is rendered with, and the files that read state. */
const SCREENS: Array<{ view: string; label: string; files: string[] }> = [
  { view: "learn", label: "Study", files: ["apps/web/components/study/study-view.tsx", "apps/web/components/study/next-action.ts"] },
  { view: "goal", label: "Goal", files: ["apps/web/components/goal/goal-screen.tsx"] },
  { view: "research", label: "Projects", files: ["apps/web/components/workspace/research-screen.tsx"] },
  { view: "today", label: "Home", files: ["apps/web/components/home/home-page.tsx"] },
  { view: "library", label: "Library", files: ["apps/web/components/library/library-page.tsx"] },
  { view: "activity", label: "Review", files: ["apps/web/components/review/review-page.tsx"] },
  { view: "memory", label: "Context", files: ["apps/web/components/context/context-page.tsx"] },
  { view: "goals", label: "Plan", files: ["apps/web/components/plan/plan-page.tsx"] },
];

describe("a screen may only read fields its view returns", () => {
  for (const screen of SCREENS) {
    it(`${screen.label} reads nothing the ${screen.view} view leaves out`, () => {
      const returned = viewKeys(screen.view);
      const missing = [...stateReads(...screen.files)].filter((key) => key && !returned.has(key));
      expect(missing, `the ${screen.view} view does not return: ${missing.join(", ")}`).toEqual([]);
    });
  }

  it("carries the concept's real title, not an id to be humanised", () => {
    // Guards the first of the three: the join, not just the field.
    expect(repo.slice(repo.indexOf(`if (view === "learn")`), repo.indexOf(`if (view === "research")`)))
      .toMatch(/leftJoin\(concepts/);
  });

  it("carries a practice set's best score as an aggregate, not from attempts", () => {
    // Guards the second: list views do not join attempts, so the number has to
    // arrive some other way or the label silently never renders.
    expect(repo).toMatch(/bestBankScores/);
    for (const view of ["learn", "study", "goal"]) {
      const slice = repo.slice(repo.indexOf(`if (view === "${view}")`));
      expect(slice.slice(0, slice.indexOf("\n    }")), `${view} view`).toMatch(/bankScores\.get/);
    }
  });
});
