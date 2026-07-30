import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const DEFAULT_ENCRYPTION_VERSION = 1;

function currentEncryptionVersion() {
  const parsed = Number(process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_VERSION ?? DEFAULT_ENCRYPTION_VERSION);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 99) throw new Error("Connection encryption version is invalid");
  return parsed;
}

function key(version: number) {
  const configured = version === DEFAULT_ENCRYPTION_VERSION
    ? process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY
    : process.env[`INTEGRATION_CREDENTIAL_ENCRYPTION_KEY_V${version}`];
  if (!configured) {
    if (process.env.NODE_ENV === "production") throw new Error("Connection encryption is not configured");
    return createHash("sha256").update(process.env.MCP_JWT_SIGNING_SECRET ?? "continuum-local-credential-vault").digest();
  }
  const decoded = /^[a-f0-9]{64}$/i.test(configured) ? Buffer.from(configured, "hex") : Buffer.from(configured, "base64url");
  if (decoded.length !== 32) throw new Error("Connection encryption key must contain exactly 32 bytes");
  return decoded;
}

export function sealCredential(value: Record<string, unknown>) {
  const version = currentEncryptionVersion();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(version), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [`v${version}`, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function openCredential<T extends Record<string, unknown>>(sealed: string | null | undefined): T {
  if (!sealed) throw new Error("Connection credentials are unavailable");
  const [version, iv, tag, body] = sealed.split(".");
  const parsedVersion = Number(version?.replace(/^v/, ""));
  if (!Number.isInteger(parsedVersion) || parsedVersion < 1 || !iv || !tag || !body) throw new Error("Connection credentials are malformed");
  const decipher = createDecipheriv("aes-256-gcm", key(parsedVersion), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as T;
}

export function credentialEncryptionVersion(sealed?: string | null) {
  if (!sealed) return currentEncryptionVersion();
  const parsed = Number(sealed.split(".", 1)[0]?.replace(/^v/, ""));
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error("Connection credentials are malformed");
  return parsed;
}
