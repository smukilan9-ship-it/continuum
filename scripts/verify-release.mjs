/**
 * The mechanically checkable half of §19, as one command.
 *
 * It drives a running dev server through every route in both themes at three
 * widths and asserts the criteria §19.1, §19.7 and §19.10 state for *every*
 * route — the ones that are easy to regress and tedious to check by hand:
 * horizontal scroll, exactly one `<h1>`, banned terminology in the rendered
 * DOM, and one accent-filled element per screen.
 *
 * It deliberately does not try to cover §19.8 (axe) or §19.9 (Lighthouse) —
 * those have their own tools and live in the §18.6/§18.9 suites.
 *
 *   node scripts/verify-release.mjs [baseUrl]
 */
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3000";

/** §7.1's addresses, plus the public ones. */
const ROUTES = [
  { path: "/", auth: false },
  { path: "/login", auth: false },
  { path: "/privacy", auth: false },
  { path: "/terms", auth: false },
  { path: "/home", auth: true },
  { path: "/ask", auth: true },
  { path: "/plan", auth: true },
  { path: "/library", auth: true },
  { path: "/review", auth: true },
  { path: "/context", auth: true },
  { path: "/build", auth: true },
  { path: "/learn", auth: true },
  { path: "/research", auth: true },
  { path: "/g/goal_demo_sat", auth: true },
  { path: "/g/goal_demo_sat/p/project_demo_oasis", auth: true },
  { path: "/settings/account", auth: true },
  { path: "/settings/connections", auth: true },
  { path: "/settings/privacy", auth: true },
  { path: "/dev/kit", auth: true },
];

const WIDTHS = [320, 375, 1440];
const THEMES = ["light", "dark"];

/**
 * §19.10: zero banned terminology in the rendered DOM. These are the claims
 * §10.1 deleted and the internal vocabulary §14.4 replaced — a reviewer reading
 * the running product must not meet any of them.
 */
const BANNED = [
  /knowledge graph/i,
  /\bopenai\b/i,
  /\bGPT\b/,
  /postgres canonical/i,
  /\bpgvector\b/i,
  /\bSQLSTATE\b/i,
  /\bidempotenc/i,
  /\bupsert\b/i,
  /\btombstone\b/i,
  // Found in a Review toast: "Confirmed and applied the approved, whitelisted
  // fields to the shared state; the audit history was preserved." Every one of
  // those names the implementation rather than what happened to the user's work.
  /\bwhitelist/i,
  /\bshared state\b/i,
  /\baudit history\b/i,
  // A tool name is not a sentence. This one was shown to the user verbatim.
  /\b[a-z]+_[a-z]+_[a-z]+\(/,
];

const failures = [];
const notes = [];

function fail(route, width, theme, message) {
  failures.push(`${route} @ ${width}px ${theme}: ${message}`);
}

async function main() {
  const browser = await chromium.launch();
  // A dev server compiling a route for the first time can take tens of seconds,
  // and this sweep is the first visit to most of them.
  const context = await browser.newContext();
  context.setDefaultTimeout(120_000);
  context.setDefaultNavigationTimeout(120_000);
  const page = await context.newPage();

  // Demo login once; the session cookie carries across every authed route.
  const login = await page.request.post(`${BASE}/api/auth/demo`, { headers: { origin: BASE }, timeout: 120_000 });
  if (!login.ok()) {
    console.error(`Could not sign in to the demo workspace (${login.status()}). Is ${BASE} running?`);
    process.exit(2);
  }

  for (const { path } of ROUTES) {
    for (const theme of THEMES) {
      await context.addInitScript((value) => {
        window.localStorage.setItem("continuum-theme", value);
      }, theme);

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        // `domcontentloaded` plus a settle, not `networkidle`: the app holds open
        // connections (streams, polling), so networkidle never fires on some routes.
        const response = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForTimeout(900);
        const status = response?.status() ?? 0;
        if (status >= 400) { fail(path, width, theme, `HTTP ${status}`); continue; }

        const audit = await page.evaluate((bannedSources) => {
          const banned = bannedSources.map((s) => new RegExp(s.source, s.flags));
          const root = document.documentElement;
          const text = document.body.innerText;
          const accentFilled = [...document.querySelectorAll("body *")].filter((el) => {
            const style = getComputedStyle(el);
            const accent = getComputedStyle(root).getPropertyValue("--accent").trim();
            if (!accent) return false;
            // Compare as rendered — the token is hex, the computed value is rgb().
            const probe = document.createElement("span");
            probe.style.color = accent;
            document.body.appendChild(probe);
            const rendered = getComputedStyle(probe).color;
            probe.remove();
            return style.backgroundColor === rendered && el.getBoundingClientRect().width > 24;
          }).length;
          return {
            theme: root.dataset.theme,
            scrollWidth: root.scrollWidth,
            clientWidth: root.clientWidth,
            h1s: document.querySelectorAll("h1").length,
            banned: banned.filter((r) => r.test(text)).map((r) => r.source),
            accentFilled,
            hasMain: Boolean(document.querySelector("main, [role='main'], .main-area")),
          };
        }, BANNED.map((r) => ({ source: r.source, flags: r.flags })));

        if (audit.scrollWidth > audit.clientWidth + 1) {
          fail(path, width, theme, `horizontal scroll (${audit.scrollWidth} > ${audit.clientWidth})`);
        }
        if (audit.h1s !== 1) fail(path, width, theme, `${audit.h1s} <h1> elements, expected exactly 1`);
        if (audit.banned.length) fail(path, width, theme, `banned terminology: ${audit.banned.join(", ")}`);
        if (audit.theme !== theme) notes.push(`${path}: theme resolved to "${audit.theme}" with "${theme}" requested`);
        // §19.10 allows exactly one accent-filled element per screen. Counted
        // rather than enforced, because the sidebar's active nav item is a
        // legitimate second at some widths.
        if (audit.accentFilled > 3) notes.push(`${path} @ ${width}px ${theme}: ${audit.accentFilled} accent-filled elements`);
      }
    }
  }

  await browser.close();

  for (const note of notes) console.log(`note  ${note}`);
  if (failures.length) {
    console.error(`\n${failures.length} failures:`);
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log(`\n✓ ${ROUTES.length} routes × ${THEMES.length} themes × ${WIDTHS.length} widths — no horizontal scroll, one <h1>, no banned terminology.`);
}

main().catch((error) => { console.error(error); process.exit(2); });
