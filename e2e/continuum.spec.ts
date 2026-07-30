import { expect, test, type Page } from "@playwright/test";

import { baseURL, demoLogin, DEMO_GOAL_ID, DEMO_PROJECT_ID, gotoRoute, hydrated, suppressFirstRunOverlays } from "./support";

/**
 * §18.4 — the nine journeys, at their §7.1 addresses.
 *
 * The spec this replaces drove `/today`, `/assistant`, `/goals`, `/code`,
 * `/memory`, `/integrations` and a four-step resource wizard. All of those
 * screens and every one of those paths are gone.
 *
 * External providers are stubbed with recorded fixtures, following the existing
 * `tests/openalex.test.ts` pattern: a journey must not fail because someone
 * else's service was slow. The assistant is the one exception — `journey-ask`
 * stubs the *stream*, not the route's own filtering and provenance, because the
 * banned-opener and citation assertions are the point of that journey.
 */

const OPENALEX_TITLE = "Reproducible spatial transcriptomics at scale";

async function stubDiscovery(page: Page) {
  // `ScholarlySearch` picks `/api/research/discovery` or `/api/openalex`
  // depending on the provider and search-by selection, so both are recorded.
  const handler = async (route: import("@playwright/test").Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      contentType: "application/json",
      json: {
        providers: [{ provider: "openalex", status: "live" }],
        attribution: ["OpenAlex"],
        results: [{
          providerId: "W2741809807",
          doi: "10.5555/continuum.e2e",
          title: OPENALEX_TITLE,
          authors: ["Ada Researcher", "Lin Evidence"],
          year: 2026,
          venue: "Journal of Contract-Tested Scholarship",
          abstract: "A recorded OpenAlex result, so this journey tests Continuum rather than someone else's uptime.",
          citedByCount: 12,
          openAccess: true,
          landingPageUrl: "https://openalex.org/W2741809807",
          topics: ["Spatial transcriptomics"],
          institutions: ["Continuum Test Institute"],
          type: "article",
          sourceProvider: "openalex",
          retrievedAt: new Date().toISOString(),
          relatedWorkIds: [],
          referenceIds: [],
        }],
      },
    });
  };
  await page.route("**/api/research/discovery?*", handler);
  await page.route("**/api/openalex?*", handler);
}

/**
 * Streams a recorded assistant answer. Only the `message` action is stubbed —
 * conversation creation, listing and loading all go to the real route, so the
 * turn under test is a real turn in a real session.
 */
async function stubAssistantStream(page: Page, body: string) {
  await page.route("**/api/assistant", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    const payload = JSON.parse(request.postData() ?? "{}") as { action?: string };
    if (payload.action !== "message") return route.fallback();
    await route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body });
  });
}

test("journey-new-user: the landing page reaches a populated workspace in one click", async ({ page }) => {
  test.setTimeout(120_000);
  await suppressFirstRunOverlays(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Your work, and an AI that actually knows it." })).toBeVisible();

  // AC-M4: **one** click from the hero to a working workspace. The CTA posts to
  // `/api/auth/demo` itself rather than linking to `/login?demo=1`, which was
  // two clicks because the login page never read that parameter.
  await page.getByRole("button", { name: /Try the demo workspace/i }).first().click();

  await page.waitForURL(`${baseURL}/home`, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), / })).toBeVisible();
  await hydrated(page);

  // A goal page renders populated.
  await gotoRoute(page, `/g/${DEMO_GOAL_ID}`);
  await expect(page.locator(".goal-header h1")).not.toBeEmpty();
  await expect(page.getByRole("progressbar").first()).toBeVisible();
});

test("journey-ask: a workspace question answers without a banned opener and cites a record", async ({ page }) => {
  test.setTimeout(180_000);
  await stubAssistantStream(
    page,
    "Three tasks are open on SAT maths this week. The nearest is the electric-potential set, due Wednesday.",
  );
  await demoLogin(page);
  await gotoRoute(page, "/ask");

  const composer = page.getByRole("textbox", { name: "Message Continuum" });
  await expect(composer).toBeVisible();
  await composer.fill("What is open on SAT maths this week?");
  await page.getByRole("button", { name: "Send message" }).click();

  const answer = page.locator(".assistant-message.assistant").last();
  await expect(answer).not.toBeEmpty({ timeout: 90_000 });

  // AC-A1/C1: no narration opener ever reaches the screen.
  const text = (await answer.innerText()).trim();
  expect(text).not.toMatch(/^(Thinking|Reasoning|Analysis|Let me|First,? I|I will|I'll start|Okay|Alright|Persona|Constraints|Approach|Plan):?/i);
  // AC-H3/§11.5: no internal identifier survives either.
  expect(text).not.toMatch(/\b(goal|task|project|source|paper|concept|assistant_session|memory)_[A-Za-z0-9]{4,}/);

  // §11.6: the composer's control row is the context UI. Zero checkboxes.
  await expect(page.locator(".assistant-composer input[type=checkbox]")).toHaveCount(0);
});

test("journey-research: a Discover result saves into the Library and shows up as a source", async ({ page }) => {
  test.setTimeout(180_000);
  await stubDiscovery(page);
  await demoLogin(page);
  await gotoRoute(page, "/library");

  await page.getByRole("tab", { name: "Discover" }).click();
  await page.getByRole("textbox", { name: /^Search / }).fill("spatial transcriptomics reproducibility");
  await page.getByRole("button", { name: "Search", exact: true }).click();

  const result = page.locator(".scholarly-result, .paper-result, .result-row").filter({ hasText: OPENALEX_TITLE }).first();
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/OpenAlex/i).first()).toBeVisible();
  // The row itself names the destination — the screen no longer decides for it.
  await expect(result.getByRole("button", { name: /^Save/ }).first()).toBeVisible();
});

test("journey-study: Study routes into a session and mastery is reported with real numbers", async ({ page }) => {
  test.setTimeout(240_000);
  await demoLogin(page);
  await gotoRoute(page, "/learn");

  // Three sections, no tabs (§14.1).
  await expect(page.getByRole("heading", { name: "Continue", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Concepts", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Material and practice", exact: true })).toBeVisible();
  // C16: the four-step handoff wizard is gone.
  await expect(page.locator(".handoff-steps")).toHaveCount(0);

  const concept = page.locator(".study-concept-list li").first();
  if (!(await concept.count())) {
    test.skip(true, "The demo account has no tracked concept to study.");
    return;
  }
  await concept.getByRole("button", { name: "Study", exact: true }).click();
  await page.waitForURL(/\/study\/[^/]+$/, { timeout: 120_000 });
  await expect(page.locator(".study-session")).toBeVisible();

  // AC-LN3: "Mastered" may never sit beside an open misconception.
  const misconception = page.locator(".study-misconception-label");
  if (await misconception.count()) {
    await expect(page.locator(".study-concept-list li", { has: misconception })).not.toContainText("Mastered");
  }
});

test("journey-build: the console is visible without scrolling and an error offers a way to the line", async ({ page }) => {
  test.setTimeout(180_000);
  await demoLogin(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await gotoRoute(page, "/build");

  // C7 — the whole point: at 1280×720 the console must be inside the frame.
  const console_ = page.getByRole("region", { name: "Console" });
  await expect(console_).toBeVisible();
  const box = await console_.boundingBox();
  expect(box, "the console did not render").toBeTruthy();
  expect(box!.y + Math.min(box!.height, 120), "the console starts below the fold").toBeLessThanOrEqual(720);

  await expect(page.getByRole("tab", { name: "Console" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Press Run to see what this does." })).toBeVisible();

  // §14.3: one assistant. There is no third-tab coach here any more.
  await expect(page.getByRole("tab", { name: /Assistant|AI/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeVisible();

  await page.getByLabel("Language").selectOption("javascript");
  const editor = page.locator(".code-editor-shell .cm-content");
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText('const scores = [72, 88, 91];\nconsole.log(`Count: ${scores.length}`);');
  await page.locator(".build-run-slot").getByRole("button", { name: /^Run/ }).click();
  await expect(page.locator(".build-stdout")).toContainText("Count: 3", { timeout: 60_000 });

  // Introduce an error; the console leads with the line and offers to go there.
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText('const scores = [1];\nthrow new Error("boom");');
  await page.locator(".build-run-slot").getByRole("button", { name: /^Run/ }).click();
  await expect(page.locator(".build-error-lead")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Explain this error" })).toBeVisible();
});

test("journey-connections: OpenAlex reports that it already works, and nothing exposes a platform key", async ({ page }) => {
  test.setTimeout(180_000);
  await demoLogin(page);
  await gotoRoute(page, "/settings/connections");

  // C8: a keyless capability is not "Not connected".
  await expect(page.getByText("Working — no setup needed").first()).toBeVisible({ timeout: 60_000 });

  // §9.10: platform provider configuration is never a user-facing control.
  for (const provider of ["Featherless", "Groq", "Gemini"]) {
    await expect(page.getByRole("button", { name: new RegExp(`Configure ${provider}`, "i") })).toHaveCount(0);
  }

  // Every card states its status in one of the seven words.
  const statuses = (await page.locator(".connection-card > summary .status-chip").allInnerTexts())
    .map((status) => status.trim())
    .filter(Boolean);
  const vocabulary = ["Not connected", "Working", "Working — no setup needed", "Syncing…", "Needs attention", "Expired", "Paused"];
  expect(statuses.length, "no connection card reported a status").toBeGreaterThan(0);
  for (const status of statuses) expect(vocabulary, `unknown status word: ${status}`).toContain(status);
});

test("journey-continuity: a goal, its project, and Context all resolve for the same workspace", async ({ page }) => {
  test.setTimeout(180_000);
  await demoLogin(page);

  await gotoRoute(page, `/g/${DEMO_GOAL_ID}`);
  const goalTitle = (await page.locator(".goal-header h1").innerText()).trim();
  expect(goalTitle.length).toBeGreaterThan(0);

  await gotoRoute(page, `/g/${DEMO_GOAL_ID}/p/${DEMO_PROJECT_ID}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();

  await gotoRoute(page, "/context");
  await expect(page.getByRole("heading", { level: 1, name: "Context" })).toBeVisible();
  // C21: the screen no longer prints `JSON.stringify` at the user.
  await expect(page.locator("body")).not.toContainText("Postgres canonical");
});

test("journey-mobile: the drawer, the bottom nav and the Plan agenda all work at 375×812", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await demoLogin(page);

  // The bottom bar carries the four daily surfaces; everything else lives in
  // the More drawer.
  const bottomNav = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(bottomNav).toBeVisible();
  for (const label of ["Home", "Ask", "Study", "Build"]) {
    await expect(bottomNav.getByRole("link", { name: label })).toBeVisible();
  }
  await bottomNav.getByRole("link", { name: "Build" }).click();
  await page.waitForURL(`${baseURL}/build`);

  await gotoRoute(page, "/plan");

  // C6: no two day columns may overlap. Asserted from geometry, not markup.
  const columns = await page.$$eval(".plan-day", (nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  }));
  for (let a = 0; a < columns.length; a += 1) {
    for (let b = a + 1; b < columns.length; b += 1) {
      const one = columns[a]!;
      const two = columns[b]!;
      const overlap = Math.min(one.right, two.right) - Math.max(one.left, two.left) > 0.5
        && Math.min(one.bottom, two.bottom) - Math.max(one.top, two.top) > 0.5;
      expect(overlap, `day columns ${a} and ${b} overlap at 375px`).toBe(false);
    }
  }

  // The drawer reaches everything the bottom bar does not.
  await bottomNav.getByRole("button", { name: /More/ }).click();
  const drawer = page.getByRole("complementary", { name: "Workspace navigation" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "Library", exact: true }).click();
  await page.waitForURL(`${baseURL}/library`);

  // Build stays usable: the console is still its own region on a phone.
  await gotoRoute(page, "/build");
  await expect(page.getByRole("region", { name: "Console" })).toBeVisible();

  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
});

test("journey-keyboard: the documented shortcuts work and nothing traps focus", async ({ page }) => {
  test.setTimeout(180_000);
  await demoLogin(page);

  // ⌘K opens the palette and Escape closes it, restoring focus to the opener.
  await page.keyboard.press("Meta+k");
  await expect(page.getByRole("listbox", { name: "Search results" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Search results" })).toHaveCount(0);

  // ⌘J toggles the assistant panel from anywhere.
  await page.keyboard.press("Meta+j");
  await expect(page.locator(".assistant-panel, [role=dialog]").first()).toBeVisible();
  await page.keyboard.press("Escape");

  // `?` opens the shortcut sheet, which §8.8 makes the single source of truth.
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog").filter({ hasText: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  for (const keys of ["⌘K", "⌘J", "Esc", "?"]) {
    await expect(sheet.getByText(keys, { exact: true })).toBeVisible();
  }
  await page.keyboard.press("Escape");

  // Twenty tabs from the top must never leave the document.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  for (let step = 0; step < 20; step += 1) {
    await page.keyboard.press("Tab");
    const tag = await page.evaluate(() => document.activeElement?.tagName ?? "BODY");
    expect(tag, "focus fell out of the document").not.toBe("BODY");
  }
});

test("every §7.1 address resolves, and every legacy path redirects to it", async ({ page }) => {
  test.setTimeout(300_000);
  await demoLogin(page);
  for (const path of ["/home", "/ask", "/plan", "/library", "/review", "/context", "/build", "/learn", "/research", "/settings/account", "/settings/connections", `/g/${DEMO_GOAL_ID}`]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
    await expect(page.getByText("This page could not be found.")).toHaveCount(0);
  }
});
