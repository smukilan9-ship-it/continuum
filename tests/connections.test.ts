import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialEncryptionVersion, openCredential, sealCredential } from "../apps/web/lib/credential-vault";
import { googleSignInRedirectUri, googleSignInUrl } from "../apps/web/lib/google-auth";

afterEach(() => vi.unstubAllEnvs());

describe("integration credential vault", () => {
  it("round-trips encrypted credentials without exposing plaintext", () => {
    vi.stubEnv("INTEGRATION_CREDENTIAL_ENCRYPTION_KEY", "0".repeat(64));
    const sealed = sealCredential({ accessToken: "secret-token", refreshToken: "renew-me" });
    expect(sealed).not.toContain("secret-token");
    expect(openCredential(sealed)).toEqual({ accessToken: "secret-token", refreshToken: "renew-me" });
  });

  it("rejects tampered ciphertext", () => {
    vi.stubEnv("INTEGRATION_CREDENTIAL_ENCRYPTION_KEY", "1".repeat(64));
    const sealed = sealCredential({ apiKey: "private-zotero-key" });
    const parts = sealed.split(".");
    const ciphertext = Buffer.from(parts[3]!, "base64url");
    ciphertext[0] = ciphertext[0]! ^ 1;
    parts[3] = ciphertext.toString("base64url");
    expect(() => openCredential(parts.join("."))).toThrow();
  });

  it("keeps older envelopes readable while new writes use the configured key version", () => {
    vi.stubEnv("INTEGRATION_CREDENTIAL_ENCRYPTION_KEY", "2".repeat(64));
    const legacy = sealCredential({ apiKey: "legacy-provider-key" });
    vi.stubEnv("INTEGRATION_CREDENTIAL_ENCRYPTION_VERSION", "2");
    vi.stubEnv("INTEGRATION_CREDENTIAL_ENCRYPTION_KEY_V2", "3".repeat(64));
    const rotated = sealCredential({ apiKey: "rotated-provider-key" });

    expect(credentialEncryptionVersion(legacy)).toBe(1);
    expect(credentialEncryptionVersion(rotated)).toBe(2);
    expect(openCredential(legacy)).toEqual({ apiKey: "legacy-provider-key" });
    expect(openCredential(rotated)).toEqual({ apiKey: "rotated-provider-key" });
  });
});

describe("Google account sign-in", () => {
  it("protects Google sign-in with state, an exact redirect, and PKCE", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "continuum-client.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "server-only-secret");
    const challenge = "a".repeat(43);
    const url = new URL(googleSignInUrl({ origin: "https://continuum.example/", state: "oauth-state", codeChallenge: challenge }));
    expect(url.searchParams.get("redirect_uri")).toBe(googleSignInRedirectUri("https://continuum.example"));
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(challenge);
    expect(url.toString()).not.toContain("server-only-secret");
  });
});
