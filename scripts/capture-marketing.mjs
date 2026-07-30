/**
 * Capture the six marketing screenshots required by redesign.md §10.5.
 *
 *   node scripts/capture-marketing.mjs                 # capture against a dev server
 *   node scripts/capture-marketing.mjs --placeholders  # regenerate the neutral placeholders
 *   node scripts/capture-marketing.mjs --only=plan-week,build-run
 *   node scripts/capture-marketing.mjs --headed
 *
 * Output: apps/web/public/marketing/{light,dark}/<name>.png
 *         1440x900 at deviceScaleFactor 2, so every file is 2880x1800 and the
 *         `width`/`height` constants in components/landing/product-shot.tsx stay
 *         correct. Do not change the viewport without changing those.
 *
 * Sign-in: `POST /api/auth/demo` issued from a page already on the origin, so the
 * request carries an Origin header (`sameOriginWrite`) and the session cookie
 * lands in the browser context. This is the same endpoint the login page's
 * "Explore the demo" button posts to — it is not an auth bypass. Requires a dev
 * server with DATABASE_URL set and `pnpm seed:demo` already run.
 *
 * ── SURFACES STILL LANDING ───────────────────────────────────────────────────
 * Two shots depend on UI that is being rebuilt concurrently and will not look
 * right — or will time out on `ready` — until it lands:
 *
 *   ask-inspector  §11.6 context inspector. Today the provenance surface is the
 *                  `<details class="assistant-used-context">` disclosure, which
 *                  this script expands as the closest available stand-in. Retake
 *                  once the inspector panel exists.
 *   study-check    §14.1 study rebuild + the `study_sessions` table (§16.11
 *                  migration 2). The goal Study tab renders today, but the
 *                  "unseen checkpoint" framing the marketing row describes is
 *                  part of that rebuild.
 *
 * `ask-cited` and `build-run` also improve with §11 and §14.3 respectively, but
 * both surfaces exist and capture correctly now.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const BASE_URL = (process.env.CONTINUUM_MARKETING_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OUTPUT_DIR = fileURLToPath(new URL("../apps/web/public/marketing/", import.meta.url));
const VIEWPORT = { width: 1440, height: 900 };
const SCALE = 2;
const THEMES = ["light", "dark"];

const args = process.argv.slice(2);
const placeholdersOnly = args.includes("--placeholders");
const headed = args.includes("--headed");
const only = args.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",").map((value) => value.trim()).filter(Boolean);

/**
 * @typedef {{
 *   name: string,
 *   path: string,
 *   ready: string,
 *   prepare?: (page: import("@playwright/test").Page) => Promise<void>,
 *   note?: string,
 * }} Shot
 */

/** @type {Shot[]} */
const SHOTS = [
  {
    name: "ask-cited",
    path: "/assistant",
    ready: ".assistant-message",
    async prepare(page) {
      await openFirstConversation(page);
      await page.locator(".assistant-used-context").first().waitFor({ state: "visible", timeout: 15_000 });
    },
  },
  {
    name: "ask-inspector",
    path: "/assistant",
    ready: ".assistant-message",
    note: "§11.6 inspector not built — expanding the provenance disclosure as a stand-in.",
    async prepare(page) {
      await openFirstConversation(page);
      const provenance = page.locator(".assistant-used-context").first();
      await provenance.waitFor({ state: "visible", timeout: 15_000 });
      await provenance.locator("summary").click();
      await page.waitForTimeout(400);
    },
  },
  {
    name: "goal-overview",
    // The OASIS research goal: four milestones, saved sources, evidence-linked claims.
    path: "/g/goal_demo_oasis",
    ready: ".goal-overview",
  },
  {
    name: "study-check",
    path: "/g/goal_demo_sat",
    ready: "[role='tab']",
    note: "§14.1 study rebuild outstanding — retake when the unseen checkpoint ships.",
    async prepare(page) {
      await page.getByRole("tab", { name: "Study" }).click();
      await page.waitForTimeout(600);
    },
  },
  {
    name: "build-run",
    path: "/code",
    ready: ".cm-content",
    async prepare(page) {
      await page.locator(".cm-content").click();
      await page.keyboard.type('primes = [n for n in range(2, 40) if all(n % d for d in range(2, n))]\nprint("primes under 40:", primes)');
      await page.getByRole("button", { name: /^Run/ }).first().click();
      // Pyodide boots on first run; give the worker room before shooting output.
      await page.waitForTimeout(12_000);
    },
  },
  {
    name: "plan-week",
    path: "/plan",
    ready: ".plan-screen, .week-board, main",
  },
];

async function openFirstConversation(page) {
  const conversation = page.locator(".assistant-session-open").first();
  if (await conversation.count()) {
    await conversation.click();
    await page.locator(".assistant-message").first().waitFor({ state: "visible", timeout: 20_000 });
  }
  await page.waitForTimeout(800);
}

/** The theme comes from localStorage (see the inline script in app/layout.tsx), not the OS. */
async function applyTheme(page, theme) {
  await page.evaluate((preference) => window.localStorage.setItem("continuum-theme", preference), theme);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme, { timeout: 15_000 });
}

async function signIn(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/auth/demo", { method: "POST", headers: { "content-type": "application/json" } });
    return { status: response.status, body: await response.text() };
  });
  if (result.status !== 200) {
    throw new Error(`Demo sign-in failed (${result.status}): ${result.body}\nStart the dev server with DATABASE_URL set and run \`pnpm seed:demo\`.`);
  }
  await page.goto(`${BASE_URL}/today`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell", { timeout: 30_000 });
}

/**
 * The neutral placeholder. Deliberately NOT a drawing of the product: §10.5
 * deletes the hand-built hero mockup because inventing UI is a form of
 * overclaiming, and a fabricated screenshot would be the same mistake. A flat
 * panel at the right size keeps `next/image` honest and CLS at zero until the
 * real capture replaces it byte for byte.
 */
function placeholderMarkup(name, theme) {
  const ink = theme === "dark" ? "#eceade" : "#1b1c16";
  const canvas = theme === "dark" ? "#17180f" : "#ffffff";
  const line = theme === "dark" ? "#2c2e24" : "#e2dfd2";
  const muted = theme === "dark" ? "#7e8175" : "#74776b";
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;height:100%}
    body{display:grid;place-items:center;gap:10px;align-content:center;background:${canvas};
      font:500 22px/1.4 ui-sans-serif,system-ui,sans-serif;color:${ink};
      box-shadow:inset 0 0 0 2px ${line}}
    small{font-size:15px;font-weight:400;color:${muted}}
  </style><body><div>${name}.png</div><small>Placeholder — replaced by scripts/capture-marketing.mjs</small></body>`;
}

async function writePlaceholders(browser) {
  for (const theme of THEMES) {
    await mkdir(`${OUTPUT_DIR}${theme}`, { recursive: true });
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
    const page = await context.newPage();
    for (const shot of SHOTS) {
      if (only && !only.includes(shot.name)) continue;
      await page.setContent(placeholderMarkup(shot.name, theme));
      await page.screenshot({ path: `${OUTPUT_DIR}${theme}/${shot.name}.png` });
      console.log(`  placeholder ${theme}/${shot.name}.png`);
    }
    await context.close();
  }
}

async function capture(browser) {
  const failures = [];
  for (const theme of THEMES) {
    await mkdir(`${OUTPUT_DIR}${theme}`, { recursive: true });
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, colorScheme: theme });
    const page = await context.newPage();
    await signIn(page);
    await applyTheme(page, theme);

    for (const shot of SHOTS) {
      if (only && !only.includes(shot.name)) continue;
      try {
        await page.goto(`${BASE_URL}${shot.path}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(shot.ready, { timeout: 45_000 });
        if (shot.prepare) await shot.prepare(page);
        // Settle: fonts, images, and any reveal transition.
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUTPUT_DIR}${theme}/${shot.name}.png` });
        console.log(`  captured ${theme}/${shot.name}.png${shot.note ? `  (${shot.note})` : ""}`);
      } catch (error) {
        failures.push(`${theme}/${shot.name}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
        console.error(`  FAILED ${theme}/${shot.name} — ${shot.note ?? "see error below"}`);
        console.error(`    ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
      }
    }
    await context.close();
  }
  return failures;
}

const browser = await chromium.launch({ headless: !headed });
try {
  if (placeholdersOnly) {
    console.log(`Writing placeholders to ${OUTPUT_DIR}`);
    await writePlaceholders(browser);
    console.log("Done. These are placeholders — run without --placeholders to capture the real product.");
  } else {
    console.log(`Capturing from ${BASE_URL} into ${OUTPUT_DIR}`);
    const failures = await capture(browser);
    if (failures.length) {
      console.error(`\n${failures.length} shot(s) did not capture:`);
      for (const failure of failures) console.error(`  ${failure}`);
      process.exitCode = 1;
    } else {
      console.log("\nAll six shots captured in both themes.");
    }
  }
} finally {
  await browser.close();
}
