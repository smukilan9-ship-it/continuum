import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";

const baseUrl = (process.argv[2] ?? "https://continuumstudy.vercel.app").replace(/\/$/, "");

function base64url(value) {
  return value.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

const verifier = base64url(randomBytes(32));
const challenge = base64url(createHash("sha256").update(verifier).digest());
let resolveCallback;
const callback = new Promise((resolve) => { resolveCallback = resolve; });
const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end("Continuum OAuth callback received. This verification tab can close.");
  resolveCallback({ code: url.searchParams.get("code"), state: url.searchParams.get("state") });
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "localhost", resolve);
});

const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not start the loopback callback.");
const redirectUri = `http://localhost:${address.port}/callback`;
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
let clientId;

try {
  const login = await context.request.post(`${baseUrl}/api/auth/demo`, {
    headers: { origin: baseUrl, "content-type": "application/json" },
    data: {},
  });
  if (!login.ok()) throw new Error(`Demo verification login failed with HTTP ${login.status()}.`);

  const registration = await context.request.post(`${baseUrl}/api/oauth/register`, {
    data: {
      client_name: "Continuum hosted OAuth verification",
      redirect_uris: [redirectUri],
      scope: "memory:read",
    },
  });
  if (registration.status() !== 201) throw new Error(`Dynamic registration failed with HTTP ${registration.status()}.`);
  ({ client_id: clientId } = await registration.json());

  const resource = `${baseUrl}/api/mcp`;
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state: "continuum-live-verification",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource,
    scope: "memory:read",
  });
  const authorizationResponse = await page.goto(`${baseUrl}/api/oauth/authorize?${query}`, { waitUntil: "domcontentloaded" });
  if (!authorizationResponse?.ok()) throw new Error(`Authorization screen failed with HTTP ${authorizationResponse?.status()}.`);
  const approve = page.getByRole("button", { name: "Approve and connect" });
  if (!await approve.isVisible({ timeout: 8_000 }).catch(() => false)) {
    const diagnostic = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 500);
    throw new Error(`OAuth consent button was missing at ${page.url()}: ${diagnostic}`);
  }
  await approve.click();
  const received = await Promise.race([
    callback,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Loopback callback timed out.")), 15_000)),
  ]);
  if (!received.code || received.state !== "continuum-live-verification") throw new Error("OAuth callback did not preserve its code and state.");

  const token = await context.request.post(`${baseUrl}/api/oauth/token`, {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    data: new URLSearchParams({
      grant_type: "authorization_code",
      code: received.code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      resource,
    }).toString(),
  });
  if (!token.ok()) throw new Error(`Token exchange failed with HTTP ${token.status()}.`);
  const tokenPayload = await token.json();

  const initialize = await context.request.post(`${baseUrl}/api/mcp`, {
    headers: {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${tokenPayload.access_token}`,
      "content-type": "application/json",
      "mcp-protocol-version": "2025-06-18",
    },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "continuum-live-verification", version: "1" } },
    },
  });
  if (!initialize.ok()) throw new Error(`Authenticated MCP initialization failed with HTTP ${initialize.status()}.`);

  const headers = authorizationResponse.headers();
  console.log(JSON.stringify({
    baseUrl,
    callbackReceived: true,
    statePreserved: true,
    tokenExchanged: true,
    mcpInitialized: true,
    callbackFormAllowed: headers["content-security-policy"]?.includes("form-action 'self' https:"),
    popupRelationshipAllowed: headers["cross-origin-opener-policy"] === "unsafe-none",
  }));
} finally {
  if (clientId) {
    await context.request.post(`${baseUrl}/api/integrations`, {
      headers: { origin: baseUrl, "content-type": "application/json" },
      data: { action: "revoke_mcp_client", clientId },
    }).catch(() => undefined);
  }
  await context.request.post(`${baseUrl}/api/auth/logout`, {
    headers: { origin: baseUrl, "content-type": "application/json" },
    data: {},
  }).catch(() => undefined);
  await browser.close();
  server.close();
}
