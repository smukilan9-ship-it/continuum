import { describe, expect, it } from "vitest";
import { issueClientRegistration, issueToken, revokeToken, verifyClientRegistration, verifyPkce, verifyToken } from "../apps/web/lib/oauth";
import { POST as registerClient } from "../apps/web/app/api/oauth/register/route";
import { createHash } from "node:crypto";
import { getStore } from "../apps/web/lib/store";

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
    expect(verifyClientRegistration(registration.client_id).redirectUris).toEqual(["https://client.example/callback"]);
    expect(() => verifyClientRegistration(`${registration.client_id}tampered`)).toThrow(/unknown/i);
  });

  it("rejects unsafe dynamic-client redirect URIs", async () => {
    const response = await registerClient(new Request("http://localhost/api/oauth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Unsafe client", redirect_uris: ["http://attacker.example/callback"] }),
    }));
    expect(response.status).toBe(400);
  });

  it("signs a stable client registration payload", () => {
    const clientId = issueClientRegistration({ clientName: "Claude", redirectUris: ["https://claude.ai/callback"], scopes: ["memory:read"], grantTypes: ["authorization_code", "refresh_token"] });
    expect(verifyClientRegistration(clientId).clientName).toBe("Claude");
  });
});
