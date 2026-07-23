import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

async function demoLogin(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Explore the demo/ }).click();
  await expect(page).toHaveURL(`${baseURL}/`);
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening), .+\.$/i })).toBeVisible();
  await page.waitForFunction(() => {
    const shell = document.querySelector(".app-shell");
    return Boolean(shell && Object.keys(shell).some((key) => key.startsWith("__reactFiber$")));
  });
}

function base64url(value: Buffer) {
  return value.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function rpcJson(raw: string) {
  const json = raw.includes("data:")
    ? raw.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("")
    : raw;
  return JSON.parse(json) as Record<string, unknown>;
}

async function readCurrentWeekThroughMcp(page: Page) {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const redirectUri = "http://127.0.0.1:3000/callback";
  const resourceOrigin = new URL(baseURL);
  if (resourceOrigin.hostname === "127.0.0.1") resourceOrigin.hostname = "localhost";
  const resource = `${resourceOrigin.origin}/api/mcp`;
  const registration = await page.request.post("/api/oauth/register", {
    data: {
      client_name: "Continuum Playwright",
      redirect_uris: [redirectUri],
      scope: "memory:read",
    },
  });
  expect(registration.status()).toBe(201);
  const { client_id: clientId } = await registration.json() as { client_id: string };

  const authorization = await page.request.post("/api/oauth/authorize", {
    headers: { origin: baseURL, "content-type": "application/x-www-form-urlencoded" },
    data: new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state: "playwright",
      code_challenge: challenge,
      resource,
      decision: "approve",
      scope: "memory:read",
    }).toString(),
    maxRedirects: 0,
  });
  expect(authorization.status()).toBe(303);
  const code = new URL(authorization.headers().location).searchParams.get("code");
  expect(code).toBeTruthy();

  const tokenResponse = await page.request.post("/api/oauth/token", {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    data: new URLSearchParams({
      grant_type: "authorization_code",
      code: code!,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      resource,
    }).toString(),
  });
  expect(tokenResponse.ok()).toBeTruthy();
  const { access_token: accessToken } = await tokenResponse.json() as { access_token: string };

  let rpcId = 0;
  const rpc = async (method: string, params: Record<string, unknown>) => {
    const response = await page.request.post("/api/mcp", {
      headers: {
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "mcp-protocol-version": "2025-06-18",
      },
      data: { jsonrpc: "2.0", id: ++rpcId, method, params },
    });
    expect(response.ok()).toBeTruthy();
    return rpcJson(await response.text());
  };

  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "playwright", version: "1" } });
  return rpc("tools/call", { name: "get_context_pack", arguments: { packId: "current_week", maxTokens: 4000 } });
}

test.describe.serial("Continuum primary journeys", () => {
  test("demo login, Learn lesson, checkpoint, and video recommendation", async ({ page }) => {
    await page.route("**/api/learning/videos?*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        json: {
          status: "live",
          note: "Official YouTube Data API response normalized by Continuum (contract fixture).",
          handoffUrl: "https://www.youtube.com/results?search_query=electric+potential",
          videos: [{
            id: "fixture42",
            title: "Electric Potential: A Visual Explanation",
            channelTitle: "Trusted Physics Classroom",
            description: "A provider-contract fixture for the UI journey.",
            publishedAt: "2025-01-15T00:00:00.000Z",
            watchUrl: "https://www.youtube.com/watch?v=fixture42",
            embedUrl: "https://www.youtube-nocookie.com/embed/fixture42",
            provider: "youtube",
            reviewState: "provider_result",
          }],
        },
      });
    });
    await demoLogin(page);
    await page.getByRole("link", { name: "Learn", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Know what to learn next—and why." })).toBeVisible();

    await page.getByRole("button", { name: "Open 6-min lesson" }).click();
    await expect(page.getByText("TARGETED MICRO-LESSON")).toBeVisible();
    await page.getByRole("button", { name: "I can explain the contrast" }).click();
    await page.getByPlaceholder("Answer in volts").fill("24");
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.getByText("Transfer checkpoint passed")).toBeVisible();

    await page.locator(".native-lesson-screen header").getByRole("button", { name: "Learning home" }).click();
    await page.getByRole("button", { name: "Search videos" }).click();
    await expect(page.getByText("YouTube: live")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Electric Potential: A Visual Explanation" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Watch on YouTube" })).toHaveAttribute("href", /youtube\.com\/watch/);
  });

  test("Code Lab runs real JavaScript, separates AI feedback, persists navigation, and exposes an update through MCP", async ({ page }) => {
    const checkpointMarker = `Playwright runtime evidence ${Date.now()}`;
    await page.route("**/api/code", async (route) => {
      await route.fulfill({
        contentType: "text/plain; charset=utf-8",
        body: "The actual runtime selected four scores at the supplied cutoff. The filter keeps each score greater than or equal to 80; the program output and the passing sample test agree.",
      });
    });
    await demoLogin(page);
    await page.getByRole("link", { name: "Code", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Write it. Run it. Understand why it works." })).toBeVisible();
    await page.getByLabel("Language").selectOption("javascript");
    await page.locator(".studio-toolbar-actions").getByRole("button", { name: /^Run/ }).click();
    await expect(page.getByRole("tab", { name: /Tests 1\/1/ })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Output" }).click();
    await expect(page.getByText("Program output", { exact: true })).toBeVisible();
    await expect(page.locator(".runtime-result pre")).toContainText("Selected: 88, 91, 85");
    await expect(page.locator(".runtime-result pre")).toContainText("Count: 3");

    await page.getByRole("tab", { name: "AI feedback" }).click();
    await page.getByRole("button", { name: "Explain", exact: true }).click();
    await page.getByRole("button", { name: "Submit for feedback" }).click();
    await expect(page.locator(".coach-markdown")).toContainText("actual runtime selected four scores");
    await expect(page.getByText("AI feedback is separate from program output")).toBeVisible();

    await page.getByRole("button", { name: "Save checkpoint" }).click();
    await page.getByLabel("What did you learn?").fill(checkpointMarker);
    await page.getByLabel("What will you do next?").fill("Run a boundary-value test at the cutoff.");
    await page.getByRole("button", { name: "Save to memory" }).click();
    await expect(page.getByRole("status")).toContainText("Coding checkpoint saved");

    await page.getByRole("link", { name: "Learn", exact: true }).click();
    await page.getByRole("link", { name: "Code", exact: true }).click();
    await page.getByRole("tab", { name: "Output" }).click();
    await expect(page.locator(".runtime-result pre")).toContainText("Count: 3");
    await page.getByRole("tab", { name: "AI feedback" }).click();
    await expect(page.locator(".coach-markdown")).toContainText("actual runtime selected four scores");

    const packResponse = await readCurrentWeekThroughMcp(page);
    expect(JSON.stringify(packResponse)).toContain(checkpointMarker);

    await page.getByLabel("Language").selectOption("sql");
    await page.locator(".studio-toolbar-actions").getByRole("button", { name: /^Run/ }).click();
    await expect(page.getByRole("tab", { name: /Tests.*1\/1/ })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Output" }).click();
    await expect(page.locator(".sql-result")).toContainText("Asha");
    await expect(page.locator(".sql-result")).toContainText("Meera");
  });

  test("Plan drafts a deterministic week and requires confirmation", async ({ page }) => {
    await demoLogin(page);
    await page.getByRole("link", { name: "Plan", exact: true }).click();
    await expect(page.getByRole("heading", { name: "A week that respects real life." })).toBeVisible();
    await expect(page.getByLabel("Seven day plan")).toBeVisible();
    await page.getByRole("button", { name: "Draft my week" }).click();
    await expect(page.getByText("DRAFT — NOT CURRENT YET")).toBeVisible();
    await expect(page.getByText("Confirmation required")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm and commit" })).toBeEnabled();
    await page.getByRole("button", { name: "Discard draft" }).click();
    await expect(page.getByText("DRAFT — NOT CURRENT YET")).toHaveCount(0);
  });

  test("Research discovers an OpenAlex contract result and saves real provider provenance", async ({ page }) => {
    const title = `OpenAlex evidence contract ${Date.now()}`;
    await page.route("**/api/research/discovery?*", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({
        contentType: "application/json",
        json: {
          providers: [{ provider: "openalex", status: "live" }, { provider: "crossref", status: "unconfigured", message: "Not requested by this fixture" }],
          scholarHandoffUrl: "https://scholar.google.com/scholar?q=spatial+transcriptomics",
          attribution: ["OpenAlex"],
          results: [{
            providerId: `W${Date.now()}`,
            doi: `10.5555/playwright.${Date.now()}`,
            title,
            authors: ["Ada Researcher", "Lin Evidence"],
            year: 2026,
            venue: "Journal of Contract-Tested Scholarship",
            abstract: "A normalized OpenAlex contract result used to verify the browser workflow without requiring a local provider credential.",
            citedByCount: 12,
            openAccess: true,
            landingPageUrl: "https://openalex.org/W2741809807",
            topics: ["Spatial transcriptomics", "Reproducible research"],
            institutions: ["Continuum Test Institute"],
            type: "article",
            sourceProvider: "openalex",
            retrievedAt: new Date().toISOString(),
            relatedWorkIds: [],
            referenceIds: [],
          }],
        },
      });
    });
    await demoLogin(page);
    await page.getByRole("link", { name: "Research", exact: true }).click();
    await page.getByRole("button", { name: "Discovery", exact: true }).click();
    await page.getByLabel("Query").fill("spatial transcriptomics reproducibility");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("OpenAlex: live")).toBeVisible();
    const result = page.locator(".paper-result").filter({ hasText: title });
    await expect(result).toBeVisible();
    await result.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(/Paper saved|already saved/i);
    await page.getByRole("button", { name: /Papers/ }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  });

  test("Memory opens a token-bounded MCP context pack", async ({ page }) => {
    await demoLogin(page);
    await page.getByRole("link", { name: "Memory", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your academic state, ready when it matters." })).toBeVisible();
    await page.getByRole("button", { name: "Context packs" }).click();
    await page.getByRole("button", { name: /Current week/ }).click();
    await expect(page.locator(".context-pack-detail").getByRole("heading", { name: "Current week" })).toBeVisible();
    await expect(page.getByText("MCP: get_context_pack")).toBeVisible();
    await expect(page.locator(".context-pack-policy")).toContainText("full event history");
  });

  test("mobile bottom navigation and More drawer reach every primary surface without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await demoLogin(page);
    const bottomNav = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(bottomNav).toBeVisible();
    await bottomNav.getByRole("link", { name: "Learn" }).click();
    await expect(page).toHaveURL(`${baseURL}/learn`);
    await bottomNav.getByRole("button", { name: "More" }).click();
    const drawer = page.getByRole("complementary", { name: "Workspace navigation" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Research", exact: true }).click();
    await expect(page).toHaveURL(`${baseURL}/research`);
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
});
