import { NextResponse } from "next/server";

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    issuer: process.env.MCP_OAUTH_ISSUER_URL ?? origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    resource_indicators_supported: true,
    scopes_supported: ["memory:read", "memory:write", "goals:read", "goals:write", "learning:read", "learning:write", "research:read", "research:write", "schedule:read", "schedule:propose", "schedule:commit", "resources:read", "routing:invoke"],
  }, { headers: { "cache-control": "public, max-age=300" } });
}
