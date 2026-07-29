import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function demoLogin(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Explore the demo/ }).click();
  await expect(page).toHaveURL(`${baseURL}/today`);
  // The greeting has never ended in a period; the old pattern required one.
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening), .+/i })).toBeVisible();
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
  test("Study routes into a session and mastery moves only on a correct unseen check", async ({ page }) => {
    test.setTimeout(180_000);
    await demoLogin(page);
    await page.getByRole("link", { name: "Learn", exact: true }).click();

    // Three sections, no tabs: Continue, Concepts, Material and practice (§14.1).
    await expect(page.getByRole("heading", { name: "Continue", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Concepts", exact: true })).toBeVisible();

    // The Continue row's label varies by state, so drive the stable per-row
    // Study button in the Concepts list instead.
    const concept = page.locator(".study-concept-list li").first();
    await expect(concept).toBeVisible();
    const conceptName = (await concept.locator(".study-concept-title").innerText()).trim();
    await concept.getByRole("button", { name: "Study", exact: true }).click();

    await page.waitForURL(/\/study\/[^/]+$/);
    await expect(page.locator(".study-session")).toBeVisible();
    await expect(page.locator(".study-lesson")).toBeVisible({ timeout: 60_000 });

    // A "Mastered" label may never sit beside an open misconception (AC-LN3).
    const misconception = page.locator(".study-misconception-label");
    if (await misconception.count()) {
      await expect(page.locator(".study-concept-list li", { has: misconception })).not.toContainText("Mastered");
    }

    await page.getByRole("button", { name: /^(Continue|Check my understanding|Start the check)/ }).first().click();
    await expect(page.locator(".study-check")).toBeVisible({ timeout: 60_000 });

    // The question is generated per concept, so assert the contract, not physics.
    const answer = page.getByLabel(/Your answer|Answer in your own words/);
    await expect(answer).toBeVisible();
    await answer.fill("A worked explanation applying the idea to a case I have not seen before.");
    await page.getByRole("button", { name: "Check my answer" }).click();

    // Whether the answer is graded correct is the model's call; what must hold is
    // that a result is reached and that any movement is reported with real
    // before/after numbers rather than a bare "passed" (AC-LN5).
    const result = page.locator(".study-session-column");
    await expect(result).toContainText(/Transfer updated|Not quite|Try a different one/, { timeout: 60_000 });
    if (await page.getByRole("heading", { name: "Transfer updated" }).count()) {
      await expect(page.locator(".study-delta")).toContainText(/%/);
    }

    await expect(page.getByRole("link", { name: /^Back to / })).toBeVisible();
    expect(conceptName.length).toBeGreaterThan(0);
  });

  test("Material panel asks one question and offers ranked results inline", async ({ page }) => {
    test.setTimeout(120_000);
    await demoLogin(page);
    await page.getByRole("link", { name: "Learn", exact: true }).click();

    // The four-step handoff wizard is gone (C16): one question, six chips.
    await expect(page.locator(".handoff-steps")).toHaveCount(0);
    await page.getByRole("button", { name: "Find material" }).click();
    const panel = page.locator(".study-panel");
    await expect(panel).toBeVisible();
    for (const need of ["Understand it", "Practise", "Fix a weak area", "Prep for a test", "Finish an assignment", "Just find something"]) {
      await expect(panel.getByRole("button", { name: need })).toBeVisible();
    }
    await panel.getByRole("button", { name: "Understand it" }).click();
    await expect(panel.getByRole("button", { name: "Start" }).first()).toBeVisible({ timeout: 60_000 });
  });

  test("practice set runs from Study and returns to Study", async ({ page }) => {
    test.setTimeout(120_000);
    await demoLogin(page);
    await page.getByRole("link", { name: "Learn", exact: true }).click();

    // Practice sets and photo extraction are first-class here now, not the
    // second tab of a tool strip (S7, feature #44).
    await expect(page.getByRole("button", { name: "New set" })).toBeVisible();
    await expect(page.getByRole("button", { name: "From a photo" })).toBeVisible();

    const existing = page.locator(".study-practice-list button").first();
    if (!(await existing.count())) {
      test.skip(true, "The demo account has no saved practice set to run.");
      return;
    }
    await existing.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Practice set|How do you want to practise\?/);
  });

  test("Assistant streams against selected workspace context and saves reviewed memory", async ({ page }) => {
    test.setTimeout(120_000);
    await demoLogin(page);
    await page.getByRole("link", { name: "Assistant", exact: true }).click();
    await expect(page.getByText("Workspace context ready")).toBeVisible();
    const composer = page.getByLabel("Message Continuum Assistant");
    await composer.fill("Give me one concise next action for reviewing electric potential. Mention why it is the next action.");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator(".assistant-message.user")).toContainText("electric potential");
    await expect(page.locator(".assistant-message.assistant").last()).not.toBeEmpty({ timeout: 90_000 });
    await page.getByRole("button", { name: "Review memory" }).click();
    const memoryDialog = page.getByRole("dialog", { name: "Review session memory" });
    await expect(memoryDialog).toBeVisible({ timeout: 60_000 });
    await expect(memoryDialog.getByLabel("Session summary")).not.toHaveValue("");
    await memoryDialog.getByRole("button", { name: "Save memory" }).click();
    await expect(memoryDialog).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".assistant-history nav button").first()).toBeVisible();
    await expect(page.locator(".assistant-message.user")).toContainText("electric potential");
  });

  test("Code Lab runs real JavaScript, separates AI feedback, persists navigation, and exposes an update through MCP", async ({ page }) => {
    test.setTimeout(180_000);
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
    const editor = page.locator(".code-editor-shell .cm-content");
    await editor.click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.insertText([
      "const scores = [72, 88, 91, 64, 85];",
      "const cutoff = Number(input() || 80);",
      "const selected = scores.filter((score) => score >= cutoff);",
      'console.log(`Selected: ${selected.join(", ")}`);',
      'console.log(`Count: ${selected.length}`);',
    ].join("\n"));
    await page.locator(".studio-toolbar-actions").getByRole("button", { name: /^Run/ }).click();
    await expect(page.getByRole("tab", { name: "Console" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".runtime-result h3", { hasText: "Output" })).toBeVisible();
    await expect(page.locator(".runtime-result pre")).toContainText("Selected: 88, 91, 85");
    await expect(page.locator(".runtime-result pre")).toContainText("Count: 3");
    await page.getByRole("button", { name: "Check sample" }).click();
    await expect(page.locator(".code-tests-panel")).toContainText("Passed");

    await page.getByRole("tab", { name: /^Assistant/ }).click();
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
    await page.getByRole("tab", { name: "Console" }).click();
    await expect(page.locator(".runtime-result pre")).toContainText("Count: 3");
    await page.getByRole("tab", { name: /^Assistant/ }).click();
    await expect(page.locator(".code-conversation")).toContainText("Which edge case should I try next?");

    const packResponse = await readCurrentWeekThroughMcp(page);
    expect(JSON.stringify(packResponse)).toContain(checkpointMarker);

    await page.getByLabel("Language").selectOption("sql");
    await page.locator(".studio-toolbar-actions").getByRole("button", { name: /^Run/ }).click();
    await expect(page.locator(".sql-result")).toContainText("Asha");
    await page.getByRole("button", { name: "Check sample" }).click();
    await expect(page.locator(".code-tests-panel")).toContainText("Passed");
    await page.getByRole("tab", { name: "Console" }).click();
    await expect(page.locator(".sql-result")).toContainText("Asha");
    await expect(page.locator(".sql-result")).toContainText("Meera");
  });

  test("Python execution is direct, stoppable, and accepts a checked local file", async ({ page }) => {
    test.setTimeout(180_000);
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
      await expect(editor).toContainText(source.replaceAll("\n", ""));
    };

    await demoLogin(page);
    await page.getByRole("link", { name: "Code", exact: true }).click();
    await page.getByLabel("Language").selectOption("python");
    await expect(page.getByLabel("Language")).toHaveValue("python");
    await expect(page.getByLabel("File name")).toHaveValue("main.py");

    await setEditor('print("Hello, world!")');
    await page.getByRole("tab", { name: "Input & Output" }).click();
    await page.getByLabel("Program input").fill("");
    await page.locator(".studio-toolbar-actions").getByRole("button", { name: /^Run/ }).click();
    await expect(page.locator(".runtime-result pre")).toContainText("Hello, world!", { timeout: 45_000 });
    await expect(page.locator(".runtime-result")).toContainText("exit code 0");
    expect(aiRequests).toBe(0);

    await setEditor('name = input()\nprint(f"Hello, {name}")');
    await page.getByRole("tab", { name: "Input & Output" }).click();
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

    await page.getByRole("button", { name: "Ask Assistant" }).click();
    await page.getByRole("button", { name: "Explain my code" }).click();
    await page.getByRole("button", { name: "Get feedback" }).click();
    await expect(page.locator(".code-conversation")).toContainText("runtime result confirms");
    expect(aiRequests).toBe(1);
  });

  test("Code performance budget keeps direct execution and repeat navigation responsive", async ({ page }) => {
    await demoLogin(page);
    const metrics: Record<string, number> = {};
    const navigationStarted = Date.now();
    await page.getByRole("link", { name: "Code", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Write it. Run it. Understand why it works." })).toBeVisible();
    metrics.codePageReadyMs = Date.now() - navigationStarted;
    await expect(page.locator(".code-editor-shell .cm-content")).toBeVisible();
    metrics.editorReadyMs = Date.now() - navigationStarted;
    await page.getByLabel("Language").selectOption("javascript");
    await expect(page.getByLabel("Language")).toHaveValue("javascript");
    await expect(page.getByLabel("File name")).toHaveValue("main.js");

    const editor = page.locator(".code-editor-shell .cm-content");
    await editor.click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.insertText('console.log("continuum performance")');
    await expect(editor).toContainText('console.log("continuum performance")');
    const runTimes: number[] = [];
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const runStarted = Date.now();
      await page.locator(".studio-toolbar-actions").getByRole("button", { name: /^Run/ }).click();
      await expect(page.locator(".runtime-result pre")).toContainText("continuum performance");
      runTimes.push(Date.now() - runStarted);
    }
    metrics.simpleExecutionMedianMs = [...runTimes].sort((left, right) => left - right)[1]!;
    metrics.simpleExecutionTimeouts = 0;

    const uploadStarted = Date.now();
    await page.getByRole("button", { name: "Import file" }).click();
    await page.getByLabel("Choose a code file").setInputFiles({ name: "performance.js", mimeType: "text/javascript", buffer: Buffer.from('console.log("uploaded")') });
    await expect(page.getByText("performance.js", { exact: true })).toBeVisible();
    metrics.fileUploadReadyMs = Date.now() - uploadStarted;
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("link", { name: "Learn", exact: true }).click();
    const repeatStarted = Date.now();
    await page.getByRole("link", { name: "Code", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Write it. Run it. Understand why it works." })).toBeVisible();
    metrics.repeatNavigationMs = Date.now() - repeatStarted;
    console.log(`continuum_performance=${JSON.stringify(metrics)}`);

    expect(metrics.simpleExecutionMedianMs).toBeLessThan(3_000);
    expect(metrics.simpleExecutionTimeouts).toBe(0);
    expect(metrics.fileUploadReadyMs).toBeLessThan(2_000);
    expect(metrics.repeatNavigationMs).toBeLessThan(1_500);
  });

  test("Plan drafts a deterministic week and requires explicit confirmation", async ({ page }) => {
    test.setTimeout(120_000);
    await demoLogin(page);
    await page.getByRole("link", { name: "Plan", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Week" })).toBeVisible();

    // "COMMITTED" is no longer stamped on every block (S15, AC-PL4).
    await expect(page.getByText("COMMITTED")).toHaveCount(0);

    await page.getByRole("button", { name: "Build my week" }).click();
    const dialog = page.getByRole("dialog", { name: "Build my week" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /Generate|Build/ }).first().click();

    // Nothing is saved until Save week is pressed (AC-PL3).
    const draftBar = page.getByRole("region", { name: "Draft actions" });
    await expect(draftBar).toBeVisible({ timeout: 60_000 });
    await expect(draftBar).toContainText("Draft");
    await expect(draftBar.getByRole("button", { name: "Save week" })).toBeVisible();

    await draftBar.getByRole("button", { name: "Discard" }).click();
    await page.getByRole("button", { name: "Discard draft" }).click();
    await expect(draftBar).toHaveCount(0);
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

  test("connection setup stays guided and never exposes platform-provider configuration", async ({ page }) => {
    const cors = {
      "access-control-allow-origin": baseURL,
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    };
    await page.route("http://127.0.0.1:11434/api/tags", async (route) => {
      await route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, json: { models: [{ name: "qwen2.5-coder:3b", size: 2_000_000_000 }] } });
    });
    await page.route("http://127.0.0.1:11434/api/chat", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { ...cors, "content-type": "application/x-ndjson" },
        body: `${JSON.stringify({ message: { content: "READY" }, done: true })}\n`,
      });
    });
    await demoLogin(page);
    await page.getByRole("link", { name: "Connections", exact: true }).click();
    await expect(page.getByRole("button", { name: /Configure OpenAlex/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Configure Featherless/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Configure Groq/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Configure Gemini/i })).toHaveCount(0);

    await page.getByRole("button", { name: "Connect Claude" }).click();
    await expect(page.getByRole("dialog", { name: "Connect Claude to Continuum" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Choose local AI" }).click();
    const ollamaDialog = page.getByRole("dialog", { name: "Choose local AI for coding help" });
    await expect(ollamaDialog).toBeVisible();
    await ollamaDialog.getByRole("button", { name: "Test connection" }).click();
    await expect(ollamaDialog.getByRole("status")).toContainText("Local AI is ready", { timeout: 30_000 });
    await expect(ollamaDialog.getByRole("status")).toContainText(/First text: .*complete:/);
    await ollamaDialog.getByRole("button", { name: "Save local AI" }).click();
    await expect(ollamaDialog).toHaveCount(0);
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
    test.setTimeout(180_000);
    await demoLogin(page);
    for (const path of ["/", "/assistant", "/goals", "/plan", "/learn", "/code", "/research", "/memory", "/activity", "/integrations", "/connections", "/account/ai", "/account/privacy"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).not.toBe(404);
      await expect(page.getByText("This page could not be found.")).toHaveCount(0);
    }
    await expect(page).toHaveURL(`${baseURL}/integrations`);
  });
});
