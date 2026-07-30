import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { APP_ROUTES, demoLogin, gotoRoute, PUBLIC_ROUTES, useTheme, type Theme } from "./support";

/**
 * §18.6 — `@axe-core/playwright` on every route, in both themes, at 1280 and
 * 375. **Zero critical or serious violations** is the bar; it is asserted here
 * rather than reported, so a regression fails the suite.
 *
 * Moderate and minor findings are printed but do not fail: §18.6 sets the gate
 * at critical/serious, and the explicit checks below cover the specific
 * behaviours (focus, layering, live regions, target size, reduced motion) that
 * axe cannot see.
 */

const THEMES: Theme[] = ["light", "dark"];
const VIEWPORTS = [
  { name: "1280", width: 1280, height: 900 },
  { name: "375", width: 375, height: 812 },
] as const;

type Violation = { id: string; impact?: string | null; nodes: unknown[]; help: string };

async function scan(page: Page) {
  // Entrance animations fade text in from a lower opacity. Sampling mid-fade
  // reports a blended foreground colour and produces contrast failures that do
  // not exist in any state the user sees. Reduced motion is also what §18.6
  // requires of the product anyway, so this scans the settled page.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    // `.cm-content` is CodeMirror's own contenteditable; its ARIA is owned by
    // the editor, not by this codebase.
    .exclude(".cm-editor")
    .analyze();
  return results.violations as unknown as Violation[];
}

function blocking(violations: Violation[]) {
  return violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
}

function describe(violations: Violation[]) {
  return violations
    .map((violation) => `${violation.impact}: ${violation.id} (${violation.nodes.length} node${violation.nodes.length === 1 ? "" : "s"}) — ${violation.help}`)
    .join("\n");
}

/**
 * Moderate and minor findings are reported rather than asserted: §18.6 puts the
 * release gate at critical/serious. Printing them keeps the drift visible.
 */
function report(label: string, violations: Violation[]) {
  const rest = violations.filter((violation) => violation.impact !== "critical" && violation.impact !== "serious");
  if (rest.length) console.log(`axe ${label} (non-blocking)\n${describe(rest)}`);
  const bad = blocking(violations);
  if (bad.length) console.log(`axe ${label} BLOCKING\n${describe(bad)}\n${JSON.stringify(bad.map((violation) => violation.nodes.slice(0, 2)), null, 1).slice(0, 2500)}`);
  return bad;
}

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`axe · ${theme} · ${viewport.name}px`, () => {
      test(`public routes have no critical or serious violations`, async ({ page }) => {
        test.setTimeout(180_000);
        await page.setViewportSize(viewport);
        await useTheme(page, theme);
        const failures: string[] = [];
        for (const route of PUBLIC_ROUTES) {
          await gotoRoute(page, route);
          const bad = report(`${theme} ${viewport.name} ${route}`, await scan(page));
          if (bad.length) failures.push(`${route}\n${describe(bad)}`);
        }
        expect(failures.join("\n\n"), "axe critical/serious violations").toBe("");
      });

      test(`app routes have no critical or serious violations`, async ({ page }) => {
        test.setTimeout(900_000);
        await page.setViewportSize(viewport);
        await useTheme(page, theme);
        await demoLogin(page);
        const failures: string[] = [];
        for (const route of APP_ROUTES) {
          await gotoRoute(page, route);
          const bad = report(`${theme} ${viewport.name} ${route}`, await scan(page));
          if (bad.length) failures.push(`${route}\n${describe(bad)}`);
        }
        expect(failures.join("\n\n"), "axe critical/serious violations").toBe("");
      });
    });
  }
}

/** The §18.6 checks axe cannot make. */
test.describe("explicit accessibility behaviour", () => {
  test("every route keeps a sequential heading order", async ({ page }) => {
    test.setTimeout(600_000);
    await useTheme(page, "dark");
    await demoLogin(page);
    const problems: string[] = [];
    for (const route of [...PUBLIC_ROUTES, ...APP_ROUTES]) {
      await gotoRoute(page, route);
      const levels = await page.$$eval("h1, h2, h3, h4, h5, h6", (nodes) =>
        nodes
          .filter((node) => {
            const style = getComputedStyle(node);
            return style.display !== "none" && style.visibility !== "hidden";
          })
          .map((node) => Number(node.tagName.slice(1))));
      // The `<h1>` count itself is §19.1 and belongs to
      // `scripts/verify-release.mjs`; this only guards the order, which axe
      // reports as `heading-order` and the release script does not check.
      for (let index = 1; index < levels.length; index += 1) {
        if (levels[index]! - levels[index - 1]! > 1) {
          problems.push(`${route}: heading jumps h${levels[index - 1]} → h${levels[index]}`);
          break;
        }
      }
    }
    expect(problems.join("\n")).toBe("");
  });

  test("a dialog traps focus and Escape restores it to the opener", async ({ page }) => {
    await useTheme(page, "dark");
    await demoLogin(page);
    const search = page.getByRole("button", { name: "Search workspace" });
    await search.click();
    const palette = page.getByRole("dialog");
    await expect(palette).toBeVisible();

    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement)));
      expect(inside, "focus escaped the dialog").toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
    // §18.2/§18.6: the opener gets focus back, not `<body>`.
    const restored = await page.evaluate(() => document.activeElement?.className ?? "");
    expect(restored).toContain("search-button");
  });

  test("Escape closes only the topmost layer", async ({ page }) => {
    await useTheme(page, "dark");
    await demoLogin(page);
    // The ⌘J panel is a persistent `<aside>`, not a modal dialog — it is meant
    // to sit beside the work rather than block it.
    await page.getByRole("button", { name: "Ask Continuum about this page" }).click();
    const panel = page.getByRole("complementary", { name: "Continuum assistant" });
    await expect(panel).toBeVisible();

    await page.keyboard.press("Meta+k");
    await expect(page.getByRole("listbox", { name: "Search results" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox", { name: "Search results" })).toHaveCount(0);
    // The assistant panel underneath survives the first Escape.
    await expect(panel).toBeVisible();
  });

  test("every interactive element takes a visible focus ring", async ({ page }) => {
    await useTheme(page, "dark");
    await demoLogin(page);
    const invisible = await page.evaluate(() => {
      const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const offenders: string[] = [];
      for (const node of [...document.querySelectorAll<HTMLElement>(selector)].slice(0, 60)) {
        if (!node.offsetParent && node.tagName !== "BODY") continue;
        const before = getComputedStyle(node);
        const baseline = `${before.outlineWidth}|${before.outlineStyle}|${before.boxShadow}|${before.borderColor}`;
        node.focus();
        const after = getComputedStyle(node);
        const focused = `${after.outlineWidth}|${after.outlineStyle}|${after.boxShadow}|${after.borderColor}`;
        if (baseline === focused) offenders.push(`${node.tagName}.${node.className}`.slice(0, 90));
        node.blur();
      }
      return offenders;
    });
    expect(invisible.join("\n")).toBe("");
  });

  test("prefers-reduced-motion removes transitions and animations", async ({ page }) => {
    await useTheme(page, "dark");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await demoLogin(page);
    const moving = await page.evaluate(() => {
      const offenders: string[] = [];
      for (const node of [...document.querySelectorAll<HTMLElement>("*")].slice(0, 400)) {
        const style = getComputedStyle(node);
        const transition = Number.parseFloat(style.transitionDuration) || 0;
        const animation = Number.parseFloat(style.animationDuration) || 0;
        if (transition > 0.02 || animation > 0.02) offenders.push(`${node.tagName}.${node.className}`.slice(0, 90));
      }
      return offenders.slice(0, 12);
    });
    expect(moving.join("\n")).toBe("");
  });

  test("the console announces a finished run through a live region", async ({ page }) => {
    test.setTimeout(180_000);
    await useTheme(page, "dark");
    await demoLogin(page);
    await gotoRoute(page, "/build");

    // The live region only exists once there is something to announce; before a
    // run the console shows the empty state instead (§14.3).
    await expect(page.getByRole("log")).toHaveCount(0);

    await page.getByLabel("Language").selectOption("javascript");
    const editor = page.locator(".code-editor-shell .cm-content");
    await editor.click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.insertText('console.log("announced");');
    await page.locator(".build-run-slot").getByRole("button", { name: /^Run/ }).click();

    const log = page.getByRole("log");
    await expect(log).toBeVisible({ timeout: 60_000 });
    await expect(log).toHaveAttribute("aria-live", "polite");
    // The announcement itself is screen-reader-only text, not a repeat of the
    // output — a run that finished silently is indistinguishable from a hang.
    await expect(log.locator(".sr-only")).not.toBeEmpty();
  });

  test("every status is carried by text, not by colour alone", async ({ page }) => {
    await useTheme(page, "dark");
    await demoLogin(page);
    const empty = await page.$$eval(".status-chip, .badge", (nodes) =>
      nodes.filter((node) => !(node.textContent ?? "").trim()).length);
    expect(empty).toBe(0);
  });
});
