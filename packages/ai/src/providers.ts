import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, gateway, Output, streamText, type LanguageModel } from "ai";
import type { z } from "zod";
import type { RouteDecision } from "@continuum/schemas";
import { geminiApiKeys } from "./embeddings";
import { acquireFeatherlessConcurrency, selectFeatherlessModel, withFeatherlessConcurrency } from "./featherless";
import { selectGroqModel } from "./groq";

export interface ProviderEnvironment {
  [key: string]: string | undefined;
  AI_GATEWAY_API_KEY?: string;
  AI_GATEWAY_ENABLED?: string;
  VERCEL_OIDC_TOKEN?: string;
  AI_GATEWAY_GENERAL_MODEL?: string;
  AI_GATEWAY_MULTIMODAL_MODEL?: string;
  AI_GATEWAY_FALLBACK_MODELS?: string;
  FEATHERLESS_API_KEY?: string;
  FEATHERLESS_MODEL?: string;
  FEATHERLESS_FAST_MODEL?: string;
  FEATHERLESS_REASONING_MODEL?: string;
  FEATHERLESS_CODE_MODEL?: string;
  FEATHERLESS_VERIFIER_MODEL?: string;
  FEATHERLESS_FALLBACK_MODEL?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  GROQ_FAST_MODEL?: string;
  GROQ_REASONING_MODEL?: string;
  GROQ_CODE_MODEL?: string;
  GROQ_VERIFIER_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_API_KEYS?: string;
  GEMINI_MODEL?: string;
  GEMINI_DATA_USE_ACKNOWLEDGED?: string;
}

export interface StructuredGenerationRequest<T> {
  decision: RouteDecision;
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  maxOutputTokens?: number;
  userId?: string;
}

export interface StreamingGenerationRequest {
  decision: RouteDecision;
  prompt: string;
  system?: string;
  maxOutputTokens?: number;
  userId?: string;
  abortSignal?: AbortSignal;
}

const defaults = {
  general: "google/gemini-3.5-flash",
  multimodal: "google/gemini-3.5-flash",
  fallbacks: ["openai/gpt-5.4", "anthropic/claude-sonnet-4.6"],
};

export function providerEnvironmentFromProcess(): ProviderEnvironment {
  return {
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    AI_GATEWAY_ENABLED: process.env.AI_GATEWAY_ENABLED,
    VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN,
    AI_GATEWAY_GENERAL_MODEL: process.env.AI_GATEWAY_GENERAL_MODEL,
    AI_GATEWAY_MULTIMODAL_MODEL: process.env.AI_GATEWAY_MULTIMODAL_MODEL,
    AI_GATEWAY_FALLBACK_MODELS: process.env.AI_GATEWAY_FALLBACK_MODELS,
    FEATHERLESS_API_KEY: process.env.FEATHERLESS_API_KEY,
    FEATHERLESS_MODEL: process.env.FEATHERLESS_MODEL,
    FEATHERLESS_FAST_MODEL: process.env.FEATHERLESS_FAST_MODEL,
    FEATHERLESS_REASONING_MODEL: process.env.FEATHERLESS_REASONING_MODEL,
    FEATHERLESS_CODE_MODEL: process.env.FEATHERLESS_CODE_MODEL,
    FEATHERLESS_VERIFIER_MODEL: process.env.FEATHERLESS_VERIFIER_MODEL,
    FEATHERLESS_FALLBACK_MODEL: process.env.FEATHERLESS_FALLBACK_MODEL,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: process.env.GROQ_MODEL,
    GROQ_FAST_MODEL: process.env.GROQ_FAST_MODEL,
    GROQ_REASONING_MODEL: process.env.GROQ_REASONING_MODEL,
    GROQ_CODE_MODEL: process.env.GROQ_CODE_MODEL,
    GROQ_VERIFIER_MODEL: process.env.GROQ_VERIFIER_MODEL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_API_KEYS: process.env.GEMINI_API_KEYS,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    GEMINI_DATA_USE_ACKNOWLEDGED: process.env.GEMINI_DATA_USE_ACKNOWLEDGED,
    ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`GEMINI_API_KEY_${index + 1}`, process.env[`GEMINI_API_KEY_${index + 1}`]])),
  };
}

type GenerationTarget = {
  model: LanguageModel;
  modelId: string;
  provider: RouteDecision["route"];
  concurrencyCost?: number;
  providerOptions?: {
    gateway?: { models: string[]; user: string; tags: string[] };
    google?: { thinkingConfig: { thinkingLevel: "minimal"; includeThoughts: false } };
  };
};

function gatewayFallbackModels(env: ProviderEnvironment, primary: string) {
  return (env.AI_GATEWAY_FALLBACK_MODELS?.split(",") ?? defaults.fallbacks)
    .map((model) => model.trim())
    .filter((model) => model && model !== primary);
}

let geminiGenerationCursor = 0;

async function modelForDecision(decision: RouteDecision, env: ProviderEnvironment, userId = "anonymous"): Promise<GenerationTarget> {
  if (decision.route === "deterministic") throw new Error("Deterministic tasks must not invoke a language model");
  if (decision.route === "groq") {
    if (!env.GROQ_API_KEY) throw new Error("Groq is not configured");
    const id = await selectGroqModel(decision.taskClass, env as NodeJS.ProcessEnv);
    return { model: createOpenAICompatible({ name: "groq", apiKey: env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" }).languageModel(id), modelId: id, provider: "groq" };
  }
  if (decision.route === "featherless") {
    if (!env.FEATHERLESS_API_KEY) throw new Error("Featherless is not configured");
    const selected = await selectFeatherlessModel(decision.taskClass, env as NodeJS.ProcessEnv);
    return { model: createOpenAICompatible({ name: "featherless", apiKey: env.FEATHERLESS_API_KEY, baseURL: "https://api.featherless.ai/v1", headers: { "HTTP-Referer": env.APP_BASE_URL ?? "https://continuum.app", "X-Title": "Continuum" } }).languageModel(selected.id), modelId: selected.id, provider: "featherless", concurrencyCost: selected.concurrencyCost };
  }
  if (decision.route === "gemini") {
    if (env.GEMINI_DATA_USE_ACKNOWLEDGED !== "true") throw new Error("Gemini data use has not been acknowledged by the operator");
    const keys = geminiApiKeys(env as NodeJS.ProcessEnv);
    if (!keys.length) throw new Error("Gemini is not configured");
    const key = keys[geminiGenerationCursor % keys.length]!;
    geminiGenerationCursor = (geminiGenerationCursor + 1) % keys.length;
    const id = env.GEMINI_MODEL ?? "gemini-3.5-flash";
    return { model: createGoogleGenerativeAI({ apiKey: key })(id), modelId: id, provider: "gemini", providerOptions: { google: { thinkingConfig: { thinkingLevel: "minimal", includeThoughts: false } } } };
  }
  if (env.AI_GATEWAY_ENABLED !== "true" || (!env.AI_GATEWAY_API_KEY && !env.VERCEL_OIDC_TOKEN)) throw new Error("AI Gateway is not explicitly enabled");
  const id = env.AI_GATEWAY_GENERAL_MODEL ?? defaults.general;
  return {
    model: gateway(id),
    modelId: id,
    provider: "ai_gateway",
    providerOptions: {
      gateway: {
        models: gatewayFallbackModels(env, id),
        user: userId,
        tags: [`feature:${decision.taskClass}`, "app:continuum"],
      },
    },
  };
}

function routeConfigured(route: RouteDecision["route"], env: ProviderEnvironment) {
  if (route === "groq") return Boolean(env.GROQ_API_KEY);
  if (route === "featherless") return Boolean(env.FEATHERLESS_API_KEY);
  if (route === "gemini") return env.GEMINI_DATA_USE_ACKNOWLEDGED === "true" && geminiApiKeys(env as NodeJS.ProcessEnv).length > 0;
  if (route === "ai_gateway") return env.AI_GATEWAY_ENABLED === "true" && Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN);
  return route === "deterministic";
}

export function generationRouteOrder(decision: RouteDecision, env: ProviderEnvironment) {
  const preferred: RouteDecision["route"][] = ["classification", "extraction", "summarization", "misconception_diagnosis"].includes(decision.taskClass)
    ? ["groq", "featherless", "gemini", "ai_gateway"]
    : ["featherless", "gemini", "groq", "ai_gateway"];
  return [decision.route, ...preferred.filter((route) => route !== decision.route && routeConfigured(route, env))];
}

export async function generateStructured<T>(request: StructuredGenerationRequest<T>, env: ProviderEnvironment = providerEnvironmentFromProcess()) {
  const taskPreferredRoutes = generationRouteOrder(request.decision, env).slice(1);
  const attempts = [
    request.decision,
    ...taskPreferredRoutes
      .filter((route) => route !== request.decision.route && routeConfigured(route, env))
      .map((route) => ({
        ...request.decision,
        route,
        model: `${route}/fallback`,
        reason: `${request.decision.route} was unavailable; ${route} is the next configured provider qualified for this task.`,
        fallbackUsed: true,
      } satisfies RouteDecision)),
  ];
  let lastError: unknown;

  let totalAttempts = 0;
  for (let index = 0; index < attempts.length; index += 1) {
    const decision = attempts[index]!;
    const routeAttempts = decision.route === "gemini" ? Math.min(3, Math.max(1, geminiApiKeys(env as NodeJS.ProcessEnv).length)) : decision.route === "featherless" ? 2 : 1;
    for (let routeAttempt = 0; routeAttempt < routeAttempts; routeAttempt += 1) {
      totalAttempts += 1;
      try {
        const target = await modelForDecision(decision, env, request.userId);
        const structuredSystem = [request.system, "Return valid JSON matching the requested schema. Do not add prose outside the JSON value."].filter(Boolean).join("\n\n");
        const run = () => generateText({
            model: target.model,
            output: Output.object({ schema: request.schema }),
            ...(target.providerOptions ? { providerOptions: target.providerOptions } : {}),
            system: structuredSystem,
            prompt: request.prompt,
            ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
            abortSignal: AbortSignal.timeout(45_000),
          });
        const result = target.provider === "featherless"
          ? await withFeatherlessConcurrency(target.concurrencyCost ?? 1, run, env as NodeJS.ProcessEnv)
          : await run();
        return {
          output: request.schema.parse(result.output),
          decision: { ...decision, model: target.modelId, fallbackUsed: index > 0 || routeAttempt > 0 },
          attempts: totalAttempts,
          usage: result.totalUsage,
        };
      } catch (error) {
        lastError = error;
        if (routeAttempt + 1 < routeAttempts) await new Promise((resolve) => setTimeout(resolve, 250 * (routeAttempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Every qualified model route failed");
}

export async function streamGeneration(request: StreamingGenerationRequest, env: ProviderEnvironment = providerEnvironmentFromProcess()) {
  const target = await modelForDecision(request.decision, env, request.userId);
  const release = target.provider === "featherless" ? await acquireFeatherlessConcurrency(target.concurrencyCost ?? 1, env as NodeJS.ProcessEnv) : undefined;
  let finished = false;
  const releaseOnce = () => {
    if (finished) return;
    finished = true;
    release?.();
  };
  try {
    const result = streamText({
      model: target.model,
      ...(target.providerOptions ? { providerOptions: target.providerOptions } : {}),
      system: request.system,
      prompt: request.prompt,
      ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
      abortSignal: request.abortSignal,
      onFinish: releaseOnce,
      onAbort: releaseOnce,
      onError: releaseOnce,
    });
    return { result, decision: { ...request.decision, model: target.modelId } };
  } catch (error) {
    releaseOnce();
    throw error;
  }
}

export function configuredProviders(env: ProviderEnvironment = providerEnvironmentFromProcess()) {
  return {
    aiGateway: env.AI_GATEWAY_ENABLED === "true" && Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN),
    featherless: Boolean(env.FEATHERLESS_API_KEY),
    groq: Boolean(env.GROQ_API_KEY),
    gemini: env.GEMINI_DATA_USE_ACKNOWLEDGED === "true" && geminiApiKeys(env as NodeJS.ProcessEnv).length > 0,
    geminiKeyCount: geminiApiKeys(env as NodeJS.ProcessEnv).length,
    groqModels: env.GROQ_API_KEY ? {
      fast: env.GROQ_FAST_MODEL ?? env.GROQ_MODEL ?? "llama-3.1-8b-instant",
      reasoning: env.GROQ_REASONING_MODEL ?? env.GROQ_MODEL ?? "qwen/qwen3.6-27b",
      code: env.GROQ_CODE_MODEL ?? env.GROQ_MODEL ?? "openai/gpt-oss-120b",
      verifier: env.GROQ_VERIFIER_MODEL ?? env.GROQ_MODEL ?? "openai/gpt-oss-20b",
    } : undefined,
    gatewayModels: {
      general: env.AI_GATEWAY_GENERAL_MODEL ?? defaults.general,
      multimodal: env.AI_GATEWAY_MULTIMODAL_MODEL ?? defaults.multimodal,
      fallbacks: gatewayFallbackModels(env, env.AI_GATEWAY_GENERAL_MODEL ?? defaults.general),
    },
  };
}
