import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, gateway, Output, type LanguageModel } from "ai";
import type { z } from "zod";
import { fallbackRoute } from "./policy";
import type { RouteDecision } from "@continuum/schemas";

export interface ProviderEnvironment {
  AI_GATEWAY_API_KEY?: string;
  AI_GATEWAY_GENERAL_MODEL?: string;
  AI_GATEWAY_MULTIMODAL_MODEL?: string;
  FEATHERLESS_API_KEY?: string;
  FEATHERLESS_MODEL?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
}

export interface StructuredGenerationRequest<T> {
  decision: RouteDecision;
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  maxOutputTokens?: number;
}

const defaults = {
  general: "google/gemini-3.5-flash",
  multimodal: "google/gemini-3.5-flash",
};

export function providerEnvironmentFromProcess(): ProviderEnvironment {
  return {
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    AI_GATEWAY_GENERAL_MODEL: process.env.AI_GATEWAY_GENERAL_MODEL,
    AI_GATEWAY_MULTIMODAL_MODEL: process.env.AI_GATEWAY_MULTIMODAL_MODEL,
    FEATHERLESS_API_KEY: process.env.FEATHERLESS_API_KEY,
    FEATHERLESS_MODEL: process.env.FEATHERLESS_MODEL,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: process.env.GROQ_MODEL,
  };
}

function modelForDecision(decision: RouteDecision, env: ProviderEnvironment): LanguageModel {
  if (decision.route === "deterministic") throw new Error("Deterministic tasks must not invoke a language model");
  if (decision.route === "groq") {
    if (!env.GROQ_API_KEY || !env.GROQ_MODEL) throw new Error("Groq is not configured");
    return createOpenAICompatible({ name: "groq", apiKey: env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" }).languageModel(env.GROQ_MODEL);
  }
  if (decision.route === "featherless") {
    if (!env.FEATHERLESS_API_KEY || !env.FEATHERLESS_MODEL) throw new Error("Featherless is not configured");
    return createOpenAICompatible({ name: "featherless", apiKey: env.FEATHERLESS_API_KEY, baseURL: "https://api.featherless.ai/v1" }).languageModel(env.FEATHERLESS_MODEL);
  }
  if (!env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) throw new Error("AI Gateway is not configured");
  const id = decision.route === "gemini"
    ? env.AI_GATEWAY_MULTIMODAL_MODEL ?? defaults.multimodal
    : env.AI_GATEWAY_GENERAL_MODEL ?? defaults.general;
  return gateway(id);
}

export async function generateStructured<T>(request: StructuredGenerationRequest<T>, env: ProviderEnvironment = providerEnvironmentFromProcess()) {
  const attempts: RouteDecision[] = [request.decision];
  if (request.decision.route !== "deterministic") attempts.push(fallbackRoute(request.decision, request.decision.route));
  let lastError: unknown;

  for (let index = 0; index < attempts.length; index += 1) {
    const decision = attempts[index]!;
    try {
      const result = await generateText({
        model: modelForDecision(decision, env),
        output: Output.object({ schema: request.schema }),
        ...(request.system ? { system: request.system } : {}),
        prompt: request.prompt,
        ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
      });
      return {
        output: request.schema.parse(result.output),
        decision,
        attempts: index + 1,
        usage: result.totalUsage,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Every qualified model route failed");
}

export function configuredProviders(env: ProviderEnvironment = providerEnvironmentFromProcess()) {
  return {
    aiGateway: Boolean(env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
    featherless: Boolean(env.FEATHERLESS_API_KEY && env.FEATHERLESS_MODEL),
    groq: Boolean(env.GROQ_API_KEY && env.GROQ_MODEL),
    gatewayModels: {
      general: env.AI_GATEWAY_GENERAL_MODEL ?? defaults.general,
      multimodal: env.AI_GATEWAY_MULTIMODAL_MODEL ?? defaults.multimodal,
    },
  };
}
