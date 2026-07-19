import { describe, expect, it } from "vitest";
import { embeddingConfiguration, embeddingProviderStatus, geminiApiKeys } from "../packages/ai/src";

describe("embedding provider configuration", () => {
  it("deduplicates and caps Gemini keys without exposing their values in status", () => {
    const env = { GEMINI_API_KEY: "primary-secret", GEMINI_API_KEY_1: "primary-secret", GEMINI_API_KEYS: Array.from({ length: 14 }, (_, index) => `secret-${index}`).join(","), GEMINI_DATA_USE_ACKNOWLEDGED: "true" } as NodeJS.ProcessEnv;
    expect(geminiApiKeys(env)).toHaveLength(10);
    const serialized = JSON.stringify(embeddingProviderStatus(env));
    expect(serialized).not.toContain("primary-secret");
    expect(serialized).not.toContain("secret-0");
    expect(embeddingProviderStatus(env).geminiKeyCount).toBe(10);
  });

  it("does not activate Gemini until data use is explicitly acknowledged", () => {
    const env = { GEMINI_API_KEY: "server-only-secret" } as NodeJS.ProcessEnv;
    expect(embeddingConfiguration(env)).toBeUndefined();
  });

  it("uses the requested configured fallback order and fixed pgvector dimensions", () => {
    const env = {
      GEMINI_API_KEY_1: "gemini-secret",
      GEMINI_DATA_USE_ACKNOWLEDGED: "true",
      FEATHERLESS_API_KEY: "featherless-secret",
      FEATHERLESS_EMBEDDING_MODEL: "BAAI/bge-m3",
      EMBEDDING_PROVIDER: "featherless,gemini",
      EMBEDDING_DIMENSIONS: "1536",
    } as NodeJS.ProcessEnv;
    expect(embeddingConfiguration(env)).toEqual({ provider: "featherless", model: "BAAI/bge-m3", dimensions: 1536, fallbackProviders: ["gemini"] });
  });

  it("uses the verified Featherless embedding model when only Featherless is configured", () => {
    const env = { FEATHERLESS_API_KEY: "featherless-secret", EMBEDDING_DIMENSIONS: "1536" } as NodeJS.ProcessEnv;
    expect(embeddingConfiguration(env)).toEqual({ provider: "featherless", model: "Qwen/Qwen3-Embedding-8B", dimensions: 1536, fallbackProviders: [] });
  });
});
