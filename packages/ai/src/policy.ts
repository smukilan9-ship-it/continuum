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

const fastTasks = new Set<RouteDecision["taskClass"]>(["classification", "extraction", "summarization", "misconception_diagnosis"]);
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

  if (fastTasks.has(request.taskClass) && available.has("groq")) {
    return routeDecisionSchema.parse({
      ...base,
      route: "groq",
      model: "groq/fast-classifier",
      reason: "A low-latency structured route is sufficient for this bounded task.",
      verification: "not_required",
      costClass: "low",
    });
  }

  const preferred = available.has("ai_gateway") ? "ai_gateway" : available.has("featherless") ? "featherless" : available.has("groq") ? "groq" : "gemini";
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
  prefer: groq/fast-classifier
  max_latency_ms: 2500
  verify: false
lesson_generation:
  prefer: ai_gateway/general-reasoning
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
