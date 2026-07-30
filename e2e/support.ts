import { expect, type Page } from "@playwright/test";

export const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export type Theme = "light" | "dark";

/** The seeded demo records the §18 routes address by name. */
export const DEMO_GOAL_ID = "goal_demo_sat";
export const DEMO_PROJECT_ID = "project_demo_oasis";

/** §18.6/§18.7: every route, at its §7.1 address. */
export const PUBLIC_ROUTES = ["/", "/login", "/privacy", "/terms"] as const;

export const APP_ROUTES = [
  "/home",
  "/ask",
  "/plan",
  "/library",
  "/review",
  "/context",
  "/build",
  "/learn",
  "/research",
  `/g/${DEMO_GOAL_ID}`,
  `/g/${DEMO_GOAL_ID}/p/${DEMO_PROJECT_ID}`,
  "/settings/account",
  "/settings/connections",
  "/dev/kit",
] as const;

export const ALL_ROUTES = [...PUBLIC_ROUTES, ...APP_ROUTES];

/** The nine routes §18.7 takes visual baselines of, plus the kit. */
export const VISUAL_ROUTES = ["/", "/home", "/ask", "/plan", "/library", "/build", "/learn", "/context", `/g/${DEMO_GOAL_ID}`] as const;

/**
 * The root layout's inline script reads `continuum-theme` before first paint, so
 * seeding it in an init script gives a deterministic theme with no flash and no
 * dependence on the runner's OS preference.
 */
export async function useTheme(page: Page, theme: Theme) {
  await page.addInitScript((value) => {
    try { window.localStorage.setItem("continuum-theme", value); } catch { /* storage may be unavailable */ }
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

/** Suppresses the one-time product tour, which otherwise covers every screen. */
export async function suppressFirstRunOverlays(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("continuum.tour.completed.v1", "1");
      window.localStorage.setItem("continuum.onboarding.skipped.v1", "1");
    } catch { /* storage may be unavailable */ }
  });
}

/**
 * §18.4: one click from the landing page. `POST /api/auth/demo` authenticates
 * the seeded account through the ordinary password path and the demo lands on
 * `/home`.
 */
export async function demoLogin(page: Page) {
  await suppressFirstRunOverlays(page);
  await page.goto("/login");
  await page.getByRole("button", { name: /Explore the demo/ }).click();
  await page.waitForURL(`${baseURL}/home`, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), .+/i })).toBeVisible({ timeout: 30_000 });
  await hydrated(page);
}

/** React has attached its handlers; a click before this is silently dropped. */
export async function hydrated(page: Page) {
  await page.waitForFunction(() => {
    const shell = document.querySelector(".app-shell");
    return Boolean(shell && Object.keys(shell).some((key) => key.startsWith("__reactFiber$")));
  }, undefined, { timeout: 30_000 });
}

/**
 * Waits for a screen to stop showing its skeleton. Every app route renders
 * `.screen-loading` while the workspace snapshot is in flight.
 */
export async function screenReady(page: Page, timeout = 45_000) {
  await page.waitForLoadState("domcontentloaded");
  await page.locator(".screen-loading").first().waitFor({ state: "detached", timeout }).catch(() => { /* some routes never render one */ });
  await page.waitForTimeout(250);
}

export async function gotoRoute(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await screenReady(page);
}

export const WIDTHS = { mobile: 375, desktop: 1280 } as const;

/** The §18.8 ladder. */
export const RESPONSIVE_WIDTHS = [320, 375, 600, 900, 1100, 1400, 1920] as const;
