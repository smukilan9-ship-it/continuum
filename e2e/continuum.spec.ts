import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

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
  const redirectUri = `${baseURL}/callback`;
  const resourceOrigin = new URL(baseURL);
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

  const returnUrl = page.url();
  const authorizationQuery = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state: "playwright",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource,
    scope: "memory:read",
  });
  await page.goto(`/api/oauth/authorize?${authorizationQuery}`);
  await expect(page.getByRole("heading", { name: /Allow Continuum Playwright to connect/ })).toBeVisible();
  await page.getByRole("button", { name: "Approve and connect" }).click();
  await page.waitForURL(/\/callback\?code=/);
  await page.waitForLoadState("domcontentloaded");
  const code = new URL(page.url()).searchParams.get("code");
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
  await page.goto(returnUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Write it. Run it. Understand why it works." })).toBeVisible();

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
  const result = await rpc("tools/call", { name: "get_context_pack", arguments: { packId: "current_week", maxTokens: 4000 } });
  const cleanup = await page.request.post("/api/integrations", {
    headers: { origin: baseURL },
    data: { action: "revoke_mcp_client", clientId },
  });
  expect(cleanup.ok()).toBeTruthy();
  return result;
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
    await expect(page.getByRole("heading", { name: "What will move your learning forward?" })).toBeVisible();

    await page.getByRole("button", { name: "Open 6-min lesson" }).click();
    await expect(page.getByText("TARGETED MICRO-LESSON")).toBeVisible();
    const readLesson = page.getByRole("button", { name: "I can explain the contrast" });
    if (await readLesson.count()) await readLesson.click();
    await page.getByPlaceholder("Answer in volts").fill("24");
    await page.reload();
    await expect(page.getByText("TARGETED MICRO-LESSON")).toBeVisible();
    await expect(page.getByPlaceholder("Answer in volts")).toHaveValue("24");
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.getByText("Transfer checkpoint passed")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Transfer checkpoint passed")).toBeVisible();

    await page.locator(".native-lesson-screen header").getByRole("button", { name: "Learning home" }).click();
    await page.getByRole("button", { name: "Search videos" }).click();
    await expect(page.getByText("YouTube: live")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Electric Potential: A Visual Explanation" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Watch on YouTube" })).toHaveAttribute("href", /youtube\.com\/watch/);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Electric Potential: A Visual Explanation" })).toBeVisible();
  });

  test("Learn preserves resource choices and evidence through refresh, reranks feedback, and restores verified completion", async ({ page }) => {
    await demoLogin(page);
    await page.getByRole("link", { name: "Learn", exact: true }).click();
    await page.getByRole("button", { name: /Find a resource/ }).first().click();
    await page.getByLabel("What are you trying to learn or finish?").fill("electric potential and potential energy");
    await page.getByRole("button", { name: /Learn a concept/ }).click();
    const recommendationRequest = page.waitForRequest((request) => request.url().includes("/api/resources?") && request.url().includes("topic=electric"));
    await page.getByRole("button", { name: "Find my best match" }).click();
    const recommendationUrl = new URL((await recommendationRequest).url());
    expect(recommendationUrl.searchParams.get("goalType")).toBe("school");
    expect(recommendationUrl.searchParams.get("goalId")).toBe(null);
    await expect(page.getByRole("heading", { name: "Charges and Fields" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Charges and Fields" })).toBeVisible();
    await page.getByRole("button", { name: "Find a different resource" }).click();
    await page.getByRole("button", { name: "I want a different format" }).click();
    await page.getByRole("button", { name: "Textbook" }).click();
    await page.getByLabel("Anything else? Optional").fill("Prefer the official CBSE source.");
    await page.getByRole("button", { name: "Find another match" }).click();
    await expect(page.locator(".preference-change")).toContainText("prefer Textbook");
    await expect(page.getByRole("heading", { name: /NCERT Physics XII/ })).toBeVisible();

    await page.getByRole("button", { name: "Start resource" }).click();
    await expect(page.getByText("Your place is saved")).toBeVisible();
    await page.getByLabel("Notes from the activity (optional)").fill("Completed the worked example without copying.");
    await page.reload();
    await expect(page.getByRole("heading", { name: /NCERT Physics XII/ })).toBeVisible();
    await expect(page.getByLabel("Notes from the activity (optional)")).toHaveValue("Completed the worked example without copying.");
    await page.getByRole("button", { name: /I’m back/ }).click();
    await expect(page.getByText("Show what you completed")).toBeVisible();
    await page.getByLabel("Your answer").fill("24");
    await page.getByRole("button", { name: "Check progress" }).click();
    await expect(page.getByRole("heading", { name: "Progress verified" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Progress verified" })).toBeVisible();
    await page.getByRole("button", { name: "Continue learning" }).click();
    await expect(page.getByRole("heading", { name: "What will move your learning forward?" })).toBeVisible();
  });

  test("Code Lab runs real JavaScript, separates AI feedback, persists navigation, and exposes an update through MCP", async ({ page }) => {
    const checkpointMarker = `Playwright runtime evidence ${Date.now()}`;
    const feedbackRequests: Array<{ history?: unknown[]; prompt?: string }> = [];
    await page.route("**/api/code", async (route) => {
      feedbackRequests.push(JSON.parse(route.request().postData() ?? "{}") as { history?: unknown[]; prompt?: string });
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
    await expect(page.getByRole("tab", { name: "Output" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".runtime-result h3", { hasText: "Output" })).toBeVisible();
    await expect(page.locator(".runtime-result pre")).toContainText("Selected: 88, 91, 85");
    await expect(page.locator(".runtime-result pre")).toContainText("Count: 3");
    await page.getByRole("button", { name: "Check sample" }).click();
    await expect(page.locator(".runtime-result")).toContainText("passed 1 of 1 tests");

    await page.getByRole("tab", { name: /AI tutor/ }).click();
    await page.getByRole("button", { name: "Explain my code", exact: true }).click();
    await page.getByRole("button", { name: "Get feedback" }).click();
    await expect(page.locator(".coach-markdown")).toContainText("actual runtime selected four scores");
    await expect(page.getByText("Get feedback only when you ask")).toBeVisible();
    await page.getByLabel("Continue the conversation").fill("Which edge case should I try next?");
    await page.getByRole("button", { name: "Get feedback" }).click();
    await expect(page.locator(".code-message.user").last()).toContainText("Which edge case should I try next?");
    expect(feedbackRequests).toHaveLength(2);
    expect(feedbackRequests[1]?.history).toHaveLength(2);

    await page.getByRole("button", { name: "Save checkpoint" }).click();
    await page.getByLabel("What did you learn?").fill(checkpointMarker);
    await page.getByLabel("What will you do next?").fill("Run a boundary-value test at the cutoff.");
    await page.getByRole("button", { name: "Save to memory" }).click();
    await expect(page.getByRole("status")).toContainText("Coding checkpoint saved");

    await page.getByRole("link", { name: "Learn", exact: true }).click();
    await page.getByRole("link", { name: "Code", exact: true }).click();
    await page.getByRole("tab", { name: "Output" }).click();
    await expect(page.locator(".runtime-result pre")).toContainText("Count: 3");
    await page.getByRole("tab", { name: /AI tutor/ }).click();
    await expect(page.locator(".code-conversation")).toContainText("Which edge case should I try next?");

    const packResponse = await readCurrentWeekThroughMcp(page);
    expect(JSON.stringify(packResponse)).toContain(checkpointMarker);

    await page.getByLabel("Language").selectOption("sql");
    await page.locator(".studio-toolbar-actions").getByRole("button", { name: /^Run/ }).click();
    await expect(page.locator(".sql-result")).toContainText("Asha");
    await page.getByRole("button", { name: "Check sample" }).click();
    await expect(page.locator(".runtime-result")).toContainText("passed 1 of 1 tests");
    await page.getByRole("tab", { name: "Output" }).click();
    await expect(page.locator(".sql-result")).toContainText("Asha");
    await expect(page.locator(".sql-result")).toContainText("Meera");
  });

  test("Python execution is direct, stoppable, and accepts a checked local file", async ({ page }) => {
    let aiRequests = 0;
    await page.route("**/api/code", async (route) => {
      aiRequests += 1;
      await route.fulfill({
        contentType: "text/plain; charset=utf-8",
        body: "This program prints the supplied name. The runtime result confirms that the input and output path work.",
      });
    });
    const setEditor = async (source: string) => {
      const editor = page.locator(".code-editor-shell .cm-content");
      await editor.click();
      await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      await page.keyboard.insertText(source);
    };

    await demoLogin(page);
    await page.getByRole("link", { name: "Code", exact: true }).click();
    await page.getByLabel("Language").selectOption("python");

    await setEditor('print("Hello, world!")');
    await page.getByLabel("Program input").fill("");
    await page.locator(".studio-toolbar-actions").getByRole("button", { name: /^Run/ }).click();
    await expect(page.locator(".runtime-result pre")).toContainText("Hello, world!", { timeout: 45_000 });
    await expect(page.locator(".runtime-result")).toContainText("exit code 0");
    expect(aiRequests).toBe(0);

    await setEditor('name = input()\nprint(f"Hello, {name}")');
    await page.getByLabel("Program input").fill("Asha");
    await page.locator(".studio-toolbar-actions").getByRole("button", { name: /^Run/ }).click();
    await expect(page.locator(".runtime-result pre")).toContainText("Hello, Asha");

    await setEditor("print(");
    await page.locator(".studio-toolbar-actions").getByRole("button", { name: /^Run/ }).click();
    await expect(page.locator(".runtime-result")).toContainText("Compiler error");
    await expect(page.locator(".runtime-stderr")).toContainText("SyntaxError");

    await setEditor("print(1 / 0)");
    await page.locator(".studio-toolbar-actions").getByRole("button", { name: /^Run/ }).click();
    await expect(page.locator(".runtime-result")).toContainText("Runtime error");
    await expect(page.locator(".runtime-stderr")).toContainText("ZeroDivisionError");

    await setEditor("while True:\n    pass");
    await page.locator(".studio-toolbar-actions").getByRole("button", { name: /^Run/ }).click();
    await page.locator(".studio-toolbar-actions").getByRole("button", { name: "Stop" }).click();
    await expect(page.locator(".runtime-result")).toContainText("Stopped");
    await expect(page.locator(".runtime-result")).toContainText("terminated");

    await page.getByRole("button", { name: "Import file" }).click();
    const fileInput = page.getByLabel("Choose a code file");
    await fileInput.setInputFiles({ name: "uploaded.py", mimeType: "text/x-python", buffer: Buffer.from('print("From file")\\n') });
    await expect(page.getByText("uploaded.py", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "View code in editor" }).click();
    await expect(page.getByLabel("File name")).toHaveValue("uploaded.py");

    await page.getByRole("button", { name: "Import file" }).click();
    await fileInput.setInputFiles({ name: "not-python.txt", mimeType: "text/plain", buffer: Buffer.from("not Python") });
    await expect(page.getByRole("alert")).toContainText("Python");
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "Import file" }).click();
    await fileInput.setInputFiles({ name: "imported.ts", mimeType: "text/plain", buffer: Buffer.from('console.log("From TypeScript")\n') });
    await page.getByRole("button", { name: "View code in editor" }).click();
    await expect(page.getByLabel("Language")).toHaveValue("typescript");
    await page.locator(".studio-toolbar-actions").getByRole("button", { name: /^Run/ }).click();
    await expect(page.locator(".runtime-result pre")).toContainText("From TypeScript");

    await page.getByRole("button", { name: "Import file" }).click();
    await fileInput.setInputFiles({ name: "Main.java", mimeType: "text/plain", buffer: Buffer.from('class Main { public static void main(String[] args) { System.out.println("Hello"); } }') });
    await page.getByRole("button", { name: "View code in editor" }).click();
    await expect(page.getByLabel("Language")).toHaveValue("java");
    await expect(page.locator(".studio-toolbar-actions").getByRole("button", { name: /^Run/ })).toBeDisabled();

    await page.getByRole("button", { name: "AI help" }).click();
    await page.getByRole("button", { name: "Explain my code" }).click();
    await page.getByRole("button", { name: "Get feedback" }).click();
    await expect(page.locator(".code-conversation")).toContainText("runtime result confirms");
    expect(aiRequests).toBe(1);
  });

  test("Plan drafts a deterministic week and requires confirmation", async ({ page }) => {
    await demoLogin(page);
    await page.getByRole("link", { name: "Plan", exact: true }).click();
    await expect(page.getByRole("heading", { name: "A week that respects real life." })).toBeVisible();
    await expect(page.getByLabel("Seven day plan")).toBeVisible();
    await page.getByRole("button", { name: "Build my week" }).click();
    await expect(page.getByRole("dialog", { name: "Build a realistic weekly schedule" })).toBeVisible();
    await page.getByRole("button", { name: "Generate editable draft" }).click();
    await expect(page.getByRole("heading", { name: "Here is a realistic first draft." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save final schedule" })).toBeEnabled();
    await page.getByRole("button", { name: "Add block" }).click();
    await expect(page.getByRole("dialog", { name: "Add a study block" })).toBeVisible();
    await page.getByLabel("Title").fill("Playwright editable block");
    await page.getByRole("button", { name: "Add block" }).click();
    await expect(page.getByText("Playwright editable block")).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
    await page.getByRole("button", { name: "Discard draft" }).click();
    await expect(page.getByRole("dialog", { name: "Discard this schedule draft?" })).toBeVisible();
    await page.getByRole("button", { name: "Discard draft" }).click();
    await expect(page.getByRole("heading", { name: "Here is a realistic first draft." })).toHaveCount(0);
  });

  test("Research discovers an OpenAlex contract result and saves real provider provenance", async ({ page }) => {
    const title = `OpenAlex evidence contract ${Date.now()}`;
    await page.route("**/api/research/discovery?*", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({
        contentType: "application/json",
        json: {
          providers: [{ provider: "openalex", status: "live" }, { provider: "crossref", status: "unconfigured", message: "Not requested by this fixture" }],
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
    await page.getByRole("link", { name: "Connect tools" }).click();
    await expect(page).toHaveURL(`${baseURL}/integrations`);
    await page.goto("/research");
    await expect(page.getByRole("heading", { name: "Evidence, not browser tabs." })).toBeVisible();
    await page.locator(".research-library-card").getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Add a source" })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Add a source" })).toHaveCount(0);
    await page.getByRole("button", { name: "Discovery", exact: true }).click();
    await page.getByLabel("Query").fill("spatial transcriptomics reproducibility");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("OpenAlex: live")).toBeVisible();
    const result = page.locator(".paper-result").filter({ hasText: title });
    await expect(result).toBeVisible();
    await result.getByRole("button", { name: "Save to library", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(/Paper saved|already saved/i);
    await page.getByRole("button", { name: /Papers/ }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  });

  test("connection setup stays in guided dialogs with actionable validation", async ({ page }) => {
    await page.route("**/api/integrations/credentials", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          contentType: "application/json",
          json: {
            providers: [
              { provider: "openalex", name: "OpenAlex", purpose: "Search and rank scholarly works, authors, topics, and citation signals.", privacy: "Search terms and filters are sent to OpenAlex.", docs: "https://developers.openalex.org/api-reference/authentication" },
              { provider: "youtube", name: "YouTube Data API", purpose: "Retrieve real learning-video metadata before Continuum ranks it.", privacy: "Learning queries are sent to Google; the key is used server-side only.", docs: "https://developers.google.com/youtube/v3/getting-started" },
            ],
            configured: [],
          },
        });
      }
      const body = route.request().postDataJSON() as { action: string; secret?: string };
      if (body.action === "validate" && body.secret?.startsWith("invalid")) {
        return route.fulfill({ status: 422, contentType: "application/json", json: { error: "Continuum could not connect because OpenAlex rejected this API key. Check for spaces before or after the key, then try again." } });
      }
      if (body.action === "validate") {
        return route.fulfill({ contentType: "application/json", json: { status: "connected", message: "OpenAlex accepted this API key. It has not been saved yet." } });
      }
      return route.fulfill({ status: 201, contentType: "application/json", json: { status: "connected", message: "OpenAlex connected." } });
    });
    await demoLogin(page);
    await page.getByRole("link", { name: "Connections", exact: true }).click();
    const openAlex = page.locator(".settings-row").filter({ hasText: "OpenAlex" });

    await openAlex.getByRole("button", { name: "Configure" }).click();
    await expect(page.getByRole("dialog", { name: "Connect OpenAlex" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog", { name: "Connect OpenAlex" })).toHaveCount(0);

    await openAlex.getByRole("button", { name: "Configure" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText("Step 1 of 2")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    const key = page.getByLabel("API key", { exact: true });
    await key.fill("invalid-openalex-key");
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByRole("status")).toContainText("OpenAlex rejected this API key");
    await key.fill("valid-openalex-key");
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByRole("status")).toContainText("Connection successful");
    await page.getByRole("button", { name: "Save connection" }).click();
    await expect(page.getByRole("dialog", { name: "Connect OpenAlex" })).toHaveCount(0);

    await page.getByRole("button", { name: "Connect Claude" }).click();
    await expect(page.getByRole("dialog", { name: "Connect Claude to Continuum" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Choose local AI" }).click();
    await expect(page.getByRole("dialog", { name: "Choose local AI for coding help" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Choose local AI for coding help" })).toHaveCount(0);
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

  test("all primary and legacy internal routes resolve without a 404", async ({ page }) => {
    await demoLogin(page);
    for (const path of ["/", "/goals", "/learn", "/code", "/research", "/memory", "/activity", "/integrations", "/connections"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).not.toBe(404);
      await expect(page.getByText("This page could not be found.")).toHaveCount(0);
    }
    await expect(page).toHaveURL(`${baseURL}/integrations`);
  });
});
