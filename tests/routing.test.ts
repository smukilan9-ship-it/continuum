import { describe, expect, it } from "vitest";
import { fallbackRoute, independentVerifier, routeTask } from "../packages/ai/src/policy";
import { enforceDailyTokenCap, runWithValidation } from "../packages/ai/src/validation";
import { configuredProviders, generationRouteOrder, structuredRouteOrder } from "../packages/ai/src/providers";
import { z } from "zod";

describe("model routing", () => {
  it("uses deterministic code for scheduling", () => {
    expect(routeTask({ id: "route_schedule", taskClass: "schedule_optimization" }).route).toBe("deterministic");
  });

  it("routes bounded classification to a fast provider", () => {
    expect(routeTask({ id: "route_classify", taskClass: "classification" }).route).toBe("featherless");
  });

  /**
   * A chat turn used to fall through to the general branch and pick the
   * reasoning model, so "hi" was answered by a 72B model on a four-unit
   * concurrency plan and took about thirty seconds.
   */
  it("never sends an interactive chat turn to the reasoning model", () => {
    const decision = routeTask({
      id: "route_chat",
      taskClass: "conversational_support",
      availableProviders: ["featherless", "groq", "gemini", "ai_gateway"],
    });
    expect(decision.costClass).toBe("low");
    expect(decision.model).not.toMatch(/reasoning|specialist/i);
  });

  it("prefers the lowest-latency route for an interactive chat turn", () => {
    expect(routeTask({
      id: "route_chat_groq",
      taskClass: "conversational_support",
      availableProviders: ["featherless", "groq"],
    }).route).toBe("groq");
  });

  it("still answers a chat turn on a small shared model when groq is absent", () => {
    const decision = routeTask({
      id: "route_chat_nogroq",
      taskClass: "conversational_support",
      availableProviders: ["featherless"],
    });
    expect(decision.route).toBe("featherless");
    expect(decision.costClass).toBe("low");
  });

  it("keeps the stronger route when the user explicitly asks for depth", () => {
    const decision = routeTask({
      id: "route_deep",
      taskClass: "research_synthesis",
      availableProviders: ["featherless", "groq"],
    });
    expect(decision.costClass).toBe("medium");
  });

  it("uses a multimodal provider for images", () => {
    expect(routeTask({ id: "route_image", taskClass: "image_understanding", modality: "image" }).route).toBe("gemini");
  });

  it("selects an independent verifier for high-risk claims", () => {
    const route = routeTask({ id: "route_claim", taskClass: "citation_entailment", highStakes: true, sourceLocked: true });
    const verifier = independentVerifier(route)!;
    expect(route.route).toBe("featherless");
    expect(verifier.provider).not.toBe(route.route);
    expect(verifier.freshContext).toBe(true);
  });

  it("falls back to a different provider", () => {
    const route = routeTask({ id: "route_fallback", taskClass: "classification" });
    const fallback = fallbackRoute(route, "groq");
    expect(fallback.fallbackUsed).toBe(true);
    expect(fallback.route).not.toBe(route.route);
  });

  it("escalates after schema failure", async () => {
    const result = await runWithValidation(z.object({ answer: z.string() }), [async () => ({ wrong: true }), async () => ({ answer: "valid" })]);
    expect(result.escalated).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it("enforces daily token caps", () => {
    const usage = [{ userId: "user_maya", routeId: "route_1", inputTokens: 600, outputTokens: 300, occurredAt: "2026-07-18T09:00:00+05:30" }];
    expect(() => enforceDailyTokenCap(usage, "user_maya", 1000, 200, "2026-07-18T10:00:00+05:30")).toThrow(/cap/i);
  });

  it("reports provider availability without exposing keys", () => {
    const providers = configuredProviders({ AI_GATEWAY_ENABLED: "true", AI_GATEWAY_API_KEY: "secret", GROQ_API_KEY: "secret" });
    expect(providers).toEqual(expect.objectContaining({ aiGateway: true, groq: true, featherless: false }));
    expect(providers.gatewayModels.fallbacks).toEqual(["openai/gpt-5.4", "anthropic/claude-sonnet-4.6"]);
    expect(JSON.stringify(providers)).not.toContain("secret");
    expect(providers.groqModels?.fast).toBe("llama-3.1-8b-instant");
  });

  it("leads structured generation with the policy route and keeps every qualified provider", () => {
    const decision = routeTask({ id: "route_structured", taskClass: "research_synthesis", availableProviders: ["featherless", "gemini", "groq", "ai_gateway"] });
    const env = { FEATHERLESS_API_KEY_PRIMARY: "configured", GROQ_API_KEY: "configured", GEMINI_API_KEY: "configured", GEMINI_DATA_USE_ACKNOWLEDGED: "true", AI_GATEWAY_API_KEY: "configured", AI_GATEWAY_ENABLED: "true" };
    const order = structuredRouteOrder(decision, env);
    expect(order[0]).toBe("featherless");
    expect(new Set(order)).toEqual(new Set(["groq", "featherless", "gemini", "ai_gateway"]));
  });

  it("falls back to the routed provider for structured generation when Groq is absent", () => {
    const decision = routeTask({ id: "route_structured_nogroq", taskClass: "citation_entailment", highStakes: true, availableProviders: ["featherless", "gemini"] });
    const order = structuredRouteOrder(decision, { FEATHERLESS_API_KEY_PRIMARY: "configured", GEMINI_API_KEY: "configured", GEMINI_DATA_USE_ACKNOWLEDGED: "true" });
    expect(order[0]).toBe("featherless");
    expect(order).not.toContain("groq");
  });

  it("keeps every configured provider in the generation fallback path", () => {
    const decision = routeTask({ id: "route_all_fallbacks", taskClass: "lesson_generation", availableProviders: ["featherless", "gemini", "groq", "ai_gateway"] });
    expect(generationRouteOrder(decision, {
      FEATHERLESS_API_KEY_PRIMARY: "configured",
      GROQ_API_KEY: "configured",
      GEMINI_API_KEY: "configured",
      GEMINI_DATA_USE_ACKNOWLEDGED: "true",
      AI_GATEWAY_API_KEY: "configured",
      AI_GATEWAY_ENABLED: "true",
    })).toEqual(["featherless", "gemini", "groq", "ai_gateway"]);
  });
});
