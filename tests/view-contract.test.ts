import { readdirSync, readFileSync } from "node:fs";
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

/**
 * `searchResearch` concatenates claims, decisions, notes and passages **in that
 * order** and then slices to the caller's limit. Passages are therefore the
 * first thing dropped whenever anything else matches.
 *
 * That made it the wrong function for the assistant's lexical fallback: asking
 * for six results on a term that also appears in a decision returned six
 * decisions and zero passages, so the retrieval path written to reach the
 * user's documents could never reach them. The dedicated passage query exists
 * because of it, and this pins both facts so neither is quietly undone.
 */
describe("passage retrieval does not go through the mixed search", () => {
  it("has a passage-only lexical query", () => {
    expect(repo).toMatch(/async searchSourceChunksLexical/);
  });

  it("is what the assistant's lexical fallback calls", () => {
    const store = read("apps/web/lib/store.ts");
    // The DB-backed store is the later definition; the demo stub comes first.
    const start = store.lastIndexOf("async searchSourcePassages");
    const fallback = store.slice(start, store.indexOf("async ", store.indexOf("return hits", start)));
    expect(fallback).toMatch(/searchSourceChunksLexical/);
    // The call, not the prose — the comment above it names searchResearch to
    // explain why it is the wrong function here.
    expect(fallback, "searchResearch drops passages when anything else matches").not.toMatch(/repo\.searchResearch\(/);
  });

  it("still returns passages last in searchResearch, which is why the above matters", () => {
    const body = repo.slice(repo.indexOf("async searchResearch"), repo.indexOf("async searchResearch") + 4_000);
    const returned = body.slice(body.indexOf("return ["));
    expect(returned.indexOf("passageRows")).toBeGreaterThan(returned.indexOf("claimRows"));
    expect(returned).toMatch(/\.slice\(0, bounded\)/);
  });
});

/**
 * A read endpoint may not statically import a heavy native or parsing module.
 *
 * `GET /api/sources` — the request Library makes to list what you already have
 * — returned a 500 HTML page in production for a workspace with three indexed
 * sources. The cause was `sharp`, a native module that failed to dlopen on
 * Vercel's linux-x64 runtime (`libvips-cpp.so.8.18.3: cannot open shared object
 * file`). It is used only by the image-upload path in the same file, but a
 * static import fails at *module scope*, so it took every export down with it,
 * including three GET branches that never touch an image.
 *
 * The same shape hid `unpdf` and `mammoth` behind it. All three now load inside
 * the branch that needs them, so an unavailable parser produces a message about
 * parsing rather than an unavailable Library.
 */
describe("a read endpoint does not import the write path's dependencies", () => {
  const HEAVY = ["sharp", "unpdf", "mammoth", "image-question-extraction"];
  const routes = ["apps/web/app/api/sources/route.ts"];

  for (const route of routes) {
    it(`${route.split("/").slice(-2)[0]} loads heavy modules on demand`, () => {
      const source = read(route);
      // Static import lines only — `await import("…")` is the fix, not the bug.
      const statics = [...source.matchAll(/^import\s[^;]*?from\s+"([^"]+)";/gm)].map((match) => match[1]!);
      const offenders = statics.filter((specifier) => HEAVY.some((name) => specifier.includes(name)));
      expect(offenders, `statically imported: ${offenders.join(", ")}`).toEqual([]);
    });

    it(`${route.split("/").slice(-2)[0]} still reaches them dynamically`, () => {
      // The fix must not have silently removed the capability.
      expect(read(route)).toMatch(/await import\(|=> import\(/);
    });
  }

  it("keeps sharp itself behind a lazy loader", () => {
    const module = read("apps/web/lib/image-question-extraction.ts");
    expect(module).not.toMatch(/^import sharp from/m);
    expect(module).toMatch(/import\("sharp"\)/);
  });
});

/**
 * A capability with no surface is the same defect as a control with no
 * capability — just harder to notice, because nothing on screen is broken.
 *
 * `/api/learning/videos` was complete: rate limited, BYOK key handling, a
 * trusted-channel allowlist, and an explicit note that provider results are not
 * curriculum claims. Nothing in the product called it. Meanwhile the Ollama
 * card in Settings ran a connection test, reported success, and wrote an
 * address and model to localStorage that only one uncalled function ever read —
 * while telling the user "Continuum only calls it when you ask for AI help in
 * Code", which it never did and, on a server-side assistant, could not.
 */
describe("every endpoint has a caller, every control has an endpoint", () => {
  it("the video search endpoint is reachable from the UI", () => {
    const panel = read("apps/web/components/study/resource-panel.tsx");
    expect(panel).toMatch(/\/api\/learning\/videos/);
    expect(panel, "the provider's own disclaimer must be shown, not paraphrased").toMatch(/videoNote/);
  });

  it("no component imports the deleted ollama client", () => {
    // Removed rather than left as a lie: a browser-stored localhost address
    // cannot be reached by a server-side assistant, so the claim was not
    // implementable on this architecture.
    let present = true;
    try { read("apps/web/lib/ollama-client.ts"); } catch { present = false; }
    expect(present, "ollama-client.ts is dead code and should stay deleted").toBe(false);
  });

  it("the Ollama card describes what local Ollama actually does", () => {
    const card = read("apps/web/components/settings/ollama.tsx");
    expect(card, "the card must not promise code assistance it does not provide")
      .not.toMatch(/AI help in Code/);
    expect(card).toMatch(/embeddings|OLLAMA_BASE_URL/);
  });
});

/**
 * A component that renders classes must import the stylesheet that defines
 * them. `concept-map.tsx` imported none: its `.concept-*` rules live in
 * `study.css`, so the map was styled on /learn and /study — where some sibling
 * happens to pull that file in — and rendered as bare inline text on
 * /g/[goalId], the screen it was built for. The same defect had already been
 * found once, on research-screen.tsx.
 */
describe("a component carries its own stylesheet", () => {
  const componentDir = new URL("../apps/web/components/", import.meta.url).pathname;
  const componentRoot = componentDir.replace(/\/$/, "");

  /** Every class literal a .tsx file puts in a className. */
  const classesIn = (source: string) => {
    const found = new Set<string>();
    for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g)) {
      const raw = `${match[1] ?? ""} ${match[2] ?? ""} ${match[3] ?? ""}`;
      for (const token of raw.split(/[\s{}$?:()|&'"]+/)) {
        if (/^[a-z][a-z0-9-]{3,}$/.test(token) && token.includes("-")) found.add(token);
      }
    }
    return found;
  };

  const cssFiles = () => {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".css")) out.push(full);
      }
    };
    walk(componentRoot);
    return out;
  };

  const definedIn = (file: string) => {
    const css = readFileSync(file, "utf8");
    const set = new Set<string>();
    for (const match of css.matchAll(/\.([a-z][a-z0-9-]*)/g)) set.add(match[1]!);
    return set;
  };

  const cssIndex = new Map<string, Set<string>>();
  for (const file of cssFiles()) cssIndex.set(file, definedIn(file));

  /** Loaded by app/layout.tsx on every route, so always in the cascade. */
  const alwaysLoaded = new Set<string>([
    ...definedIn(new URL("../apps/web/app/globals.css", import.meta.url).pathname),
    ...definedIn(`${componentDir}ui/kit.css`),
    ...definedIn(`${componentDir}shell/sidebar.css`),
  ]);

  /**
   * Components whose classes are declared somewhere, checked against what the
   * component itself imports. Only components that render a distinctive,
   * namespaced family are worth asserting — generic kit classes are global.
   */
  const OWNERS: Array<{ component: string; prefix: string }> = [
    { component: "workspace/concept-map.tsx", prefix: "concept-" },
    { component: "workspace/research-screen.tsx", prefix: "research-" },
    { component: "workspace/scholarly-search.tsx", prefix: "scholarly-" },
  ];

  for (const { component, prefix } of OWNERS) {
    it(`${component} imports the stylesheet defining its ${prefix}* classes`, () => {
      const source = readFileSync(`${componentDir}${component}`, "utf8");
      const used = [...classesIn(source)].filter((name) => name.startsWith(prefix));
      expect(used.length).toBeGreaterThan(0);

      const imported = [...source.matchAll(/import\s+"([^"]+\.css)"/g)].map((match) => match[1]!);
      expect(imported.length).toBeGreaterThan(0);

      // Resolve each import against the component's own directory, honouring
      // the `@/` alias. globals.css and the kit load from the root layout on
      // every route, so anything they define is always reachable.
      const dir = `${componentDir}${component}`.replace(/\/[^/]+$/, "");
      const reachable = new Set<string>(alwaysLoaded);
      for (const spec of imported) {
        const resolved = spec.startsWith("@/components/")
          ? `${componentDir}${spec.slice("@/components/".length)}`
          : new URL(spec, `file://${dir}/`).pathname;
        for (const name of cssIndex.get(resolved) ?? []) reachable.add(name);
      }

      const orphans = used.filter((name) => !reachable.has(name));
      expect(orphans, `${component} renders these with no rule in any stylesheet it imports`).toEqual([]);
    });
  }
});
