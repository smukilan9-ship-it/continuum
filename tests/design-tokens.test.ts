import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const webRoot = fileURLToPath(new URL("../apps/web/", import.meta.url));
const read = (path: string) => readFileSync(`${webRoot}${path}`, "utf8");

const moduleFiles = readdirSync(`${webRoot}components`, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((dir) =>
    readdirSync(`${webRoot}components/${dir.name}`)
      .filter((file) => file.endsWith(".css"))
      .map((file) => `components/${dir.name}/${file}`),
  );

/**
 * §19.10: "One token set (no literal colours outside `globals.css`)".
 *
 * This is not style policing. The 115 literals this replaced were all picked
 * for the light theme by a pre-redesign stylesheet, and a literal cannot
 * respond to `html[data-theme]` — so every one of them was either a dark-theme
 * defect or a hand-written override duplicating what a token already knows.
 * Removing them deleted five override blocks outright.
 *
 * Comments are exempt: several of these files explain which literal a token
 * replaced, and naming it is the point of the comment.
 */
describe("§19.10 one token set", () => {
  // `white-space: nowrap` is not a colour. Keyword colours only count in a
  // value position, so declarations are split from their properties first.
  const literalsIn = (css: string) => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const hex = [...body.matchAll(/#[0-9a-fA-F]{3,8}(?![\w-])/g)].map((match) => match[0]);
    const keywords = body
      .split(/[;{}]/)
      .filter((part) => part.includes(":"))
      .flatMap((part) => [
        ...part.slice(part.indexOf(":") + 1).matchAll(/(?<![\w-])(white|black|red|blue|green|orange|purple|grey|gray)(?![\w-])/g),
      ])
      .map((match) => match[0]);
    return [...new Set([...hex, ...keywords])];
  };

  it("finds every co-located stylesheet", () => {
    expect(moduleFiles.length).toBeGreaterThanOrEqual(15);
  });

  for (const file of moduleFiles) {
    it(`${file} uses tokens, not literal colours`, () => {
      expect(literalsIn(read(file))).toEqual([]);
    });
  }

  it("globals.css stays under the §19.10 600-line ceiling", () => {
    expect(read("app/globals.css").split("\n").length).toBeLessThan(600);
  });

  /**
   * `--font-display` was referenced by the assistant's welcome heading with no
   * definition anywhere, so that heading silently inherited instead of failing.
   * An undefined custom property has no error state — only this catches it.
   */
  it("defines every token the modules reference", () => {
    // A token can be declared in CSS, handed over by `next/font`'s `variable`,
    // or set inline on an element — all three are real definitions.
    const sources = ["app/globals.css", "app/layout.tsx", ...moduleFiles].map(read).concat(
      readdirSync(`${webRoot}components`, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((dir) =>
          readdirSync(`${webRoot}components/${dir.name}`)
            .filter((file) => file.endsWith(".tsx"))
            .map((file) => read(`components/${dir.name}/${file}`)),
        ),
    );
    const defined = new Set(sources.flatMap((css) => [...css.matchAll(/["']?(--[\w-]+)["']?\s*[:,]/g)].map((match) => match[1])));
    const referenced = new Set(
      moduleFiles.flatMap((file) => [...read(file).matchAll(/var\(\s*(--[\w-]+)\s*[,)]/g)].map((match) => match[1])),
    );
    expect([...referenced].filter((token) => !defined.has(token))).toEqual([]);
  });

  /**
   * There is one theme now. Two half-tuned themes cost more than they bought:
   * every literal colour was a dark-mode defect waiting to be found, and half
   * the stylesheet was override rules. This asserts the decision holds — a
   * `data-theme` rule reintroduces the whole class of bug it replaced.
   */
  it("has exactly one theme", () => {
    const sources = ["app/globals.css", ...moduleFiles].map(read);
    const themed = sources.filter((css) => /data-theme/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")));
    expect(themed).toEqual([]);
  });

  it("defines the surfaces that stay dark on a light page", () => {
    const globals = read("app/globals.css");
    for (const token of ["--surface-inverse", "--ink-inverse", "--danger-hover", "--syntax-string"]) {
      expect(globals, `${token} is not defined`).toContain(`${token}:`);
    }
  });
});

/**
 * The entrance animation, twice.
 *
 * It was GSAP and stranded a screen at a third of its opacity; it was then a
 * CSS keyframe with `animation-fill-mode: both` and left a screen blank. Both
 * failures were the same mistake — content whose visibility depends on an
 * animation completing — and both shipped, because nothing failed when they
 * did. This is that missing check.
 */
describe("no animation can hide a screen", () => {
  const kit = read("components/ui/kit.css");

  /** The `@keyframes rise-in { … }` body, whatever it currently contains. */
  const riseIn = kit.match(/@keyframes\s+rise-in\s*\{([\s\S]*?)\n\}/)?.[1];

  it("has an entrance at all", () => {
    expect(riseIn).toBeDefined();
    expect(kit).toMatch(/\.screen\s*>\s*\*/);
  });

  it("animates transform only — never opacity, visibility, filter or clip", () => {
    // A transform-only entrance degrades to "content sits a few pixels low".
    // Anything on this list degrades to "content is not there".
    for (const property of ["opacity", "visibility", "filter", "clip-path", "display"]) {
      expect(riseIn!).not.toMatch(new RegExp(`(^|[;{\\s])${property}\\s*:`));
    }
  });

  it("is removed under prefers-reduced-motion rather than shortened", () => {
    const reduced = kit.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/g)?.join("\n") ?? "";
    expect(reduced).toMatch(/\.screen\s*>\s*\*[^{]*\{[^}]*animation:\s*none/);
  });
});
