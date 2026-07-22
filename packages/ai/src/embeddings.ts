import { embed, embedMany } from "ai";
import {
  featherlessCredentials,
  recordFeatherlessCredentialFailure,
  recordFeatherlessCredentialSuccess,
  selectFeatherlessCredential,
  withFeatherlessExecution,
} from "./featherless";

export type EmbeddingProvider = "gemini" | "featherless" | "ai_gateway" | "ollama";

export type EmbeddingConfiguration = {
  provider: EmbeddingProvider;
  model: string;
  dimensions: number;
  fallbackProviders: EmbeddingProvider[];
};

function values(env: NodeJS.ProcessEnv, prefix: string, count = 10) {
  return Array.from({ length: count }, (_, index) => env[`${prefix}_${index + 1}`]?.trim()).filter((value): value is string => Boolean(value));
}

export function geminiApiKeys(env: NodeJS.ProcessEnv = process.env) {
  const commaSeparated = (env.GEMINI_API_KEYS ?? "").split(",").map((key) => key.trim()).filter(Boolean);
  return [...new Set([env.GEMINI_API_KEY?.trim(), ...values(env, "GEMINI_API_KEY"), ...commaSeparated].filter((value): value is string => Boolean(value)))].slice(0, 10);
}

function configuredProviders(env: NodeJS.ProcessEnv) {
  const providers: EmbeddingProvider[] = [];
  if (geminiApiKeys(env).length && env.GEMINI_DATA_USE_ACKNOWLEDGED === "true") providers.push("gemini");
  if (featherlessCredentials(env).length) providers.push("featherless");
  if (env.AI_GATEWAY_ENABLED === "true" && (env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN)) providers.push("ai_gateway");
  if (env.OLLAMA_BASE_URL && env.OLLAMA_EMBEDDING_MODEL) providers.push("ollama");
  return providers;
}

export function embeddingConfiguration(env: NodeJS.ProcessEnv = process.env): EmbeddingConfiguration | undefined {
  const available = configuredProviders(env);
  if (!available.length) return undefined;
  const requested = (env.EMBEDDING_PROVIDER ?? "").split(",").map((item) => item.trim()).filter((item): item is EmbeddingProvider => ["gemini", "featherless", "ai_gateway", "ollama"].includes(item));
  const ordered = [...new Set([...requested, ...available])].filter((provider) => available.includes(provider));
  const provider = ordered[0];
  if (!provider) return undefined;
  const dimensions = Number(env.EMBEDDING_DIMENSIONS ?? 1536);
  if (!Number.isInteger(dimensions) || dimensions <= 0) throw new Error("EMBEDDING_DIMENSIONS must be a positive integer");
  const model = provider === "gemini"
    ? env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001"
    : provider === "featherless"
      ? env.FEATHERLESS_EMBEDDING_MODEL ?? "Qwen/Qwen3-Embedding-8B"
      : provider === "ollama"
        ? env.OLLAMA_EMBEDDING_MODEL!
        : env.EMBEDDING_MODEL ?? "google/gemini-embedding-001";
  return { provider, model, dimensions, fallbackProviders: ordered.slice(1) };
}

function validateDimensions(values: number[][], dimensions: number) {
  if (values.some((value) => value.length !== dimensions)) throw new Error(`Embedding model output must be ${dimensions}-dimensional to match the pgvector column`);
  return values;
}

function normalize(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
  return magnitude ? vector.map((value) => value / magnitude) : vector;
}

let geminiCursor = 0;

async function geminiEmbedding(value: string, taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY", configuration: EmbeddingConfiguration, env: NodeJS.ProcessEnv) {
  const keys = geminiApiKeys(env);
  if (!keys.length) throw new Error("Gemini embeddings are not configured");
  let lastError: unknown;
  for (let attempt = 0; attempt < keys.length; attempt += 1) {
    const index = (geminiCursor + attempt) % keys.length;
    const key = keys[index]!;
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(configuration.model)}:embedContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          model: `models/${configuration.model}`,
          content: { parts: [{ text: value }] },
          taskType,
          ...(taskType === "RETRIEVAL_DOCUMENT" ? { title: value.slice(0, 120) } : {}),
          outputDimensionality: configuration.dimensions,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403;
        const message = `Gemini embedding request failed (${response.status})`;
        if (!retryable) throw new Error(message);
        lastError = new Error(message);
        continue;
      }
      const payload = await response.json() as { embedding?: { values?: number[] } };
      const vector = payload.embedding?.values;
      if (!vector) throw new Error("Gemini returned no embedding vector");
      geminiCursor = (index + 1) % keys.length;
      return configuration.model === "gemini-embedding-001" && configuration.dimensions !== 3072 ? normalize(vector) : vector;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Every configured Gemini embedding key failed");
}

async function featherlessEmbeddings(values: string[], configuration: EmbeddingConfiguration, env: NodeJS.ProcessEnv) {
  const credentials = featherlessCredentials(env);
  if (!credentials.length) throw new Error("Featherless embeddings are not configured");
  let lastError: unknown;
  for (let attempt = 0; attempt < Math.min(credentials.length, 3); attempt += 1) {
    const credential = selectFeatherlessCredential(env);
    try {
      const output = await withFeatherlessExecution(credential.id, 1, async () => {
        const response = await fetch("https://api.featherless.ai/v1/embeddings", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${credential.apiKey}`,
            "HTTP-Referer": env.APP_BASE_URL ?? "https://continuum.app",
            "X-Title": "Continuum",
          },
          body: JSON.stringify({ model: configuration.model, input: values, encoding_format: "float", dimensions: configuration.dimensions }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`Featherless embedding request failed (${response.status})`);
        const payload = await response.json() as { data?: Array<{ index: number; embedding: number[] }> };
        const vectors = (payload.data ?? []).sort((left, right) => left.index - right.index).map((item) => item.embedding);
        if (vectors.length !== values.length) throw new Error("Featherless returned an incomplete embedding batch");
        return vectors;
      }, env);
      recordFeatherlessCredentialSuccess(credential.id);
      return output;
    } catch (error) {
      lastError = error;
      recordFeatherlessCredentialFailure(credential.id, error);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Every healthy Featherless embedding key failed");
}

async function ollamaEmbeddings(values: string[], configuration: EmbeddingConfiguration, env: NodeJS.ProcessEnv) {
  const base = new URL(env.OLLAMA_BASE_URL!);
  if (!["localhost", "127.0.0.1", "::1"].includes(base.hostname) && env.ALLOW_REMOTE_OLLAMA !== "true") throw new Error("Remote Ollama endpoints require ALLOW_REMOTE_OLLAMA=true");
  const response = await fetch(new URL("/api/embed", base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: configuration.model, input: values, dimensions: configuration.dimensions }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Ollama embedding request failed (${response.status})`);
  const payload = await response.json() as { embeddings?: number[][] };
  if (!payload.embeddings) throw new Error("Ollama returned no embeddings");
  return payload.embeddings;
}

async function aiGatewayEmbeddings(values: string[], configuration: EmbeddingConfiguration) {
  if (values.length === 1) return [(await embed({ model: configuration.model, value: values[0]! })).embedding];
  return (await embedMany({ model: configuration.model, values })).embeddings;
}

async function runProvider(values: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY", configuration: EmbeddingConfiguration, env: NodeJS.ProcessEnv) {
  if (configuration.provider === "gemini") {
    const output: number[][] = [];
    const concurrency = Math.max(1, Math.min(Number(env.GEMINI_EMBEDDING_CONCURRENCY ?? 2), 4));
    for (let offset = 0; offset < values.length; offset += concurrency) output.push(...await Promise.all(values.slice(offset, offset + concurrency).map((value) => geminiEmbedding(value, taskType, configuration, env))));
    return output;
  }
  if (configuration.provider === "featherless") return featherlessEmbeddings(values, configuration, env);
  if (configuration.provider === "ollama") return ollamaEmbeddings(values, configuration, env);
  return aiGatewayEmbeddings(values, configuration);
}

function configurationForProvider(provider: EmbeddingProvider, base: EmbeddingConfiguration, env: NodeJS.ProcessEnv): EmbeddingConfiguration {
  const model = provider === "gemini" ? env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001" : provider === "featherless" ? env.FEATHERLESS_EMBEDDING_MODEL ?? "Qwen/Qwen3-Embedding-8B" : provider === "ollama" ? env.OLLAMA_EMBEDDING_MODEL! : env.EMBEDDING_MODEL ?? "google/gemini-embedding-001";
  return { ...base, provider, model, fallbackProviders: [] };
}

async function embedWithFallback(values: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY", configuration: EmbeddingConfiguration, env: NodeJS.ProcessEnv) {
  let lastError: unknown;
  for (const provider of [configuration.provider, ...configuration.fallbackProviders]) {
    const candidate = configurationForProvider(provider, configuration, env);
    try { return validateDimensions(await runProvider(values, taskType, candidate, env), candidate.dimensions); } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("Every configured embedding provider failed");
}

export async function embedDocuments(values: string[], configuration = embeddingConfiguration(), env: NodeJS.ProcessEnv = process.env) {
  if (!configuration) throw new Error("Embeddings are not configured");
  if (!values.length) return [];
  const result: number[][] = [];
  const batchSize = 32;
  for (let offset = 0; offset < values.length; offset += batchSize) result.push(...await embedWithFallback(values.slice(offset, offset + batchSize), "RETRIEVAL_DOCUMENT", configuration, env));
  return result;
}

export async function embedQuery(value: string, configuration = embeddingConfiguration(), env: NodeJS.ProcessEnv = process.env) {
  if (!configuration) throw new Error("Embeddings are not configured");
  return (await embedWithFallback([value], "RETRIEVAL_QUERY", configuration, env))[0]!;
}

export function embeddingProviderStatus(env: NodeJS.ProcessEnv = process.env) {
  const config = embeddingConfiguration(env);
  return {
    configured: Boolean(config),
    provider: config?.provider,
    model: config?.model,
    dimensions: config?.dimensions,
    fallbacks: config?.fallbackProviders ?? [],
    geminiKeyCount: geminiApiKeys(env).length,
    featherlessKeyCount: featherlessCredentials(env).length,
  };
}
