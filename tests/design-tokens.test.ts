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

/**
 * A component must import the stylesheet its classes live in.
 *
 * The Research overview grid is styled by eleven classes that live in
 * `project/project.css`, and `research-screen.tsx` imported only its own
 * `research-screen.css`. So the flagship research screen rendered its overview
 * as unstyled stacked text in production — kickers, headings and metadata
 * running together with no card — while every test passed, because nothing
 * checks that a class has a rule.
 */
describe("every screen imports the CSS its classes need", () => {
  const screens = [
    { tsx: "components/workspace/research-screen.tsx", classes: ["research-overview-grid", "research-focus-card", "research-card-kicker", "research-status-card"] },
    { tsx: "components/study/study-view.tsx", classes: ["study-section", "study-section-heading", "study-material-grid"] },
    { tsx: "components/library/library-page.tsx", classes: ["library-screen"] },
  ];

  /** The CSS a component pulls in, following one level of relative import. */
  function importedCss(tsxPath: string): string {
    const source = read(tsxPath);
    const dir = tsxPath.slice(0, tsxPath.lastIndexOf("/"));
    return [...source.matchAll(/import\s+"([^"]+\.css)"/g)]
      .map((match) => {
        const target = match[1]!;
        const resolved = target.startsWith("./")
          ? `${dir}/${target.slice(2)}`
          : target.startsWith("../")
            ? `${dir.slice(0, dir.lastIndexOf("/"))}/${target.slice(3)}`
            : target;
        try { return read(resolved); } catch { return ""; }
      })
      .join("\n");
  }

  for (const screen of screens) {
    it(`${screen.tsx.split("/").pop()} has a rule for every class it leans on`, () => {
      const css = importedCss(screen.tsx);
      const missing = screen.classes.filter((name) => !css.includes(`.${name}`));
      expect(missing, `no rule imported for: ${missing.join(", ")}`).toEqual([]);
    });
  }
});

/**
 * The mark is jade and amber, like everything else.
 *
 * It shipped as a purple gradient left over from an abandoned palette, and the
 * favicon shipped as lime from the palette before that — so the tab icon, the
 * in-app logo and the product used three different colour systems at once. A
 * literal in an SVG cannot follow a token, so the only defence is a test.
 */
describe("the brand mark", () => {
  const files = ["components/brand-mark.tsx", "app/icon.svg"];
  const retired = ["635bff", "4b45d1", "9b6dff", "d9ff2f", "6f7a2e"];

  for (const file of files) {
    it(`${file} carries no retired palette`, () => {
      const source = read(file).toLowerCase();
      const found = retired.filter((hex) => source.includes(hex));
      expect(found, `retired colours still in the mark: ${found.join(", ")}`).toEqual([]);
    });

    it(`${file} uses the jade field and the amber trace`, () => {
      const source = read(file).toLowerCase();
      expect(source).toContain("05a37c");
      expect(source).toContain("ffb020");
    });
  }
});

/**
 * The motion layer obeys one rule: no animation may decide whether content is
 * visible. It has been broken twice — once by GSAP stranding a screen at a
 * third of its opacity, once by `animation-fill-mode: both` holding an
 * `opacity: 0` from-state — so it is asserted rather than remembered.
 */
describe("no animation can hide content", () => {
  const kit = read("components/ui/kit.css");

  /** Every `@keyframes name { … }` in the kit, body matched by walking braces. */
  const keyframes: Array<{ name: string; body: string }> = [];
  for (const match of kit.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    let depth = 0;
    let index = match.index! + match[0].length - 1;
    const open = index;
    for (; index < kit.length; index += 1) {
      if (kit[index] === "{") depth += 1;
      else if (kit[index] === "}") { depth -= 1; if (depth === 0) break; }
    }
    keyframes.push({ name: match[1]!, body: kit.slice(open + 1, index) });
  }

  it("finds the keyframes", () => {
    expect(keyframes.length).toBeGreaterThan(2);
    expect(keyframes.map((frame) => frame.name)).toContain("rise-in");
  });

  for (const frame of keyframes) {
    it(`@keyframes ${frame.name} cannot leave content unreachable`, () => {
      // Never animatable: these remove the element from the page outright, and
      // an interrupted animation leaves it removed.
      for (const property of ["visibility", "display", "clip-path", "content-visibility"]) {
        expect(frame.body, `${frame.name} animates ${property}`)
          .not.toMatch(new RegExp(`(^|[;{\\s])${property}\\s*:`));
      }

      // Opacity is allowed only when the animation *ends* visible, so the
      // resting state of the element is legible whatever happens mid-flight.
      // This is the rule the entrance broke twice: GSAP stranded a screen at a
      // third of its opacity, then `fill-mode: both` held an opacity-0 from-state
      // through the delay and left the screen blank.
      if (/opacity/.test(frame.body)) {
        const to = frame.body.slice(frame.body.lastIndexOf("to"));
        expect(to, `${frame.name} does not end at full opacity`).toMatch(/opacity:\s*1\b/);
      }
    });
  }

  it("keeps the sheen on an empty pseudo-element, never the button itself", () => {
    // If the sheen animated the button it would animate the label with it.
    expect(kit).toMatch(/\.button-primary::after[\s\S]{0,400}?content:\s*""/);
  });

  it("grows the meter with a transform, not a width", () => {
    // Width carries the value. Animating it would animate the data.
    const meter = keyframes.find((frame) => frame.name === "meter-grow")!;
    expect(meter.body).toMatch(/scaleX/);
    expect(meter.body).not.toMatch(/width/);
  });

  it("stands down entirely under prefers-reduced-motion", () => {
    const reduced = kit.slice(kit.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    for (const selector of ["button-primary::after", "meter", "data-changed"]) {
      expect(reduced, `${selector} is not disabled under reduced motion`).toContain(selector);
    }
  });
});

/**
 * A utility class must beat the component classes it is applied alongside.
 *
 * `.mobile-only { display: none }` sat at specificity (0,1,0). So did
 * `.icon-button { display: … }`, twice, later in source order — so the utility
 * lost every time it was used on an icon button, which is the only place it is
 * used. The ✕ beside the wordmark and the ☰ in the top bar were visible on
 * every screen at every width, including 1920, for as long as the class has
 * existed. Nothing failed: the markup was right, the media query was right, and
 * the cascade quietly discarded the rule.
 *
 * The fix doubles the selector to (0,2,0). This asserts it stays doubled, and
 * that no second `.icon-button` rule reappears to set `display` — the duplicate
 * that caused this also silently retired the -28/-32/-36 size modifiers by
 * forcing every icon button to 44px.
 */
describe("mobile-only actually hides", () => {
  const globals = read("app/globals.css");
  const kit = read("components/ui/kit.css");

  it("declares the hide rule at a specificity a component class cannot match", () => {
    expect(globals).toMatch(/\.mobile-only\.mobile-only[^{]*\{[^}]*display:\s*none/);
  });

  it("re-shows it at the same specificity inside the media query", () => {
    const mobile = globals.slice(globals.indexOf("@media (max-width: 840px)"));
    expect(mobile).toMatch(/\.mobile-only\.mobile-only\s*\{\s*display:\s*grid/);
  });

  it("has exactly one .icon-button rule setting display", () => {
    const setters = [...kit.matchAll(/^\.icon-button\s*\{([^}]*)\}/gms)]
      .filter((match) => /display\s*:/.test(match[1]!));
    expect(setters.length, "a duplicate .icon-button rule overrides the size modifiers").toBe(1);
  });

  it("keeps the icon-button size modifiers effective", () => {
    // They come after the base rule and share its specificity, so they win —
    // unless a later bare `.icon-button` rule re-sets width, which is the bug.
    const base = kit.indexOf(".icon-button {");
    const modifier = kit.indexOf(".icon-button-28");
    expect(modifier).toBeGreaterThan(base);
    expect(kit.lastIndexOf("width: 44px; height: 44px; display: grid")).toBe(-1);
  });
});
