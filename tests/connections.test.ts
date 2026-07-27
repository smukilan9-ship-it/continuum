import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialEncryptionVersion, openCredential, sealCredential } from "../apps/web/lib/credential-vault";

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
