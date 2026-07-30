import { expect, test } from "@playwright/test";

import { demoLogin, gotoRoute, useTheme, VISUAL_ROUTES, type Theme } from "./support";

/**
 * §18.7 — Playwright screenshots of `/dev/kit` (every component, every state)
 * and of nine key routes, in **both themes** at 1440, 1100 and 375. Sixty
 * baselines. `maxDiffPixelRatio` is 0.001, i.e. §18.7's "a diff over 0.1%
 * fails".
 *
 * Baselines are regenerated with `--update-snapshots` and, per §18.7, only with
 * an explicit reviewer note in the commit that carries them.
 *
 * These are opt-in: `PLAYWRIGHT_VISUAL=1`. Screenshots are machine-specific
 * (font rasterisation, scrollbar width), so running them by default would make
 * every other spec's result depend on the runner.
 */

const ENABLED = process.env.PLAYWRIGHT_VISUAL === "1";
const THEMES: Theme[] = ["light", "dark"];
const WIDTHS = [1440, 1100, 375] as const;

test.describe("visual regression", () => {
  test.skip(!ENABLED, "Set PLAYWRIGHT_VISUAL=1 to record or compare visual baselines.");
  test.describe.configure({ mode: "serial" });

  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`the component kit · ${theme} · ${width}px`, async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width, height: 900 });
        await useTheme(page, theme);
        await gotoRoute(page, "/dev/kit");
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect(page).toHaveScreenshot(`kit-${theme}-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
          animations: "disabled",
          caret: "hide",
        });
      });
    }
  }

  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`key routes · ${theme} · ${width}px`, async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width, height: 900 });
        await useTheme(page, theme);
        await demoLogin(page);
        await page.emulateMedia({ reducedMotion: "reduce" });
        for (const route of VISUAL_ROUTES) {
          await gotoRoute(page, route);
          const name = route === "/" ? "landing" : route.replace(/^\//, "").replaceAll("/", "-");
          await expect(page).toHaveScreenshot(`${name}-${theme}-${width}.png`, {
            fullPage: true,
            maxDiffPixelRatio: 0.001,
            animations: "disabled",
            caret: "hide",
            // The greeting, the date line, and every relative deadline move on
            // their own; masking them is what makes the rest comparable.
            mask: [page.locator(".home-head p"), page.locator(".plan-weeknav span"), page.locator("time")],
          });
        }
      });
    }
  }
});
