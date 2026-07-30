import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { continuumResources, discoverableTools, executeTool, registrationShape } from "@continuum/mcp";
import { authorizedMcpIdentity, type AuthorizedMcpIdentity } from "@/lib/oauth";
import { enforceRateLimit } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { logRequestFailure, publicErrorMessage } from "@/lib/api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resourceData(uri: string, identity: AuthorizedMcpIdentity) {
  const store = getStore(identity.userId);
  if (uri === "continuum://profile") return { id: identity.userId, memorySharing: "scoped_retrieval", clientId: identity.clientId };
  if (uri === "continuum://projects") return store.read("list_projects", { limit: 20 }, identity.clientId);
  if (uri.includes("schedule")) return store.read("load_schedule", {}, identity.clientId);
  if (uri.includes("learning")) return store.read("load_learning_state", {}, identity.clientId);
  if (uri.includes("memory")) return store.read("search_memory", { query: "recent important academic work", limit: 6, maxTokens: 900 }, identity.clientId);
  if (uri.includes("context-packs")) return store.read("list_context_packs", {}, identity.clientId);
  if (uri.includes("receipt")) return store.read("load_outcome_receipt", { limit: 1 }, identity.clientId);
  return store.read("list_goals", { status: "active", limit: 20 }, identity.clientId);
}

function createServer(identity: AuthorizedMcpIdentity) {
  const server = new McpServer({ name: "continuum", version: "1.0.0" }, { capabilities: { logging: {} } });

  // Only the outcome-shaped set is advertised. Superseded operations stay
  // callable by name through executeTool so an in-flight request does not fail,
  // but a client selecting a tool chooses from the current surface.
  for (const tool of discoverableTools.filter((candidate) => identity.scopes.includes(candidate.requiredScope))) {
    const shape = registrationShape(tool);
    server.registerTool(tool.name, {
      title: tool.title,
      description: `${tool.description} Required scope: ${tool.requiredScope}.`,
      inputSchema: shape,
      annotations: {
        readOnlyHint: tool.class === "read" || tool.class === "invoke",
        destructiveHint: false,
        idempotentHint: tool.class === "read" || tool.class === "propose",
        openWorldHint: false,
      },
    }, async (args) => {
      try {
        const now = new Date().toISOString();
        const store = getStore(identity.userId);
        const result = await executeTool(tool.name, args, {
          scopes: identity.scopes,
          now,
          read: (name, readArgs) => store.read(name, readArgs, identity.clientId),
          write: (name, writeArgs) => store.write(name, writeArgs, now, "mcp", identity.clientId),
        });
        return {
          content: [{ type: "text" as const, text: result.summary }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (error) {
        // The client gets a safe message; the operator gets the real one. Without
        // this, a failing tool produced "Tool execution failed" and no log line
        // anywhere, so the cause could only be found by reading the source.
        logRequestFailure("mcp_tool_failed", { tool: tool.name, clientId: identity.clientId }, error);
        return { isError: true, content: [{ type: "text" as const, text: publicErrorMessage(error, "Tool execution failed") }] };
      }
    });
  }

  const resourceScopes: Record<string, string> = {
    "continuum://profile": "memory:read", "continuum://goals/active": "goals:read", "continuum://projects": "research:read",
    "continuum://schedule/today": "schedule:read", "continuum://learning/current": "learning:read", "continuum://memory/recent": "memory:read", "continuum://context-packs": "memory:read", "continuum://receipts/latest": "memory:read",
  };
  for (const uri of continuumResources.filter((candidate) => identity.scopes.includes(resourceScopes[candidate] ?? "memory:read"))) {
    server.registerResource(uri.replace("continuum://", "").replaceAll("/", "-"), uri, {
      title: uri,
      description: "A compact, freshness-stamped Continuum academic state resource.",
      mimeType: "application/json",
    }, async () => ({ contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ data: await resourceData(uri, identity), freshness: new Date().toISOString() }) }] }));
  }

  server.registerPrompt("resume-active-project", { description: "Resume the active research project with evidence and a next action." }, async () => ({ messages: [{ role: "user", content: { type: "text", text: "Use Continuum context to resume my active research project. State the current decision, unresolved question, evidence, and single best next action." } }] }));
  server.registerPrompt("build-today-plan", { description: "Inspect constraints and explain today's academic plan." }, async () => ({ messages: [{ role: "user", content: { type: "text", text: "Retrieve my Continuum today plan and explain why the first flexible block is the best next action." } }] }));
  return server;
}

async function handle(request: Request) {
  const requestOrigin = request.headers.get("origin");
  const serviceOrigin = new URL(request.url).origin;
  const configuredOrigins = (process.env.MCP_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const allowedOrigins = new Set([
    serviceOrigin,
    process.env.APP_BASE_URL?.replace(/\/$/, ""),
    "https://claude.ai",
    "https://www.claude.ai",
    "https://claude.com",
    "https://www.claude.com",
    ...configuredOrigins,
  ].filter(Boolean));
  if (requestOrigin && !allowedOrigins.has(requestOrigin)) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32003, message: "Origin is not allowed" }, id: null }), { status: 403, headers: { "content-type": "application/json" } });
  }
  const identity = await authorizedMcpIdentity(request);
  if (!identity) {
    const readScopes = "memory:read goals:read learning:read research:read schedule:read resources:read";
    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Valid OAuth bearer token required" }, id: null }), {
      status: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store", "www-authenticate": `Bearer realm="continuum", resource_metadata="${serviceOrigin}/.well-known/oauth-protected-resource/mcp", scope="${readScopes}"` },
    });
  }
  const limit = await enforceRateLimit(request, "mcp", Number(process.env.MCP_REQUESTS_PER_MINUTE ?? 120), 60_000, `${identity.userId}:${identity.clientId}`);
  if (!limit.allowed) return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32002, message: "MCP rate limit exceeded", data: { resetAt: limit.resetAt } }, id: null }), { status: 429, headers: { "content-type": "application/json", "retry-after": "60" } });
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createServer(identity);
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  const headers = new Headers(response.headers);
  if (requestOrigin) headers.set("access-control-allow-origin", requestOrigin);
  headers.set("vary", "Origin");
  headers.set("access-control-expose-headers", "mcp-session-id, mcp-protocol-version");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;

export function OPTIONS(request: Request) {
  const requestOrigin = request.headers.get("origin");
  const serviceOrigin = new URL(request.url).origin;
  const configuredOrigins = (process.env.MCP_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const allowed = !requestOrigin || new Set([
    serviceOrigin,
    process.env.APP_BASE_URL?.replace(/\/$/, ""),
    "https://claude.ai",
    "https://www.claude.ai",
    "https://claude.com",
    "https://www.claude.com",
    ...configuredOrigins,
  ].filter(Boolean)).has(requestOrigin);
  if (!allowed) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: {
    ...(requestOrigin ? { "access-control-allow-origin": requestOrigin } : {}),
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,mcp-session-id,last-event-id,mcp-protocol-version",
    "access-control-expose-headers": "mcp-session-id,mcp-protocol-version",
    "vary": "Origin",
  } });
}
