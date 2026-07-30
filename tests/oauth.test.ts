import { describe, expect, it } from "vitest";
import { scopes as supportedScopes } from "../packages/domain/src";
import { issueClientRegistration, issueOAuthConsent, issueToken, parseAuthorizationRequest, revokeToken, validMcpResource, verifyClientRegistration, verifyPkce, verifyToken } from "../apps/web/lib/oauth";
import { POST as authorize } from "../apps/web/app/api/oauth/authorize/route";
import { POST as registerClient } from "../apps/web/app/api/oauth/register/route";
import { POST as exchangeToken } from "../apps/web/app/api/oauth/token/route";
import { createHash } from "node:crypto";
import { getStore } from "../apps/web/lib/store";

async function authorizationFixture() {
  const verifier = "continuum-pkce-verifier-with-enough-entropy";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const clientId = await issueClientRegistration({
    clientName: "Claude",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
    scopes: ["memory:read", "goals:read"],
    grantTypes: ["authorization_code", "refresh_token"],
  });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    response_type: "code",
    scope: "memory:read goals:read",
    state: "opaque-client-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: "http://localhost:3000/mcp",
  });
  return { verifier, clientId, params, authorization: await parseAuthorizationRequest(params, supportedScopes) };
}

async function consentForm(decision: "approve" | "deny", mutate?: (form: URLSearchParams) => void) {
  const fixture = await authorizationFixture();
  const consentToken = await issueOAuthConsent("user_maya", fixture.authorization);
  const form = new URLSearchParams(fixture.params);
  form.set("decision", decision);
  form.set("consent_token", consentToken);
  form.set("ux", "continuum");
  form.append("selected_scope", "memory:read");
  form.append("selected_scope", "goals:read");
  mutate?.(form);
  const response = await authorize(new Request("http://localhost:3000/api/oauth/authorize", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost:3000" },
    body: form,
    redirect: "manual",
  }));
  return { ...fixture, response };
}

describe("durable OAuth grant state", () => {
  it("records issued tokens and makes revocation effective immediately", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await issueToken({ sub: "user_maya", clientId: "client_test", scopes: ["memory:read"], exp: now + 60, type: "access" });
    expect((await verifyToken(token, "access")).scopes).toContain("memory:read");
    await revokeToken(token);
    await expect(verifyToken(token, "access")).rejects.toThrow(/revoked|used/i);
  });

  it("fails closed when a signed token has no durable grant", async () => {
    expect(await getStore().oauthGrantUnavailable("missing_grant")).toBe(true);
  });

  it("allows an authorization code to be consumed only once", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await issueToken({ sub: "user_maya", clientId: "client_test", scopes: ["memory:read"], exp: now + 60, type: "code" });
    const code = await verifyToken(token, "code");
    await getStore().consumeOAuthCode(code.jti);
    await expect(getStore().consumeOAuthCode(code.jti)).rejects.toThrow(/already used/i);
  });

  it("rotates a refresh token exactly once", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await issueToken({ sub: "user_maya", clientId: "client_test", scopes: ["memory:read"], exp: now + 60, type: "refresh" });
    const refresh = await verifyToken(token, "refresh");
    await getStore().consumeOAuthGrant(refresh.jti, "refresh");
    await expect(getStore().consumeOAuthGrant(refresh.jti, "refresh")).rejects.toThrow(/already used/i);
  });

  it("verifies PKCE S256 challenges", () => {
    const verifier = "continuum-pkce-verifier-with-enough-entropy";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });

  it("registers public remote clients and binds their redirect URIs", async () => {
    const response = await registerClient(new Request("http://localhost/api/oauth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Test MCP Host", redirect_uris: ["https://client.example/callback"], token_endpoint_auth_method: "none" }),
    }));
    expect(response.status).toBe(201);
    const registration = await response.json() as { client_id: string };
    await expect(verifyClientRegistration(registration.client_id)).resolves.toMatchObject({ redirectUris: ["https://client.example/callback"] });
    await expect(verifyClientRegistration(`${registration.client_id}tampered`)).rejects.toThrow(/unknown/i);
  });

  it("rejects unsafe dynamic-client redirect URIs", async () => {
    const response = await registerClient(new Request("http://localhost/api/oauth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Unsafe client", redirect_uris: ["http://attacker.example/callback"] }),
    }));
    expect(response.status).toBe(400);
  });

  it("signs a stable client registration payload", async () => {
    const clientId = await issueClientRegistration({ clientName: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"], scopes: ["memory:read"], grantTypes: ["authorization_code", "refresh_token"] });
    await expect(verifyClientRegistration(clientId)).resolves.toMatchObject({ clientName: "Claude" });
  });

  it("approves once, preserves state, and issues a PKCE-bound code", async () => {
    const { response } = await consentForm("approve");
    expect(response.status).toBe(303);
    const target = new URL(response.headers.get("location")!);
    expect(target.origin).toBe("https://claude.ai");
    expect(target.searchParams.get("state")).toBe("opaque-client-state");
    await expect(verifyToken(target.searchParams.get("code")!, "code")).resolves.toMatchObject({
      scopes: ["memory:read", "goals:read"],
    });
  });

  it("rejects access without issuing a code", async () => {
    const { response } = await consentForm("deny");
    const target = new URL(response.headers.get("location")!);
    expect(target.searchParams.get("error")).toBe("access_denied");
    expect(target.searchParams.has("code")).toBe(false);
    expect(target.searchParams.get("state")).toBe("opaque-client-state");
  });

  it("rejects a changed state and gives the Continuum page a retry error", async () => {
    const { response } = await consentForm("approve", (form) => form.set("state", "tampered-state"));
    const target = new URL(response.headers.get("location")!);
    expect(target.pathname).toBe("/oauth/authorize");
    expect(target.searchParams.get("oauth_error")).toBe("invalid_state");
  });

  it("returns a useful invalid_grant response when the callback PKCE check fails", async () => {
    const { response, clientId } = await consentForm("approve");
    const callback = new URL(response.headers.get("location")!);
    const tokenForm = new URLSearchParams({
      grant_type: "authorization_code",
      code: callback.searchParams.get("code")!,
      client_id: clientId,
      redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      code_verifier: "wrong-verifier-that-is-still-long-enough-to-send",
      resource: "http://localhost:3000/mcp",
    });
    const tokenResponse = await exchangeToken(new Request("http://localhost:3000/api/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenForm,
    }));
    expect(tokenResponse.status).toBe(400);
    await expect(tokenResponse.json()).resolves.toMatchObject({
      error: "invalid_grant",
      error_description: expect.stringMatching(/PKCE|redirect URI/i),
    });
  });
});

/**
 * The regression the §12.6 procedure caught against a preview deployment.
 *
 * `/.well-known/oauth-protected-resource/mcp` advertises the resource as
 * `{serving-origin}/mcp`, but resource validation compared only against
 * `APP_BASE_URL`. On every preview — and on production whenever `APP_BASE_URL`
 * is an alias of the serving domain — a client that followed discovery
 * correctly, which is exactly what Claude does, had its authorization request
 * rejected with `invalid_request`.
 */
describe("RFC 8707 resource indicators", () => {
  const issuer = "https://continuum.example";
  const preview = "https://continuum-preview-abc123.vercel.app";

  function withIssuer<T>(run: () => T): T {
    const previousIssuer = process.env.MCP_OAUTH_ISSUER_URL;
    const previousBase = process.env.APP_BASE_URL;
    process.env.MCP_OAUTH_ISSUER_URL = issuer;
    process.env.APP_BASE_URL = issuer;
    try { return run(); } finally {
      if (previousIssuer === undefined) delete process.env.MCP_OAUTH_ISSUER_URL; else process.env.MCP_OAUTH_ISSUER_URL = previousIssuer;
      if (previousBase === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = previousBase;
    }
  }

  it("accepts both address shapes on the configured issuer", () => {
    withIssuer(() => {
      expect(validMcpResource(`${issuer}/mcp`)).toBe(true);
      expect(validMcpResource(`${issuer}/api/mcp`)).toBe(true);
    });
  });

  it("accepts the origin the request actually arrived on", () => {
    withIssuer(() => {
      // What the preview's own discovery document advertises.
      expect(validMcpResource(`${preview}/mcp`, `${preview}/api/oauth/authorize?x=1`)).toBe(true);
      expect(validMcpResource(`${preview}/api/mcp`, `${preview}/api/oauth/token`)).toBe(true);
    });
  });

  it("still rejects a resource belonging to neither", () => {
    withIssuer(() => {
      expect(validMcpResource("https://attacker.example/mcp", `${preview}/api/oauth/authorize`)).toBe(false);
      // A different path on a valid origin is not the MCP resource.
      expect(validMcpResource(`${issuer}/admin`)).toBe(false);
      // Without a request URL, only the configured issuer counts.
      expect(validMcpResource(`${preview}/mcp`)).toBe(false);
    });
  });

  it("treats an absent resource indicator as valid, per RFC 8707", () => {
    withIssuer(() => {
      expect(validMcpResource(undefined)).toBe(true);
      expect(validMcpResource(null)).toBe(true);
      expect(validMcpResource("")).toBe(true);
    });
  });
});

/**
 * The full authorization → consent → code → token flow on an origin that is
 * *not* `APP_BASE_URL`.
 *
 * Every preview deployment is this case, and so is production whenever
 * `APP_BASE_URL` is an alias. It broke in four places for the same reason —
 * a resource that had already been validated against the serving origin was
 * re-validated against the configured issuer alone and silently rewritten —
 * and each break surfaced as a different, misleading message: "not valid",
 * then "this approval request expired", then "resource indicator does not
 * match". One case here would have caught all four.
 */
describe("OAuth on a deployment origin that is not the configured issuer", () => {
  it("issues a consent token, a code, and an access token that all agree on the resource", async () => {
    const previousIssuer = process.env.MCP_OAUTH_ISSUER_URL;
    const previousBase = process.env.APP_BASE_URL;
    process.env.MCP_OAUTH_ISSUER_URL = "https://continuum.example";
    process.env.APP_BASE_URL = "https://continuum.example";
    const preview = "https://continuum-preview-xyz.vercel.app";
    try {
      const verifier = "continuum-pkce-verifier-with-enough-entropy";
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      const clientId = await issueClientRegistration({
        clientName: "Claude",
        redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
        scopes: ["memory:read", "goals:read"],
        grantTypes: ["authorization_code", "refresh_token"],
      });
      // What a client reads out of the preview's own discovery document.
      const resource = `${preview}/mcp`;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: "https://claude.ai/api/mcp/auth_callback",
        response_type: "code",
        scope: "memory:read goals:read",
        state: "preview-origin-state",
        code_challenge: challenge,
        code_challenge_method: "S256",
        resource,
      });

      const authorization = await parseAuthorizationRequest(params, supportedScopes, `${preview}/api/oauth/authorize`);
      expect(authorization.resource).toBe(resource);

      const consentToken = await issueOAuthConsent("user_maya", authorization);
      const consent = await verifyToken(consentToken, "consent", `${preview}/api/oauth/authorize`);
      // The regression: this used to come back as `https://continuum.example/mcp`,
      // so the consent check failed and the user saw "this approval expired".
      expect(consent.resource).toBe(resource);

      const code = await issueToken({
        trustedResource: true,
        sub: "user_maya",
        clientId,
        scopes: ["memory:read"],
        type: "code",
        exp: Math.floor(Date.now() / 1000) + 300,
        redirectUri: "https://claude.ai/api/mcp/auth_callback",
        codeChallenge: challenge,
        resource: authorization.resource,
      });
      const verifiedCode = await verifyToken(code, "code", `${preview}/api/oauth/token`);
      expect(verifiedCode.resource).toBe(resource);
      expect(verifiedCode.aud).toBe(resource);
    } finally {
      if (previousIssuer === undefined) delete process.env.MCP_OAUTH_ISSUER_URL; else process.env.MCP_OAUTH_ISSUER_URL = previousIssuer;
      if (previousBase === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = previousBase;
    }
  });
});
