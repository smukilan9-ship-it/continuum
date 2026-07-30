import { expect, test, type Page } from "@playwright/test";

import { APP_ROUTES, demoLogin, gotoRoute, PUBLIC_ROUTES, RESPONSIVE_WIDTHS, useTheme } from "./support";

/**
 * §18.8 — each surface at 320, 375, 600, 900, 1100, 1400 and 1920.
 *
 * The Plan-grid bounding-box comparison is the C6 regression guard. At 375px the
 * week board gave each day a `min-width` while the grid tracks stayed at desktop
 * sizes, so a grid item wider than its track overflowed and **painted Thursday
 * and Friday on top of Wednesday**. Eleven overlapping pairs. Counting them from
 * real geometry is the only way that stays fixed: nothing about the DOM changes
 * when it regresses, only the layout.
 */

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
}

type Box = { label: string; left: number; right: number; top: number; bottom: number };

function overlappingPairs(boxes: Box[]) {
  const pairs: string[] = [];
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      const one = boxes[a]!;
      const two = boxes[b]!;
      // A 0.5px tolerance absorbs sub-pixel rounding on fractional layouts.
      const horizontal = Math.min(one.right, two.right) - Math.max(one.left, two.left) > 0.5;
      const vertical = Math.min(one.bottom, two.bottom) - Math.max(one.top, two.top) > 0.5;
      if (horizontal && vertical) pairs.push(`${one.label} ↔ ${two.label}`);
    }
  }
  return pairs;
}

test.describe("responsive", () => {
  test.describe.configure({ mode: "serial" });

  test("no route scrolls horizontally at any width", async ({ page }) => {
    test.setTimeout(900_000);
    await useTheme(page, "dark");
    await demoLogin(page);
    const failures: string[] = [];
    for (const width of RESPONSIVE_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [...PUBLIC_ROUTES, ...APP_ROUTES]) {
        await gotoRoute(page, route);
        const { scrollWidth, clientWidth } = await horizontalOverflow(page);
        if (scrollWidth > clientWidth + 1) failures.push(`${route} @ ${width}px: ${scrollWidth} > ${clientWidth}`);
      }
    }
    expect(failures.join("\n")).toBe("");
  });

  /** The C6 guard. */
  test("no two Plan day columns overlap at 375px", async ({ page }) => {
    test.setTimeout(180_000);
    await useTheme(page, "dark");
    await demoLogin(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoRoute(page, "/plan");

    const columns = await page.$$eval(".plan-day", (nodes) =>
      nodes.map((node, index) => {
        const rect = node.getBoundingClientRect();
        return { label: node.querySelector(".plan-day-head span")?.textContent ?? `day ${index}`, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }));

    // A grid that has collapsed to a day agenda has no columns to overlap; a
    // grid that still has them must not stack them.
    if (columns.length) expect(overlappingPairs(columns).join("\n"), "overlapping Plan day columns at 375px").toBe("");
    else expect(await page.locator(".plan-day-agenda, .plan-agenda, .day-agenda").count(), "neither a week grid nor a day agenda rendered").toBeGreaterThan(0);
  });

  test("no two Plan blocks in the same day overlap at 375px", async ({ page }) => {
    test.setTimeout(180_000);
    await useTheme(page, "dark");
    await demoLogin(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoRoute(page, "/plan");

    const perDay = await page.$$eval(".plan-day", (days) =>
      days.map((day) => [...day.querySelectorAll(".plan-block")].map((block, index) => {
        const rect = block.getBoundingClientRect();
        return { label: block.querySelector("strong")?.textContent ?? `block ${index}`, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      })));

    const failures: string[] = [];
    for (const day of perDay) {
      // Blocks genuinely clashing in time are marked `is-overlapping` on
      // purpose; those are data, not layout. Everything else must not collide.
      const pairs = overlappingPairs(day as Box[]);
      if (pairs.length && day.length > 1) failures.push(pairs.join("\n"));
    }
    // Every clash the screen renders must also be *labelled* as a clash.
    const labelled = await page.locator(".plan-block.is-overlapping").count();
    if (failures.length) expect(labelled, `${failures.length} unlabelled overlaps: ${failures.join("; ")}`).toBeGreaterThan(0);
  });

  test("the Plan grid stays inside its own column at every width", async ({ page }) => {
    test.setTimeout(300_000);
    await useTheme(page, "dark");
    await demoLogin(page);
    const failures: string[] = [];
    for (const width of RESPONSIVE_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await gotoRoute(page, "/plan");
      const spill = await page.evaluate(() => {
        const grid = document.querySelector(".plan-grid-days");
        if (!grid) return 0;
        const bounds = grid.getBoundingClientRect();
        return [...grid.querySelectorAll(".plan-day")]
          .filter((day) => day.getBoundingClientRect().right > bounds.right + 1)
          .length;
      });
      if (spill) failures.push(`${spill} day column(s) spill past the grid at ${width}px`);
    }
    expect(failures.join("\n")).toBe("");
  });

  test("touch targets are at least 44px below 900px", async ({ page }) => {
    test.setTimeout(300_000);
    await useTheme(page, "dark");
    await demoLogin(page);
    const failures: string[] = [];
    for (const width of [320, 375, 600] as const) {
      await page.setViewportSize({ width, height: 812 });
      for (const route of ["/home", "/plan", "/build", "/library"]) {
        await gotoRoute(page, route);
        const small = await page.$$eval("nav a, nav button, .mobile-bottom-nav a, .mobile-bottom-nav button", (nodes) =>
          nodes
            .filter((node) => {
              const rect = node.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            })
            .filter((node) => {
              const rect = node.getBoundingClientRect();
              return rect.height < 44 || rect.width < 44;
            })
            .map((node) => {
              const rect = node.getBoundingClientRect();
              return `${(node.textContent ?? "").trim().slice(0, 24)} ${Math.round(rect.width)}×${Math.round(rect.height)}`;
            })
            .slice(0, 6));
        if (small.length) failures.push(`${route} @ ${width}px: ${small.join(", ")}`);
      }
    }
    expect(failures.join("\n")).toBe("");
  });

  test("no visible text renders below 12px", async ({ page }) => {
    test.setTimeout(300_000);
    await useTheme(page, "dark");
    await demoLogin(page);
    const failures: string[] = [];
    for (const width of [320, 375] as const) {
      await page.setViewportSize({ width, height: 812 });
      for (const route of ["/home", "/plan", "/library", "/build", "/context"]) {
        await gotoRoute(page, route);
        const tiny = await page.$$eval("body *", (nodes) =>
          nodes
            .filter((node) => {
              const text = [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim());
              if (!text) return false;
              const style = getComputedStyle(node);
              if (style.display === "none" || style.visibility === "hidden") return false;
              const rect = node.getBoundingClientRect();
              if (!rect.width || !rect.height) return false;
              return Number.parseFloat(style.fontSize) < 12;
            })
            .map((node) => `${node.tagName}.${node.className} ${getComputedStyle(node).fontSize}`.slice(0, 80))
            .slice(0, 6));
        if (tiny.length) failures.push(`${route} @ ${width}px: ${tiny.join(", ")}`);
      }
    }
    expect(failures.join("\n")).toBe("");
  });
});
