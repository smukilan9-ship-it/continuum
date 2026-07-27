import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  configuredProviders,
  generateStructured,
  providerEnvironmentFromProcess,
  routeTask,
  streamGeneration,
  type ProviderEnvironment,
} from "@continuum/ai";
import type { RouteDecision } from "@continuum/schemas";
import { NeonRepository } from "@continuum/db";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { checkDailyAiBudget, checkSharedAiBudget, logModelUsage } from "./ai-budget";
import { enforceRateLimit } from "./auth";
import { getUserProviderSecret } from "./provider-credentials";

export type AiGatewayErrorCode =
  | "service_busy"
  | "daily_allowance_reached"
  | "request_too_large"
  | "model_unavailable";

export class AiGatewayError extends Error {
  constructor(
    readonly code: AiGatewayErrorCode,
    message: string,
    readonly status: number,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "AiGatewayError";
  }
}

type GatewayContext = {
  request: Request;
  userId: string;
  feature: string;
  taskClass: RouteDecision["taskClass"];
  prompt: string;
  system?: string;
  sourceLocked?: boolean;
  highStakes?: boolean;
  maxOutputTokens?: number;
  allowedProviders?: Array<"featherless" | "groq" | "gemini" | "ai_gateway">;
  credentialMode?: "platform" | "user";
};

type StructuredGatewayRequest<T> = GatewayContext & {
  schema: z.ZodType<T>;
  cacheable?: boolean;
};

const safeCacheTasks = new Set<RouteDecision["taskClass"]>([
  "classification",
  "extraction",
  "summarization",
  "misconception_diagnosis",
  "lesson_generation",
]);
const structuredCache = new Map<string, { expiresAt: number; value: unknown }>();
const structuredInflight = new Map<string, Promise<unknown>>();
const localLeases = new Set<string>();

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function tokenEstimate(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

function availableProviders(environment: ProviderEnvironment, allowed?: GatewayContext["allowedProviders"]) {
  const providers = configuredProviders(environment);
  const available = [
    ...(providers.featherless ? ["featherless" as const] : []),
    ...(providers.groq ? ["groq" as const] : []),
    ...(providers.gemini ? ["gemini" as const] : []),
    ...(providers.aiGateway ? ["ai_gateway" as const] : []),
  ];
  return allowed?.length ? available.filter((provider) => allowed.includes(provider)) : available;
}

export function availableAiProviders() {
  return availableProviders(providerEnvironmentFromProcess());
}

export async function availableAssistantProvidersForUser(userId: string) {
  return availableProviders(await gatewayEnvironment(false, userId, undefined, "user"));
}

function cacheKey(input: GatewayContext) {
  return createHash("sha256")
    .update(JSON.stringify({
      userId: input.userId,
      feature: input.feature,
      taskClass: input.taskClass,
      prompt: input.prompt,
      system: input.system,
      sourceLocked: input.sourceLocked,
      maxOutputTokens: input.maxOutputTokens,
      allowedProviders: input.allowedProviders,
      credentialMode: input.credentialMode ?? "platform",
    }))
    .digest("base64url");
}

function pruneCache(now = Date.now()) {
  if (structuredCache.size < 256) return;
  for (const [key, entry] of structuredCache) if (entry.expiresAt <= now) structuredCache.delete(key);
  while (structuredCache.size > 256) structuredCache.delete(structuredCache.keys().next().value as string);
}

async function gatewayEnvironment(
  conserve: boolean,
  userId: string,
  allowedProviders?: GatewayContext["allowedProviders"],
  credentialMode: GatewayContext["credentialMode"] = "platform",
) {
  const environment = providerEnvironmentFromProcess();
  if (credentialMode === "user") {
    environment.FEATHERLESS_API_KEY_PRIMARY = undefined;
    environment.FEATHERLESS_API_KEY_SECONDARY = undefined;
    environment.GROQ_API_KEY = undefined;
    environment.GEMINI_API_KEY = undefined;
    environment.GEMINI_API_KEYS = undefined;
    environment.GEMINI_DATA_USE_ACKNOWLEDGED = undefined;
    environment.AI_GATEWAY_ENABLED = "false";
    environment.AI_GATEWAY_API_KEY = undefined;
    environment.VERCEL_OIDC_TOKEN = undefined;
    for (let index = 1; index <= 10; index += 1) environment[`GEMINI_API_KEY_${index}`] = undefined;
  }
  if (credentialMode === "user" && process.env.DATABASE_URL) {
    const [featherless, groq, gemini] = await Promise.all([
      getUserProviderSecret(userId, "featherless").catch(() => undefined),
      getUserProviderSecret(userId, "groq").catch(() => undefined),
      getUserProviderSecret(userId, "gemini").catch(() => undefined),
    ]);
    if (featherless?.secret) {
      environment.FEATHERLESS_API_KEY_PRIMARY = featherless.secret;
      environment.FEATHERLESS_API_KEY_SECONDARY = undefined;
    }
    if (groq?.secret) environment.GROQ_API_KEY = groq.secret;
    if (gemini?.secret) {
      environment.GEMINI_API_KEY = gemini.secret;
      environment.GEMINI_API_KEYS = undefined;
      environment.GEMINI_DATA_USE_ACKNOWLEDGED = "true";
      for (let index = 1; index <= 10; index += 1) environment[`GEMINI_API_KEY_${index}`] = undefined;
    }
  }
  if (allowedProviders?.length) {
    const allowed = new Set(allowedProviders);
    if (!allowed.has("featherless")) {
      environment.FEATHERLESS_API_KEY_PRIMARY = undefined;
      environment.FEATHERLESS_API_KEY_SECONDARY = undefined;
    }
    if (!allowed.has("groq")) environment.GROQ_API_KEY = undefined;
    if (!allowed.has("gemini")) {
      environment.GEMINI_API_KEY = undefined;
      environment.GEMINI_API_KEYS = undefined;
      environment.GEMINI_DATA_USE_ACKNOWLEDGED = undefined;
      for (let index = 1; index <= 10; index += 1) environment[`GEMINI_API_KEY_${index}`] = undefined;
    }
    if (!allowed.has("ai_gateway")) {
      environment.AI_GATEWAY_ENABLED = "false";
      environment.AI_GATEWAY_API_KEY = undefined;
      environment.VERCEL_OIDC_TOKEN = undefined;
    }
  }
  if (conserve) {
    const fast = environment.FEATHERLESS_FAST_MODEL ?? environment.FEATHERLESS_FALLBACK_MODEL;
    if (fast) {
      environment.FEATHERLESS_REASONING_MODEL = fast;
      environment.FEATHERLESS_CODE_MODEL = fast;
    }
  }
  environment.AI_STRUCTURED_DEADLINE_MS = String(requestTimeoutMs());
  environment.AI_ATTEMPT_TIMEOUT_MS = String(Math.min(requestTimeoutMs(), 16_000));
  return environment;
}

function requestTimeoutMs() {
  return boundedNumber(process.env.AI_REQUEST_TIMEOUT_MS, 30_000, 5_000, 55_000);
}

async function acquireGlobalLease(userId: string, feature: string) {
  const limit = boundedNumber(process.env.AI_GLOBAL_CONCURRENCY_LIMIT, 4, 1, 32);
  const id = `ai_lease_${randomUUID().replaceAll("-", "")}`;
  if (process.env.DATABASE_URL) {
    const acquired = await new NeonRepository().acquireAiRequestLease({
      id,
      userId,
      feature,
      limit,
      expiresAt: new Date(Date.now() + requestTimeoutMs() + 10_000).toISOString(),
    });
    if (!acquired) throw new AiGatewayError("service_busy", "Continuum AI is busy right now. Please try again shortly.", 503, 15);
    return async () => { await new NeonRepository().releaseAiRequestLease(id).catch(() => undefined); };
  }
  if (localLeases.size >= limit) throw new AiGatewayError("service_busy", "Continuum AI is busy right now. Please try again shortly.", 503, 15);
  localLeases.add(id);
  return async () => { localLeases.delete(id); };
}

async function authorizeGatewayRequest(input: GatewayContext) {
  if (process.env.AI_EMERGENCY_CUTOFF === "true") {
    throw new AiGatewayError("model_unavailable", "AI assistance is temporarily unavailable while Continuum completes a service check.", 503, 60);
  }
  const maximumInput = boundedNumber(process.env.AI_MAX_INPUT_TOKENS, 12_000, 500, 100_000);
  const maximumOutput = boundedNumber(process.env.AI_MAX_OUTPUT_TOKENS, 2_400, 100, 8_000);
  const inputTokens = tokenEstimate(`${input.system ?? ""}\n${input.prompt}`);
  const outputTokens = Math.min(Math.max(1, input.maxOutputTokens ?? 1_200), maximumOutput);
  if (inputTokens > maximumInput) {
    throw new AiGatewayError("request_too_large", `This request is too large. Shorten it to about ${maximumInput.toLocaleString()} tokens and try again.`, 413);
  }
  const minuteCap = boundedNumber(process.env.AI_PER_USER_REQUESTS_PER_MINUTE, 6, 1, 120);
  const dailyCap = boundedNumber(process.env.AI_PER_USER_REQUESTS_PER_DAY, 60, 1, 2_000);
  const [minute, daily] = await Promise.all([
    enforceRateLimit(input.request, "ai-gateway-minute", minuteCap, 60_000, input.userId),
    enforceRateLimit(input.request, "ai-gateway-day", dailyCap, 86_400_000, input.userId),
  ]);
  if (!minute.allowed) throw new AiGatewayError("service_busy", "You are sending requests too quickly. Please wait a moment and try again.", 429, 60);
  if (!daily.allowed) throw new AiGatewayError("daily_allowance_reached", "You have reached today’s AI allowance. Your saved work is still available.", 429, 3_600);
  const requestedTokens = inputTokens + outputTokens;
  try {
    const [userBudget, sharedBudget] = await Promise.all([
      checkDailyAiBudget(input.userId, requestedTokens),
      checkSharedAiBudget(requestedTokens),
    ]);
    return { inputTokens, outputTokens, conserve: sharedBudget.nearLimit || userBudget.remaining < requestedTokens * 2 };
  } catch (error) {
    const shared = error instanceof Error && error.message.includes("Shared");
    throw new AiGatewayError(
      "daily_allowance_reached",
      shared ? "Continuum’s shared AI allowance is nearly exhausted. Please try again later." : "You have reached today’s AI allowance. Your saved work is still available.",
      429,
      3_600,
    );
  }
}

function decisionFor(input: GatewayContext, environment: ProviderEnvironment, conserve: boolean) {
  const available = availableProviders(environment, input.allowedProviders);
  if (!available.length) throw new AiGatewayError("model_unavailable", "AI assistance is temporarily unavailable. Please try again later.", 503, 60);
  const decision = routeTask({
    id: `route_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
    taskClass: input.taskClass,
    sourceLocked: input.sourceLocked,
    highStakes: input.highStakes,
    schemaRequired: true,
    availableProviders: available,
  });
  return conserve
    ? { ...decision, costClass: "low" as const, reason: `${decision.reason} Continuum selected the lower-cost qualified model because the shared allowance is near its limit.` }
    : decision;
}

function providerFailure(error: unknown): AiGatewayError {
  if (error instanceof AiGatewayError) return error;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timeout") || message.includes("429") || message.includes("backing off") || message.includes("concurrency")) {
    return new AiGatewayError("service_busy", "Continuum AI is busy right now. Please try again shortly.", 503, 20);
  }
  return new AiGatewayError("model_unavailable", "The model needed for this request is temporarily unavailable. Please try again.", 503, 60);
}

export function aiErrorResponse(error: unknown) {
  const safe = providerFailure(error);
  return NextResponse.json(
    { error: safe.message, code: safe.code },
    { status: safe.status, headers: { "cache-control": "no-store", ...(safe.retryAfter ? { "retry-after": String(safe.retryAfter) } : {}) } },
  );
}

export async function runStructuredAi<T>(input: StructuredGatewayRequest<T>) {
  const limits = await authorizeGatewayRequest(input);
  const canCache = input.cacheable === true && !input.highStakes && safeCacheTasks.has(input.taskClass);
  const key = canCache ? cacheKey(input) : undefined;
  const cached = key ? structuredCache.get(key) : undefined;
  if (cached && cached.expiresAt > Date.now()) return { ...(cached.value as object), cached: true } as {
    output: T; decision: RouteDecision; usage?: unknown; cached: true;
  };
  if (key && structuredInflight.has(key)) {
    return { ...(await structuredInflight.get(key) as object), cached: true } as {
      output: T; decision: RouteDecision; usage?: unknown; cached: true;
    };
  }

  const execute = async () => {
    const environment = await gatewayEnvironment(limits.conserve, input.userId, input.allowedProviders, input.credentialMode);
    const decision = decisionFor(input, environment, limits.conserve);
    const release = await acquireGlobalLease(input.userId, input.feature);
    try {
      const result = await generateStructured({
        decision,
        schema: input.schema,
        prompt: input.prompt,
        system: input.system,
        userId: input.userId,
        maxOutputTokens: limits.outputTokens,
        retrySafe: !input.highStakes && safeCacheTasks.has(input.taskClass),
      }, environment);
      await logModelUsage({ userId: input.userId, feature: input.feature, decision: result.decision, usage: result.usage });
      return result;
    } catch (error) {
      throw providerFailure(error);
    } finally {
      await release();
    }
  };

  const promise = execute();
  if (key) structuredInflight.set(key, promise);
  try {
    const result = await promise;
    if (key) {
      pruneCache();
      structuredCache.set(key, { value: result, expiresAt: Date.now() + boundedNumber(process.env.AI_SAFE_CACHE_TTL_SECONDS, 300, 10, 3_600) * 1_000 });
    }
    return { ...result, cached: false };
  } finally {
    if (key) structuredInflight.delete(key);
  }
}

export async function runStreamingAi(input: GatewayContext) {
  const limits = await authorizeGatewayRequest(input);
  const environment = await gatewayEnvironment(limits.conserve, input.userId, input.allowedProviders, input.credentialMode);
  const decision = decisionFor(input, environment, limits.conserve);
  const release = await acquireGlobalLease(input.userId, input.feature);
  try {
    const abortSignal = AbortSignal.any([input.request.signal, AbortSignal.timeout(requestTimeoutMs())]);
    const result = await streamGeneration({
      decision,
      system: input.system,
      prompt: input.prompt,
      userId: input.userId,
      maxOutputTokens: limits.outputTokens,
      abortSignal,
    }, environment);
    void Promise.resolve(result.result.totalUsage)
      .then((usage) => logModelUsage({ userId: input.userId, feature: input.feature, decision: result.decision, usage }))
      .catch(() => undefined)
      .finally(release);
    return result;
  } catch (error) {
    await release();
    throw providerFailure(error);
  }
}
