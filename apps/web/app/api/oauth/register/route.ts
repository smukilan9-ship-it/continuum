import { issueClientRegistration, safeOAuthRedirect } from "@/lib/oauth";
import { scopes as supportedScopes } from "@continuum/domain";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/auth";

const registrationSchema = z.object({
  client_name: z.string().min(1).max(120),
  redirect_uris: z.array(z.string().max(2048)).min(1).max(5),
  grant_types: z.array(z.enum(["authorization_code", "refresh_token"])).default(["authorization_code", "refresh_token"]),
  response_types: z.array(z.literal("code")).default(["code"]),
  token_endpoint_auth_method: z.literal("none").default("none"),
  scope: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const rate = await enforceRateLimit(request, "oauth-register", Number(process.env.OAUTH_REGISTRATIONS_PER_HOUR ?? 30), 60 * 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "slow_down", error_description: "Client registration rate limit exceeded" }, { status: 429, headers: { "retry-after": "3600" } });
  const parsed = registrationSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success || parsed.data.redirect_uris.some((uri) => !safeOAuthRedirect(uri)) || !parsed.data.grant_types.includes("authorization_code")) {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "A public PKCE client with safe redirect URIs is required" }, { status: 400 });
  }
  const requestedScopes = (parsed.data.scope?.split(" ") ?? [...supportedScopes]).filter((scope) => supportedScopes.includes(scope as (typeof supportedScopes)[number]));
  const clientId = issueClientRegistration({
    clientName: parsed.data.client_name,
    redirectUris: parsed.data.redirect_uris,
    scopes: requestedScopes,
    grantTypes: parsed.data.grant_types,
  });
  return NextResponse.json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: parsed.data.client_name,
    redirect_uris: parsed.data.redirect_uris,
    grant_types: parsed.data.grant_types,
    response_types: parsed.data.response_types,
    token_endpoint_auth_method: "none",
    scope: requestedScopes.join(" "),
  }, { status: 201, headers: { "cache-control": "no-store" } });
}
