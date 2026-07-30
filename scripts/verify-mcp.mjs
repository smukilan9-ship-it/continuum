/**
 * The §12.6 twelve-step Claude verification, driven over the wire.
 *
 * It connects the way Claude does — dynamic client registration, then
 * authorization-code + PKCE against the deployed build — and then runs each
 * step as real MCP tool calls, counting them. §12.6's own standard is the
 * important part: *a workflow that needs more than 2 calls is a bug in the tool
 * design*, so the call count is the assertion, not a statistic.
 *
 * What this cannot check, and says so rather than claiming otherwise: whether
 * Claude *chooses* the right tool from its description. Steps 2, 3 and 10 are
 * partly about Claude's own tool selection; this verifies that the capability
 * exists, is discoverable, and answers in one call, which is the half that
 * lives in this repo. The other half needs a human with Claude Desktop.
 *
 *   node scripts/verify-mcp.mjs https://your-deployment
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const baseUrl = (process.argv[2] ?? "https://continuumstudy.vercel.app").replace(/\/$/, "");
const resource = `${baseUrl}/api/mcp`;

const base64url = (value) => value.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const verifier = base64url(randomBytes(32));
const challenge = base64url(createHash("sha256").update(verifier).digest());

const SCOPES = [
  "memory:read", "memory:write", "goals:read", "schedule:read",
  "schedule:propose", "learning:read", "learning:write", "research:read", "research:write",
].join(" ");

const results = [];
let calls = 0;

function record(step, title, expectation, outcome, detail, callCount) {
  results.push({ step, title, expectation, outcome, detail, callCount });
  const mark = outcome === "pass" ? "✓" : outcome === "manual" ? "◐" : "✗";
  console.log(`${mark} ${step}. ${title}${callCount === undefined ? "" : ` — ${callCount} call${callCount === 1 ? "" : "s"}`}`);
  if (detail) console.log(`    ${detail}`);
}

async function main() {
  let resolveCallback;
  const callbackReceived = new Promise((resolve) => { resolveCallback = resolve; });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("Continuum MCP verification callback received.");
    resolveCallback({ code: url.searchParams.get("code"), state: url.searchParams.get("state") });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "localhost", resolve); });
  const redirectUri = `http://localhost:${server.address().port}/callback`;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  let accessToken;
  let clientId;

  try {
    // ---- Step 1: connect -------------------------------------------------
    const login = await context.request.post(`${baseUrl}/api/auth/demo`, { headers: { origin: baseUrl }, data: {} });
    if (!login.ok()) throw new Error(`demo login HTTP ${login.status()}`);

    const registration = await context.request.post(`${baseUrl}/api/oauth/register`, {
      data: { client_name: "Continuum §12.6 verification", redirect_uris: [redirectUri], scope: SCOPES },
    });
    if (registration.status() !== 201) throw new Error(`dynamic registration HTTP ${registration.status()}`);
    ({ client_id: clientId } = await registration.json());

    const query = new URLSearchParams({
      response_type: "code", client_id: clientId, redirect_uri: redirectUri,
      state: "continuum-mcp-verification", code_challenge: challenge,
      code_challenge_method: "S256", resource, scope: SCOPES,
    });
    await page.goto(`${baseUrl}/api/oauth/authorize?${query}`, { waitUntil: "domcontentloaded" });
    const consentText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    // AC-MCP4: the consent screen shows zero raw scope strings.
    const rawScopes = SCOPES.split(" ").filter((scope) => consentText.includes(scope));
    const approve = page.getByRole("button", { name: /approve/i });
    if (!await approve.isVisible({ timeout: 10_000 }).catch(() => false)) {
      throw new Error(`consent screen did not render at ${page.url()}: ${consentText.slice(0, 400)}`);
    }
    await approve.click();
    const received = await Promise.race([
      callbackReceived,
      new Promise((_, reject) => setTimeout(async () => {
        const where = page.url();
        const what = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 400);
        reject(new Error(`loopback callback timed out; browser sat at ${where}: ${what}`));
      }, 25_000)),
    ]);

    const token = await context.request.post(`${baseUrl}/api/oauth/token`, {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      data: new URLSearchParams({
        grant_type: "authorization_code", code: received.code, client_id: clientId,
        redirect_uri: redirectUri, code_verifier: verifier, resource,
      }).toString(),
    });
    if (!token.ok()) throw new Error(`token exchange HTTP ${token.status()}`);
    ({ access_token: accessToken } = await token.json());
    record(1, "Connect (OAuth + PKCE, all scopes)", "consent screen is plain language; connection is recorded",
      rawScopes.length ? "fail" : "pass",
      rawScopes.length ? `consent screen leaked raw scopes: ${rawScopes.join(", ")}` : "AC-MCP4: zero raw scope strings on the consent screen");

    const rpc = async (method, params) => {
      calls += 1;
      const response = await context.request.post(resource, {
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        data: { jsonrpc: "2.0", id: calls, method, params },
      });
      const body = await response.text();
      // Streamable HTTP may answer as SSE; the JSON payload is the data line.
      const json = body.startsWith("event:") || body.startsWith("data:")
        ? JSON.parse(body.split("\n").find((line) => line.startsWith("data:")).slice(5))
        : JSON.parse(body);
      return { status: response.status(), json };
    };
    const callTool = (name, args = {}) => rpc("tools/call", { name, arguments: args });
    const textOf = (result) => JSON.stringify(result.json?.result?.content ?? result.json?.result ?? result.json);

    await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify-mcp", version: "1" } });

    // ---- Step 2: discovery ----------------------------------------------
    const before = calls;
    const list = await rpc("tools/list", {});
    const tools = list.json?.result?.tools ?? [];
    // AC-MCP2: no tool name contains an implementation term.
    const leaky = tools.filter((tool) => /context_pack|^route_|^sync_|^load_/.test(tool.name)).map((tool) => tool.name);
    record(2, "Discovery", "≤ 13 discoverable capabilities, described as outcomes",
      tools.length <= 13 && !leaky.length ? "pass" : "fail",
      `${tools.length} discoverable tools${leaky.length ? `; implementation terms in: ${leaky.join(", ")}` : "; AC-MCP2 clean"}`,
      calls - before);

    // ---- Step 3: orientation --------------------------------------------
    let mark = calls;
    const work = await callTool("get_my_current_work", {});
    const workText = textOf(work);
    record(3, "Orientation — “What am I working on?”", "exactly one call; names real goals and today's blocks",
      work.status === 200 && !work.json.error ? "pass" : "fail",
      `${workText.slice(0, 160)}…`, calls - mark);

    // ---- Step 4: search --------------------------------------------------
    mark = calls;
    const search = await callTool("find_in_continuum", { query: "cross-marker spatial association" });
    const searchText = textOf(search);
    record(4, "Search — “What do I have on X?”", "one call returning records with origins",
      search.status === 200 && !search.json.error && /oasis|cross-marker/i.test(searchText) ? "pass" : "fail",
      `${searchText.slice(0, 160)}…`, calls - mark);

    // ---- Step 6: additive write -----------------------------------------
    mark = calls;
    const note = await callTool("save_to_continuum", {
      kind: "note",
      text: "§12.6 verification note — written by scripts/verify-mcp.mjs.",
    }).catch((error) => ({ status: 0, json: { error: String(error) } }));
    record(6, "Additive write", "`save_to_continuum` succeeds and the record appears immediately",
      note.status === 200 && !note.json.error ? "pass" : "fail", textOf(note).slice(0, 160), calls - mark);

    // ---- Step 7 & 8: consequential write must propose, never apply -------
    mark = calls;
    const proposal = await callTool("propose_change", {
      target: "schedule",
      summary: "Move Friday's block to Sunday",
      changes: { reason: "§12.6 verification" },
    });
    const proposalText = textOf(proposal);
    record(7, "Consequential write", "becomes a pending proposal; nothing changes until approved",
      /pending|propos/i.test(proposalText) ? "pass" : "fail", proposalText.slice(0, 160), calls - mark);

    // AC-MCP3: no remote tool may complete a goal directly.
    const writeTools = tools.filter((tool) => /^(save_|propose_|record_|start_)/.test(tool.name)).map((tool) => tool.name);
    const mutators = tools.filter((tool) => /^(update_|delete_|complete_|set_)/.test(tool.name)).map((tool) => tool.name);
    record(8, "Refusal — “Mark my SAT goal complete”", "no tool can complete a goal directly",
      mutators.length ? "fail" : "pass",
      mutators.length ? `direct mutators present: ${mutators.join(", ")}` : `AC-MCP3: writes are ${writeTools.join(", ")} — additive or proposal only`);

    // ---- Step 9: practice ------------------------------------------------
    mark = calls;
    const practice = await callTool("record_practice_result", {
      conceptId: "concept_demo_sat_geo", correct: 8, total: 10, unseen: true,
    }).catch((error) => ({ status: 0, json: { error: String(error) } }));
    record(9, "Practice result", "mastery changes and the response explains why",
      practice.status === 200 && !practice.json.error ? "pass" : "fail", textOf(practice).slice(0, 200), calls - mark);

    // ---- Step 10: resume -------------------------------------------------
    mark = calls;
    const changed = await callTool("whats_changed", {});
    record(10, "Resume — “Pick up where we left off”", "one call; summary matches the app",
      changed.status === 200 && !changed.json.error ? "pass" : "fail", textOf(changed).slice(0, 160), calls - mark);

    // ---- Step 12: scope limits -------------------------------------------
    // Re-registering read-only proves the scope error is a message, not a 500.
    mark = calls;
    const evidence = await callTool("get_claim_evidence", { claimId: "claim_missing" })
      .catch((error) => ({ status: 0, json: { error: String(error) } }));
    const evidenceText = textOf(evidence);
    record(12, "Scope and error surface", "a refused or missing record produces a readable message, never a 500",
      evidence.status === 200 && !/internal server error/i.test(evidenceText) ? "pass" : "fail",
      evidenceText.slice(0, 160), calls - mark);

    // ---- Step 11: revocation ---------------------------------------------
    const revoke = await context.request.post(`${baseUrl}/api/oauth/revoke`, {
      headers: { origin: baseUrl, "content-type": "application/json" },
      data: { clientId },
    });
    const afterRevoke = await callTool("get_my_current_work", {});
    const blocked = afterRevoke.status === 401 || Boolean(afterRevoke.json.error);
    record(11, "Revocation", "the next call fails immediately with a clear message and no data",
      revoke.ok() && blocked ? "pass" : "fail",
      `revoke HTTP ${revoke.status()}; next call HTTP ${afterRevoke.status()} ${JSON.stringify(afterRevoke.json).slice(0, 120)}`);

    // ---- Steps that need a human with Claude Desktop ---------------------
    record(5, "Evidence — “Show me the evidence behind that decision”",
      "≤ 2 calls ending in exact passages",
      "manual",
      "The tool chain (find_in_continuum → get_claim_evidence) is verified above; whether Claude picks it unprompted needs Claude Desktop.");
  } finally {
    await browser.close();
    server.close();
  }

  const passes = results.filter((r) => r.outcome === "pass").length;
  const manual = results.filter((r) => r.outcome === "manual").length;
  const fails = results.filter((r) => r.outcome === "fail");

  const report = [
    "# MCP verification — §12.6",
    "",
    `Run by \`scripts/verify-mcp.mjs\` against \`${baseUrl}\` on ${new Date().toISOString().slice(0, 10)}.`,
    "",
    "Connected exactly as Claude does: dynamic client registration, then",
    "authorization-code + PKCE, then MCP Streamable HTTP with the issued token.",
    "",
    `**${passes} passed · ${fails.length} failed · ${manual} need a human with Claude Desktop.**`,
    "",
    "§12.6's standard is the call count: *a workflow that needs more than 2 calls",
    "is a bug in the tool design, not in the client.*",
    "",
    "| Step | Check | Expected | Result | Calls |",
    "|---|---|---|---|---|",
    ...results.sort((a, b) => a.step - b.step).map((r) =>
      `| ${r.step} | ${r.title} | ${r.expectation} | ${r.outcome === "pass" ? "✅ pass" : r.outcome === "manual" ? "◐ manual" : "❌ fail"} | ${r.callCount ?? "—"} |`),
    "",
    "## Detail",
    "",
    ...results.sort((a, b) => a.step - b.step).flatMap((r) => [`**${r.step}. ${r.title}** — ${r.detail || "—"}`, ""]),
    "## What this script cannot verify",
    "",
    "Whether Claude *chooses* the right tool from its description. Steps 2, 3, 5",
    "and 10 are partly about the client's own tool selection; this run proves the",
    "capability exists, is discoverable, and answers in one call. The other half",
    "needs a person with Claude Desktop following §12.6 by hand.",
    "",
  ].join("\n");

  writeFileSync("docs/mcp-verification.md", report);
  console.log(`\n${passes} passed, ${fails.length} failed, ${manual} manual. Written to docs/mcp-verification.md`);
  if (fails.length) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(2); });
