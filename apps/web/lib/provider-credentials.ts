import { NeonRepository } from "@continuum/db";
import { credentialEncryptionVersion, openCredential, sealCredential } from "@/lib/credential-vault";

export const credentialProviders = ["openalex", "youtube", "semantic-scholar"] as const;
export type CredentialProvider = typeof credentialProviders[number];
export type CredentialHealthStatus = "connected" | "degraded" | "invalid";

export const credentialProviderMetadata: Record<CredentialProvider, {
  name: string;
  purpose: string;
  privacy: string;
  docs: string;
}> = {
  openalex: {
    name: "OpenAlex",
    purpose: "Search and rank scholarly works, authors, topics, and citation signals.",
    privacy: "Search terms and filters are sent to OpenAlex.",
    docs: "https://developers.openalex.org/api-reference/authentication",
  },
  youtube: {
    name: "YouTube Data API",
    purpose: "Retrieve real learning-video metadata before Continuum ranks it.",
    privacy: "Learning queries are sent to Google; the key is used server-side only.",
    docs: "https://developers.google.com/youtube/v3/getting-started",
  },
  "semantic-scholar": {
    name: "Semantic Scholar",
    purpose: "Enrich research discovery with paper, author, citation, and recommendation data.",
    privacy: "Research queries and identifiers are sent to Semantic Scholar.",
    docs: "https://www.semanticscholar.org/product/api",
  },
};

export type SealedProviderCredential = {
  secret: string;
  provider: CredentialProvider;
  storedAt: string;
  maskedSuffix: string;
  status: CredentialHealthStatus;
  lastValidatedAt: string;
  lastUsedAt?: string;
};

function providerRequest(provider: CredentialProvider, secret: string): { url: URL; init: RequestInit } {
  if (provider === "openalex") {
    const url = new URL("https://api.openalex.org/rate-limit");
    url.searchParams.set("api_key", secret);
    return { url, init: { headers: { accept: "application/json" } } satisfies RequestInit };
  }
  if (provider === "youtube") {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "id");
    url.searchParams.set("id", "dQw4w9WgXcQ");
    url.searchParams.set("key", secret);
    return { url, init: { headers: { accept: "application/json" } } satisfies RequestInit };
  }
  const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
  url.searchParams.set("query", "academic learning");
  url.searchParams.set("limit", "1");
  url.searchParams.set("fields", "paperId");
  return { url, init: { headers: { accept: "application/json", "x-api-key": secret } } satisfies RequestInit };
}

export async function verifyProviderCredential(provider: CredentialProvider, secret: string, fetcher: typeof fetch = fetch) {
  const request = providerRequest(provider, secret);
  try {
    const response = await fetcher(request.url, { ...request.init, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (response.ok) return { status: "connected" as const, checkedAt: new Date().toISOString() };
    if (response.status === 401 || response.status === 403 || response.status === 400) {
      return { status: "invalid" as const, checkedAt: new Date().toISOString(), code: "credential_rejected" as const };
    }
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      return { status: "degraded" as const, checkedAt: new Date().toISOString(), code: response.status === 429 ? "quota_or_rate_limit" as const : "provider_unavailable" as const };
    }
    return { status: "invalid" as const, checkedAt: new Date().toISOString(), code: "credential_rejected" as const };
  } catch (error) {
    return {
      status: "degraded" as const,
      checkedAt: new Date().toISOString(),
      code: (error as { name?: string }).name === "TimeoutError" ? "provider_timeout" as const : "provider_unavailable" as const,
    };
  }
}

export function maskedCredential(secret: string) {
  const suffix = secret.slice(-4);
  return `•••• ${suffix}`;
}

export async function readUserProviderCredential(userId: string, provider: CredentialProvider, markUsed = false) {
  if (!process.env.DATABASE_URL) return undefined;
  const repo = new NeonRepository();
  const integration = await repo.getIntegration(userId, provider);
  if (!integration?.encryptedCredentials) return undefined;
  const value = openCredential<SealedProviderCredential>(integration.encryptedCredentials);
  if (value.provider !== provider || typeof value.secret !== "string") throw new Error("Stored provider credential is invalid");
  const normalized: SealedProviderCredential = {
    ...value,
    maskedSuffix: value.maskedSuffix ?? value.secret.slice(-4),
    status: value.status ?? "connected",
    lastValidatedAt: value.lastValidatedAt ?? value.storedAt,
  };
  const shouldTouch = markUsed && (!normalized.lastUsedAt || Date.now() - new Date(normalized.lastUsedAt).getTime() > 5 * 60_000);
  if (shouldTouch) {
    normalized.lastUsedAt = new Date().toISOString();
    const resealed = sealCredential(normalized);
    await repo.upsertIntegration({
      id: integration.id,
      userId,
      provider,
      encryptedCredentials: resealed,
      scopes: integration.scopes,
    });
    integration.encryptedCredentials = resealed;
  }
  return {
    secret: value.secret,
    metadata: normalized,
    integration,
    encryptionVersion: credentialEncryptionVersion(integration.encryptedCredentials),
  };
}

export async function getUserProviderSecret(userId: string, provider: CredentialProvider) {
  const credential = await readUserProviderCredential(userId, provider, true);
  return credential?.metadata.status === "invalid" ? undefined : credential;
}

export function providerCredentialEnvelope(provider: CredentialProvider, secret: string, status: CredentialHealthStatus = "connected", checkedAt = new Date().toISOString(), lastUsedAt?: string) {
  return {
    secret,
    provider,
    storedAt: new Date().toISOString(),
    maskedSuffix: secret.slice(-4),
    status,
    lastValidatedAt: checkedAt,
    lastUsedAt,
  } satisfies SealedProviderCredential;
}
