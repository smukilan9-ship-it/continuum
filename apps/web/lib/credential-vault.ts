import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key() {
  const configured = process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY;
  if (!configured) {
    if (process.env.NODE_ENV === "production") throw new Error("Connection encryption is not configured");
    return createHash("sha256").update(process.env.MCP_JWT_SIGNING_SECRET ?? "continuum-local-credential-vault").digest();
  }
  const decoded = /^[a-f0-9]{64}$/i.test(configured) ? Buffer.from(configured, "hex") : Buffer.from(configured, "base64url");
  if (decoded.length !== 32) throw new Error("Connection encryption key must contain exactly 32 bytes");
  return decoded;
}

export function sealCredential(value: Record<string, unknown>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function openCredential<T extends Record<string, unknown>>(sealed: string | null | undefined): T {
  if (!sealed) throw new Error("Connection credentials are unavailable");
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Connection credentials are malformed");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as T;
}
