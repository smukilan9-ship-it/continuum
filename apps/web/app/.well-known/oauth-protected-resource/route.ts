import { NextResponse } from "next/server";

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [process.env.MCP_OAUTH_ISSUER_URL ?? origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["memory:read", "memory:write", "goals:read", "goals:write", "learning:read", "learning:write", "research:read", "research:write", "schedule:read", "schedule:propose", "schedule:commit", "resources:read", "routing:invoke"],
  }, { headers: { "cache-control": "public, max-age=300" } });
}
