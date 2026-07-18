import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { continuumResources, continuumTools, executeTool } from "@continuum/mcp";
import { z } from "zod";
import { authorizedScopes } from "@/lib/oauth";
import { readDemoState, writeDemoState } from "@/lib/demo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resourceData(uri: string) {
  if (uri === "continuum://profile") return { id: "user_maya", timezone: "Asia/Kolkata", level: "CBSE Class 12", memorySharing: "scoped" };
  if (uri.includes("project")) return readDemoState("get_current_context", { focus: "research" });
  if (uri.includes("schedule")) return readDemoState("get_today_plan", {});
  if (uri.includes("learning")) return readDemoState("get_learning_state", { subject: "Physics" });
  if (uri.includes("memory")) return readDemoState("search_academic_memory", { query: "physics validation", limit: 6 });
  return readDemoState("get_goal_state", { goalId: "goal_physics" });
}

function createServer(scopes: string[]) {
  const server = new McpServer({ name: "continuum", version: "0.1.0" }, { capabilities: { logging: {} } });

  for (const tool of continuumTools) {
    const shape = (tool.inputSchema as z.ZodObject<z.ZodRawShape>).shape;
    server.registerTool(tool.name, {
      title: tool.title,
      description: `${tool.description} Required scope: ${tool.requiredScope}.`,
      inputSchema: shape,
      annotations: {
        readOnlyHint: tool.class === "read",
        destructiveHint: false,
        idempotentHint: tool.class === "read" || tool.class === "propose",
        openWorldHint: false,
      },
    }, async (args) => {
      try {
        const now = new Date().toISOString();
        const result = executeTool(tool.name, args, {
          scopes,
          now,
          read: readDemoState,
          write: (name, writeArgs) => writeDemoState(name, writeArgs, now),
        });
        return {
          content: [{ type: "text" as const, text: result.summary }, { type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : "Tool execution failed" }] };
      }
    });
  }

  for (const uri of continuumResources) {
    server.registerResource(uri.replace("continuum://", "").replaceAll("/", "-"), uri, {
      title: uri,
      description: "A compact, freshness-stamped Continuum academic state resource.",
      mimeType: "application/json",
    }, async () => ({ contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ data: resourceData(uri), freshness: new Date().toISOString() }) }] }));
  }

  server.registerPrompt("resume-active-project", { description: "Resume the active research project with evidence and a next action." }, async () => ({ messages: [{ role: "user", content: { type: "text", text: "Use Continuum context to resume my active research project. State the current decision, unresolved question, evidence, and single best next action." } }] }));
  server.registerPrompt("build-today-plan", { description: "Inspect constraints and explain today's academic plan." }, async () => ({ messages: [{ role: "user", content: { type: "text", text: "Retrieve my Continuum today plan and explain why the first flexible block is the best next action." } }] }));
  return server;
}

async function handle(request: Request) {
  const scopes = authorizedScopes(request);
  if (!scopes) {
    const origin = new URL(request.url).origin;
    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Valid OAuth bearer token required" }, id: null }), {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-authorization-server"` },
    });
  }
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createServer(scopes);
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-expose-headers", "mcp-session-id, mcp-protocol-version");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,mcp-session-id,last-event-id,mcp-protocol-version",
    "access-control-expose-headers": "mcp-session-id,mcp-protocol-version",
  } });
}
