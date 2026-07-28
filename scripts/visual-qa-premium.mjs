import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "@playwright/test";

const baseUrl = process.env.CONTINUUM_VISUAL_BASE_URL ?? "http://localhost:3000";
const outputDirectory = new URL("../docs/audit-screenshots/premium/", import.meta.url);
const sizes = [
  { width: 1469, height: 861 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
];
const requestedRoutes = process.env.CONTINUUM_VISUAL_ROUTES?.split(",").map((value) => value.trim()).filter(Boolean);
const routes = [
  ["today", "/today"],
  ["assistant", "/assistant"],
  ["plan", "/goals"],
  ["learn", "/learn"],
  ["code", "/code"],
  ["research", "/research"],
  ["openalex", "/openalex"],
  ["zotero", "/zotero"],
  ["memory", "/memory"],
  ["review", "/activity"],
  ["connections", "/integrations"],
  ["account", "/account"],
].filter(([name]) => !requestedRoutes?.length || requestedRoutes.includes(name));
if (!routes.length) throw new Error(`No matching CONTINUUM_VISUAL_ROUTES: ${requestedRoutes?.join(", ")}`);
const requestedEngine = process.env.CONTINUUM_VISUAL_ENGINE;
const engines = [
  { name: "chromium", launcher: chromium, viewports: sizes },
  { name: "webkit", launcher: webkit, viewports: [sizes[0], sizes[2]] },
].filter((engine) => !requestedEngine || engine.name === requestedEngine);
if (!engines.length) throw new Error(`Unknown CONTINUUM_VISUAL_ENGINE: ${requestedEngine}`);
const results = [];

await mkdir(outputDirectory, { recursive: true });

async function navigateToRoute(page, url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "load" });
      await page.waitForURL((currentUrl) => currentUrl.href === url, { timeout: 20_000 });
      await page.waitForTimeout(250);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForLoadState("load").catch(() => {});
      await page.waitForTimeout(350);
    }
  }
}

for (const engine of engines) {
  const browser = await engine.launcher.launch({ headless: true });
  try {
    for (const theme of ["light", "dark"]) {
      for (const viewport of engine.viewports) {
        const context = await browser.newContext({ viewport, colorScheme: theme });
        const page = await context.newPage();
        await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
        await page.evaluate((preference) => {
          window.localStorage.setItem("continuum-theme", preference);
        }, theme);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => {
          const root = document.querySelector(".login-shell");
          return Boolean(root && Object.keys(root).some((key) => key.startsWith("__reactFiber$")));
        }, { timeout: 20_000 });
        await page.screenshot({ path: new URL(`${engine.name}-login-${theme}-${viewport.width}x${viewport.height}.png`, outputDirectory).pathname });
        await page.getByRole("button", { name: /Explore the demo/ }).click();
        await page.waitForURL((url) => url.pathname === "/today", { timeout: 30_000 });
        await page.waitForLoadState("load");
        await page.locator(".app-shell").waitFor({ state: "visible", timeout: 20_000 });
        await page.waitForTimeout(500);

        for (const [name, path] of routes) {
          await navigateToRoute(page, `${baseUrl}${path}`);
          await page.locator(".app-shell").waitFor({ state: "visible", timeout: 20_000 });
          if (path === "/integrations") await page.locator(".connections-screen").waitFor({ state: "visible", timeout: 20_000 });
          await page.locator(`.theme-toggle[aria-label^="Theme: ${theme}"]`).waitFor({ state: "visible", timeout: 20_000 });
          if (path === "/assistant" && viewport.width <= 840) {
            await page.locator(".assistant-screen.sidebar-collapsed").waitFor({ state: "visible", timeout: 20_000 });
          }
          await page.evaluate(() => {
            window.scrollTo(0, 0);
            document.querySelector(".main-nav")?.scrollTo(0, 0);
          });
          await page.waitForTimeout(300);
          const measurements = await page.evaluate(() => {
            const profile = document.querySelector(".profile-card")?.getBoundingClientRect();
            const mobile = matchMedia("(max-width: 840px)").matches;
            return {
              clientWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
              resolvedTheme: document.documentElement.dataset.theme,
              title: document.title,
              profileVisible: mobile || Boolean(profile && profile.top >= 0 && profile.bottom <= innerHeight),
            };
          });
          const record = {
            browser: engine.name,
            name,
            path,
            requestedTheme: theme,
            ...viewport,
            ...measurements,
            overflow: measurements.scrollWidth > measurements.clientWidth + 1,
          };
          results.push(record);
          await page.screenshot({ path: new URL(`${engine.name}-${name}-${theme}-${viewport.width}x${viewport.height}.png`, outputDirectory).pathname });
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

await writeFile(new URL("qa-results.json", outputDirectory), `${JSON.stringify(results, null, 2)}\n`);
const failures = results.filter((result) => result.overflow || result.resolvedTheme !== result.requestedTheme || !result.profileVisible);
console.log(JSON.stringify({
  baseUrl,
  screenshots: results.length + engines.reduce((total, engine) => total + engine.viewports.length * 2, 0),
  overflowFailures: results.filter((result) => result.overflow).length,
  hiddenProfileFailures: results.filter((result) => !result.profileVisible).length,
  outputDirectory: outputDirectory.pathname,
}));
if (failures.length) process.exitCode = 1;
