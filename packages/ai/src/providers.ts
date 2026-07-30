import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, gateway, Output, streamText, type LanguageModel } from "ai";
import { z } from "zod";
import type { RouteDecision } from "@continuum/schemas";
import { geminiApiKeys } from "./embeddings";
import {
  acquireFeatherlessConcurrency,
  acquireFeatherlessCredentialLease,
  featherlessCredentials,
  recordFeatherlessCredentialFailure,
  recordFeatherlessCredentialSuccess,
  selectFeatherlessCredential,
  selectFeatherlessModel,
  withFeatherlessExecution,
} from "./featherless";
import { selectGroqModel } from "./groq";
import { isTripped, recordFailure, recordSuccess, selectGeminiModel } from "./health";

export interface ProviderEnvironment {
  [key: string]: string | undefined;
  AI_GATEWAY_API_KEY?: string;
  AI_GATEWAY_ENABLED?: string;
  VERCEL_OIDC_TOKEN?: string;
  AI_GATEWAY_GENERAL_MODEL?: string;
  AI_GATEWAY_MULTIMODAL_MODEL?: string;
  AI_GATEWAY_FALLBACK_MODELS?: string;
  FEATHERLESS_API_KEY_PRIMARY?: string;
  FEATHERLESS_API_KEY_SECONDARY?: string;
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
  retrySafe?: boolean;
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
    FEATHERLESS_API_KEY_PRIMARY: process.env.FEATHERLESS_API_KEY_PRIMARY,
    FEATHERLESS_API_KEY_SECONDARY: process.env.FEATHERLESS_API_KEY_SECONDARY,
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
    GROQ_STRUCTURED_MODEL: process.env.GROQ_STRUCTURED_MODEL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_API_KEYS: process.env.GEMINI_API_KEYS,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    GEMINI_DATA_USE_ACKNOWLEDGED: process.env.GEMINI_DATA_USE_ACKNOWLEDGED,
    AI_STRUCTURED_DEADLINE_MS: process.env.AI_STRUCTURED_DEADLINE_MS,
    AI_ATTEMPT_TIMEOUT_MS: process.env.AI_ATTEMPT_TIMEOUT_MS,
    ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`GEMINI_API_KEY_${index + 1}`, process.env[`GEMINI_API_KEY_${index + 1}`]])),
  };
}

type GenerationTarget = {
  model: LanguageModel;
  modelId: string;
  provider: RouteDecision["route"];
  concurrencyCost?: number;
  credentialId?: string;
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

async function modelForDecision(decision: RouteDecision, env: ProviderEnvironment, userId = "anonymous", structured = false): Promise<GenerationTarget> {
  if (decision.route === "deterministic") throw new Error("Deterministic tasks must not invoke a language model");
  if (decision.route === "groq") {
    if (!env.GROQ_API_KEY) throw new Error("Groq is not configured");
    const id = await selectGroqModel(decision.taskClass, env as NodeJS.ProcessEnv, { structured });
    return { model: createOpenAICompatible({ name: "groq", apiKey: env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" }).languageModel(id), modelId: id, provider: "groq" };
  }
  if (decision.route === "featherless") {
    const credential = selectFeatherlessCredential(env as NodeJS.ProcessEnv);
    const selected = await selectFeatherlessModel(decision.taskClass, env as NodeJS.ProcessEnv, credential);
    return { model: createOpenAICompatible({ name: "featherless", apiKey: credential.apiKey, baseURL: "https://api.featherless.ai/v1", headers: { "HTTP-Referer": env.APP_BASE_URL ?? "https://continuum.app", "X-Title": "Continuum" } }).languageModel(selected.id), modelId: selected.id, provider: "featherless", concurrencyCost: selected.concurrencyCost, credentialId: credential.id };
  }
  if (decision.route === "gemini") {
    if (env.GEMINI_DATA_USE_ACKNOWLEDGED !== "true") throw new Error("Gemini data use has not been acknowledged by the operator");
    const keys = geminiApiKeys(env as NodeJS.ProcessEnv);
    if (!keys.length) throw new Error("Gemini is not configured");
    const key = keys[geminiGenerationCursor % keys.length]!;
    geminiGenerationCursor = (geminiGenerationCursor + 1) % keys.length;
    // Runtime discovery + health selection instead of a hard-coded (often dead)
    // model ID. This avoids defaulting to a 503/404 model like gemini-3.5-flash.
    const id = await selectGeminiModel(env as NodeJS.ProcessEnv, { vision: decision.taskClass === "image_understanding" || decision.taskClass === "document_understanding" });
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
  if (route === "featherless") return featherlessCredentials(env as NodeJS.ProcessEnv).length > 0;
  if (route === "gemini") return env.GEMINI_DATA_USE_ACKNOWLEDGED === "true" && geminiApiKeys(env as NodeJS.ProcessEnv).length > 0;
  if (route === "ai_gateway") return env.AI_GATEWAY_ENABLED === "true" && Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN);
  return route === "deterministic";
}

const routeBreakerKey = (route: RouteDecision["route"]) => `route:${route}`;

/**
 * Drop routes whose circuit breaker is currently open, but never return an empty
 * list: if every configured route is tripped we keep the original order so the
 * caller still attempts one (the breaker cooldown may have just lapsed) rather
 * than failing without trying.
 */
function healthAwareOrder(order: RouteDecision["route"][]): RouteDecision["route"][] {
  const healthy = order.filter((route) => route === "deterministic" || !isTripped(routeBreakerKey(route)));
  return healthy.length ? healthy : order;
}

export function generationRouteOrder(decision: RouteDecision, env: ProviderEnvironment) {
  const preferred: RouteDecision["route"][] = ["classification", "extraction", "summarization", "misconception_diagnosis"].includes(decision.taskClass)
    ? ["groq", "featherless", "gemini", "ai_gateway"]
    : ["featherless", "gemini", "groq", "ai_gateway"];
  const order = [decision.route, ...preferred.filter((route) => route !== decision.route && routeConfigured(route, env))];
  return healthAwareOrder([...new Set(order)]);
}

/**
 * Ordering used specifically for JSON-schema (structured) generation. Groq's
 * default low-latency model rejects `response_format` json_schema, so leading
 * with it makes every structured request waste an attempt and often fall all
 * the way through the fallback chain. Providers that reliably honor JSON schema
 * (Gemini native structured output, Featherless Qwen) lead; Groq is kept only as
 * a last-resort fallback so structured tasks never depend on it.
 */
export function structuredRouteOrder(decision: RouteDecision, env: ProviderEnvironment): RouteDecision["route"][] {
  // Preserve the policy decision first. Featherless is the shared primary route;
  // other configured providers remain bounded fallbacks when both healthy
  // credentials are unavailable or a model cannot satisfy the schema.
  const order: RouteDecision["route"][] = [decision.route, "featherless", "groq", "gemini", "ai_gateway"];
  return healthAwareOrder([...new Set(order)].filter((route) => routeConfigured(route, env)));
}

const clamp = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

type OpenAICompatibleTarget = { baseURL: string; apiKey: string; headers: Record<string, string>; modelId: string; concurrencyCost?: number; credentialId?: string };
type StructuredUsage = { inputTokens?: number; outputTokens?: number; totalTokens?: number };

async function openAICompatibleTarget(decision: RouteDecision, env: ProviderEnvironment): Promise<OpenAICompatibleTarget> {
  if (decision.route === "groq") {
    if (!env.GROQ_API_KEY) throw new Error("Groq is not configured");
    const modelId = await selectGroqModel(decision.taskClass, env as NodeJS.ProcessEnv, { structured: true });
    return { baseURL: "https://api.groq.com/openai/v1", apiKey: env.GROQ_API_KEY, headers: {}, modelId };
  }
  const credential = selectFeatherlessCredential(env as NodeJS.ProcessEnv);
  const selected = await selectFeatherlessModel(decision.taskClass, env as NodeJS.ProcessEnv, credential);
  return {
    baseURL: "https://api.featherless.ai/v1",
    apiKey: credential.apiKey,
    headers: { "HTTP-Referer": env.APP_BASE_URL ?? "https://continuum.app", "X-Title": "Continuum" },
    modelId: selected.id,
    concurrencyCost: selected.concurrencyCost,
    credentialId: credential.id,
  };
}

/**
 * The AI SDK's OpenAI-compatible provider does not send `response_format:
 * json_schema`, so `Output.object` degrades to prompt-only JSON that reasoning
 * models frequently break. Groq and Featherless both honor json_schema over the
 * raw endpoint, so schema-bound generation calls it directly and validates with
 * Zod. `strict: false` is required because our schemas use optional fields.
 */
async function openAICompatibleStructured<T>(target: OpenAICompatibleTarget, request: { schema: z.ZodType<T>; system?: string; prompt: string; maxOutputTokens?: number; signal: AbortSignal }): Promise<{ output: T; usage: StructuredUsage }> {
  const jsonSchema = z.toJSONSchema(request.schema, { io: "output" }) as Record<string, unknown>;
  const response = await fetch(`${target.baseURL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${target.apiKey}`, ...target.headers },
    body: JSON.stringify({
      model: target.modelId,
      messages: [...(request.system ? [{ role: "system", content: request.system }] : []), { role: "user", content: request.prompt }],
      response_format: { type: "json_schema", json_schema: { name: "continuum_result", schema: jsonSchema, strict: false } },
      temperature: 0.2,
      ...(request.maxOutputTokens ? { max_tokens: request.maxOutputTokens } : {}),
    }),
    signal: request.signal,
  });
  if (!response.ok) throw new Error(`${target.modelId} structured completion failed (${response.status})`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
  const content = payload.choices?.[0]?.message?.content?.trim();
  // Empty-response detection: forward-dated or misconfigured model IDs can return
  // a 200 with empty content. Treat that as a hard failure so the route cascade
  // moves on instead of trying to JSON.parse "".
  if (!content) throw new Error(`${target.modelId} returned no structured content`);
  const output = request.schema.parse(JSON.parse(content));
  return { output, usage: { inputTokens: payload.usage?.prompt_tokens, outputTokens: payload.usage?.completion_tokens, totalTokens: payload.usage?.total_tokens } };
}

export async function generateStructured<T>(request: StructuredGenerationRequest<T>, env: ProviderEnvironment = providerEnvironmentFromProcess()) {
  // Hard wall-clock budget so a slow or non-conforming provider can never freeze
  // the caller. The route cascade fails fast within this deadline and the request
  // handler surfaces a recoverable error instead of hanging for minutes.
  const deadlineMs = clamp(Number(env.AI_STRUCTURED_DEADLINE_MS), 8_000, 90_000, 40_000);
  const perAttemptMs = clamp(Number(env.AI_ATTEMPT_TIMEOUT_MS), 4_000, 45_000, 20_000);
  const startedAt = Date.now();
  const remaining = () => deadlineMs - (Date.now() - startedAt);

  const routes = structuredRouteOrder(request.decision, env);
  const attempts: RouteDecision[] = routes.map((route, index) =>
    index === 0 && route === request.decision.route
      ? request.decision
      : ({
          ...request.decision,
          route,
          model: `${route}/structured`,
          reason: index === 0
            ? `${route} was selected first because it reliably returns schema-valid JSON for this task.`
            : `A preceding provider was unavailable; ${route} is the next configured provider that supports structured output.`,
          fallbackUsed: index > 0,
        } satisfies RouteDecision));
  let lastError: unknown;

  let totalAttempts = 0;
  for (let index = 0; index < attempts.length; index += 1) {
    const decision = attempts[index]!;
    // Gemini rotates through a couple of keys; every other provider gets a single
    // attempt so a hanging or non-conforming route cannot consume the whole budget
    // before the next provider is tried.
    const routeAttempts = decision.route === "gemini"
      ? Math.min(2, Math.max(1, geminiApiKeys(env as NodeJS.ProcessEnv).length))
      : decision.route === "featherless" && request.retrySafe !== false && ["classification", "extraction", "summarization", "misconception_diagnosis"].includes(decision.taskClass)
        ? Math.min(2, Math.max(1, featherlessCredentials(env as NodeJS.ProcessEnv).length))
        : 1;
    for (let routeAttempt = 0; routeAttempt < routeAttempts; routeAttempt += 1) {
      const budget = remaining();
      if (budget < 3_000) { lastError ??= new Error("Structured generation deadline exceeded"); break; }
      totalAttempts += 1;
      const attemptTimeout = Math.min(perAttemptMs, budget);
      const structuredSystem = [request.system, "Return valid JSON matching the requested schema. Do not add prose outside the JSON value."].filter(Boolean).join("\n\n");
      let attemptedCredentialId: string | undefined;
      try {
        if (decision.route === "groq" || decision.route === "featherless") {
          const target = await openAICompatibleTarget(decision, env);
          attemptedCredentialId = target.credentialId;
          const run = () => openAICompatibleStructured(target, { schema: request.schema, system: structuredSystem, prompt: request.prompt, maxOutputTokens: request.maxOutputTokens, signal: AbortSignal.timeout(attemptTimeout) });
          const result = decision.route === "featherless"
            ? await withFeatherlessExecution(target.credentialId!, target.concurrencyCost ?? 1, run, env as NodeJS.ProcessEnv)
            : await run();
          if (target.credentialId) recordFeatherlessCredentialSuccess(target.credentialId);
          recordSuccess(`route:${decision.route}`);
          return {
            output: result.output,
            decision: { ...decision, model: target.modelId, fallbackUsed: index > 0 || routeAttempt > 0 },
            attempts: totalAttempts,
            usage: result.usage,
          };
        }
        const target = await modelForDecision(decision, env, request.userId, true);
        const result = await generateText({
          model: target.model,
          output: Output.object({ schema: request.schema }),
          ...(target.providerOptions ? { providerOptions: target.providerOptions } : {}),
          system: structuredSystem,
          prompt: request.prompt,
          ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
          abortSignal: AbortSignal.timeout(attemptTimeout),
        });
        recordSuccess(`route:${decision.route}`);
        return {
          output: request.schema.parse(result.output),
          decision: { ...decision, model: target.modelId, fallbackUsed: index > 0 || routeAttempt > 0 },
          attempts: totalAttempts,
          usage: result.totalUsage,
        };
      } catch (error) {
        lastError = error;
        if (decision.route === "featherless") {
          // `openAICompatibleTarget` rotates on each bounded retry, while the
          // credential breaker keeps rate-limited or invalid keys out of later calls.
          if (attemptedCredentialId) recordFeatherlessCredentialFailure(attemptedCredentialId, error);
        }
        recordFailure(`route:${decision.route}`, error);
        if (process.env.AI_DEBUG_ROUTES === "true") console.error(`[generateStructured] ${decision.route} attempt failed:`, error instanceof Error ? error.message : error);
        if (routeAttempt + 1 < routeAttempts && remaining() > 3_000) await new Promise((resolve) => setTimeout(resolve, 250 * (routeAttempt + 1)));
      }
    }
    if (remaining() < 3_000) break;
  }
  throw lastError instanceof Error ? lastError : new Error("Every qualified model route failed");
}

export async function streamGeneration(request: StreamingGenerationRequest, env: ProviderEnvironment = providerEnvironmentFromProcess()) {
  const target = await modelForDecision(request.decision, env, request.userId);
  const [releaseConcurrency, releaseCredential] = target.provider === "featherless"
    ? await Promise.all([acquireFeatherlessConcurrency(target.concurrencyCost ?? 1, env as NodeJS.ProcessEnv), acquireFeatherlessCredentialLease(target.credentialId!)])
    : [undefined, undefined];
  let finished = false;
  const releaseOnce = () => {
    if (finished) return;
    finished = true;
    releaseCredential?.();
    releaseConcurrency?.();
  };
  try {
    const result = streamText({
      model: target.model,
      ...(target.providerOptions ? { providerOptions: target.providerOptions } : {}),
      system: request.system,
      prompt: request.prompt,
      ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
      abortSignal: request.abortSignal,
      onFinish: () => { recordSuccess(`route:${request.decision.route}`); if (target.credentialId) recordFeatherlessCredentialSuccess(target.credentialId); releaseOnce(); },
      onAbort: releaseOnce,
      onError: (event) => { const error = (event as { error?: unknown })?.error ?? event; recordFailure(`route:${request.decision.route}`, error); if (target.credentialId) recordFeatherlessCredentialFailure(target.credentialId, error); releaseOnce(); },
    });
    return { result, decision: { ...request.decision, model: target.modelId } };
  } catch (error) {
    recordFailure(`route:${request.decision.route}`, error);
    if (target.credentialId) recordFeatherlessCredentialFailure(target.credentialId, error);
    releaseOnce();
    throw error;
  }
}

export function configuredProviders(env: ProviderEnvironment = providerEnvironmentFromProcess()) {
  return {
    aiGateway: env.AI_GATEWAY_ENABLED === "true" && Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN),
    featherless: featherlessCredentials(env as NodeJS.ProcessEnv).length > 0,
    featherlessKeyCount: featherlessCredentials(env as NodeJS.ProcessEnv).length,
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
