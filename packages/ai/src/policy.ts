import { routeDecisionSchema, type RouteDecision } from "@continuum/schemas";

export interface RouteRequest {
  id: string;
  taskClass: RouteDecision["taskClass"];
  modality?: "text" | "image" | "pdf";
  sourceLocked?: boolean;
  highStakes?: boolean;
  schemaRequired?: boolean;
  availableProviders?: Array<"groq" | "featherless" | "gemini" | "ai_gateway">;
  now?: string;
}

/**
 * Tasks a small model answers well.
 *
 * `conversational_support` belongs here. It was falling through to the general
 * branch, which selects the reasoning model — so an assistant turn as short as
 * "hi" was answered by a 72B model on a four-unit concurrency plan and took
 * about half a minute. A chat turn that needs real depth arrives as
 * `research_synthesis` from Deep mode instead.
 */
const fastTasks = new Set<RouteDecision["taskClass"]>([
  "classification",
  "extraction",
  "summarization",
  "misconception_diagnosis",
  "conversational_support",
]);

/** Tasks where a person is waiting on the first token. */
const interactiveTasks = new Set<RouteDecision["taskClass"]>(["conversational_support"]);
const deterministicTasks = new Set<RouteDecision["taskClass"]>(["schedule_optimization"]);

export function routeTask(request: RouteRequest): RouteDecision {
  const available = new Set(request.availableProviders ?? ["groq", "featherless", "gemini", "ai_gateway"]);
  const base = {
    id: request.id,
    taskClass: request.taskClass,
    sourceMode: request.sourceLocked ? "source_locked" as const : "none" as const,
    fallbackUsed: false,
    createdAt: request.now ?? new Date().toISOString(),
  };

  if (deterministicTasks.has(request.taskClass)) {
    return routeDecisionSchema.parse({
      ...base,
      route: "deterministic",
      model: "continuum/constraint-solver-v1",
      reason: "Constraints, dependencies, dates, and arithmetic are solved deterministically.",
      verification: "not_required",
      costClass: "none",
    });
  }

  if (request.modality === "image" || request.modality === "pdf") {
    if (available.has("gemini")) return routeDecisionSchema.parse({
      ...base,
      route: "gemini",
      model: "google/gemini-multimodal",
      reason: "The task contains visual or document input and requires a multimodal route.",
      verification: request.highStakes ? "pending" : "not_required",
      costClass: "medium",
    });
  }

  if (request.taskClass === "citation_entailment" || request.highStakes) {
    if (available.has("featherless")) return routeDecisionSchema.parse({
      ...base,
      route: "featherless",
      model: "featherless/specialist-reasoning",
      reason: "Research-critical evidence checking needs strong reasoning and an independent verifier.",
      sourceMode: "retrieval",
      verification: "pending",
      costClass: "medium",
    });
  }

  // Someone is watching a cursor blink, so latency outranks everything else.
  // Featherless queues against a small shared concurrency pool; Groq answers a
  // short turn in well under a second, so the interactive path prefers it and
  // falls back to the small shared model when Groq is not configured.
  if (interactiveTasks.has(request.taskClass) && available.has("groq")) {
    return routeDecisionSchema.parse({
      ...base,
      route: "groq",
      model: "groq/fast-conversational",
      reason: "An interactive reply is latency-sensitive, so the lowest-latency qualified route was selected.",
      verification: "not_required",
      costClass: "low",
    });
  }

  if (fastTasks.has(request.taskClass) && available.has("featherless")) {
    return routeDecisionSchema.parse({
      ...base,
      route: "featherless",
      model: "featherless/catalog-selected-small-model",
      reason: "A small shared model is sufficient for this bounded task and preserves the stronger-model allowance.",
      verification: "not_required",
      costClass: "low",
    });
  }

  if (fastTasks.has(request.taskClass) && available.has("groq")) {
    return routeDecisionSchema.parse({
      ...base,
      route: "groq",
      model: "groq/fast-classifier",
      reason: "A low-latency structured fallback is sufficient for this bounded task.",
      verification: "not_required",
      costClass: "low",
    });
  }

  const preferred = available.has("featherless") ? "featherless" : available.has("gemini") ? "gemini" : available.has("ai_gateway") ? "ai_gateway" : "groq";
  return routeDecisionSchema.parse({
    ...base,
    route: preferred,
    model: `${preferred}/general-reasoning`,
    reason: "Selected the lowest-cost available general reasoning route that meets the task requirements.",
    sourceMode: request.sourceLocked ? "source_locked" : "retrieval",
    verification: request.sourceLocked ? "pending" : "not_required",
    costClass: "medium",
  });
}

export function fallbackRoute(decision: RouteDecision, failedProvider: string): RouteDecision {
  const fallback = decision.route === "groq" ? "featherless" : decision.route === "featherless" ? "ai_gateway" : "groq";
  return routeDecisionSchema.parse({
    ...decision,
    route: fallback,
    model: `${fallback}/fallback`,
    reason: `${failedProvider} was unavailable; the next qualified independent provider was selected.`,
    fallbackUsed: true,
  });
}

export function independentVerifier(decision: RouteDecision) {
  if (decision.verification !== "pending") return undefined;
  const provider = decision.route === "featherless" ? "ai_gateway" : "featherless";
  return { provider, model: `${provider}/evidence-verifier`, freshContext: true } as const;
}

export const routePolicyYaml = `
classification:
  prefer: featherless/catalog-small-fast
  max_latency_ms: 2500
  verify: false
lesson_generation:
  prefer: featherless/catalog-mid-reasoning
  retrieval_required: true
  verify_if_source_locked: true
citation_entailment:
  prefer: featherless/specialist-reasoning
  retrieval_required: true
  independent_verifier: true
image_understanding:
  require: multimodal
schedule_optimization:
  provider: deterministic
`.trim();
