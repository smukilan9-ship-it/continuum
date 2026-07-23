import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseUrl = process.env.CONTINUUM_VISUAL_BASE_URL ?? "http://localhost:3000";
const outputDirectory = new URL("../docs/audit-screenshots/premium/", import.meta.url);
const sizes = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 375, height: 812 },
];
const routes = [
  ["today", "/"],
  ["plan", "/goals"],
  ["learn", "/learn"],
  ["code", "/code"],
  ["research", "/research"],
  ["memory", "/memory"],
  ["review", "/activity"],
  ["connections", "/integrations"],
];
const results = [];

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  for (const theme of ["light", "dark"]) {
    for (const viewport of sizes) {
      const context = await browser.newContext({ viewport, colorScheme: theme });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
      await page.evaluate((preference) => {
        window.localStorage.setItem("continuum-theme", preference);
      }, theme);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(350);
      await page.screenshot({ path: new URL(`login-${theme}-${viewport.width}x${viewport.height}.png`, outputDirectory).pathname });
      await page.getByRole("button", { name: /Explore the demo/ }).click();
      await page.waitForURL((url) => url.pathname === "/", { timeout: 30_000 });

      for (const [name, path] of routes) {
        await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
        if (path === "/integrations") await page.getByText("Featherless", { exact: true }).waitFor({ timeout: 15_000 });
        await page.waitForTimeout(400);
        const measurements = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          resolvedTheme: document.documentElement.dataset.theme,
          title: document.title,
        }));
        const record = { name, path, requestedTheme: theme, ...viewport, ...measurements, overflow: measurements.scrollWidth > measurements.clientWidth + 1 };
        results.push(record);
        await page.screenshot({ path: new URL(`${name}-${theme}-${viewport.width}x${viewport.height}.png`, outputDirectory).pathname });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await writeFile(new URL("qa-results.json", outputDirectory), `${JSON.stringify(results, null, 2)}\n`);
const failures = results.filter((result) => result.overflow || result.resolvedTheme !== result.requestedTheme);
console.log(JSON.stringify({ baseUrl, screenshots: results.length + (sizes.length * 2), overflowFailures: results.filter((result) => result.overflow).length, outputDirectory: outputDirectory.pathname }));
if (failures.length) process.exitCode = 1;
