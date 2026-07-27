import { afterEach, describe, expect, it, vi } from "vitest";
import {
  credentialProviders,
  maskedCredential,
  verifyProviderCredential,
} from "../apps/web/lib/provider-credentials";

afterEach(() => vi.restoreAllMocks());

describe("provider credential health checks", () => {
  it("uses fixed official provider origins and keeps bearer credentials in headers", async () => {
    const requests: Array<{ url: URL; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: new URL(input instanceof Request ? input.url : input.toString()), init });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    for (const provider of credentialProviders) {
      await verifyProviderCredential(provider, `secret-${provider}-1234`, fetcher);
    }

    expect(requests.map((request) => request.url.origin)).toEqual([
      "https://api.featherless.ai",
      "https://api.groq.com",
      "https://generativelanguage.googleapis.com",
      "https://api.openalex.org",
      "https://www.googleapis.com",
    ]);
    expect(credentialProviders).toEqual(["featherless", "groq", "gemini", "openalex", "youtube"]);
    expect(requests.every((request) => request.url.protocol === "https:")).toBe(true);
    expect(requests.find((request) => request.url.origin === "https://api.featherless.ai")?.init?.headers).toMatchObject({ authorization: "Bearer secret-featherless-1234" });
    expect(requests.find((request) => request.url.origin === "https://api.groq.com")?.init?.headers).toMatchObject({ authorization: "Bearer secret-groq-1234" });
    const openAlexRequest = requests.find((request) => request.url.origin === "https://api.openalex.org");
    expect(openAlexRequest?.url.searchParams.get("api_key")).toBe("secret-openalex-1234");
    expect(openAlexRequest?.init?.headers).not.toMatchObject({ authorization: expect.any(String) });
    const youtubeRequest = requests.find((request) => request.url.pathname === "/youtube/v3/videos");
    expect(youtubeRequest?.url.searchParams.get("key")).toBe("secret-youtube-1234");
    expect(youtubeRequest?.url.searchParams.get("part")).toBe("id");
  });

  it("classifies rejected credentials separately from temporary provider trouble", async () => {
    const rejected = vi.fn(async () => new Response("{}", { status: 403 })) as typeof fetch;
    const limited = vi.fn(async () => new Response("{}", { status: 429 })) as typeof fetch;

    expect(await verifyProviderCredential("groq", "rejected-secret", rejected)).toMatchObject({
      status: "invalid",
      code: "credential_rejected",
    });
    expect(await verifyProviderCredential("gemini", "limited-secret", limited)).toMatchObject({
      status: "degraded",
      code: "quota_or_rate_limit",
    });
  });

  it("exposes only the last four credential characters", () => {
    expect(maskedCredential("super-private-provider-secret-9a8b")).toBe("•••• 9a8b");
  });
});
