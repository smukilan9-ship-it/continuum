import type { RouteDecision } from "@continuum/schemas";

export interface FeatherlessPlan {
  id: string;
  name: string;
  max_context_length: number | null;
  max_model_size: number | null;
  concurrency: number;
}

export interface FeatherlessModel {
  id: string;
  context_length: number;
  max_completion_tokens: number;
  available_on_current_plan?: boolean;
  status?: "active" | "pending_deploy" | "not_deployed";
  concurrency_cost?: number;
  parameter_size?: number;
  vision_supported?: boolean;
  input_modalities?: string[];
  output_modalities?: string[];
  tasks?: string[];
  domains?: string[];
  features?: { tool_use?: boolean };
  availability?: { tier?: string; is_hot_live?: boolean; is_hot_recent?: boolean };
}

type CacheEntry<T> = { value: T; expiresAt: number };
let planCache: CacheEntry<FeatherlessPlan> | undefined;
let modelCache: CacheEntry<FeatherlessModel[]> | undefined;
let modelErrorCache: CacheEntry<string> | undefined;

// Featherless removed its public `/v1/models` catalogue endpoint (it now returns
// 410/404 "Gone"), so live discovery is no longer available on this plan and the
// selector relies on these curated IDs. Every ID below has been verified to
// return real, non-empty completions on the configured Feather Chat plan
// (Qwen2.5 family). The previously shipped Qwen3.x IDs were forward-dated and
// silently returned empty 200s.
const curatedModels: Record<string, { id: string; concurrencyCost: number }> = {
  fast: { id: "Qwen/Qwen2.5-7B-Instruct", concurrencyCost: 1 },
  reasoning: { id: "Qwen/Qwen2.5-72B-Instruct", concurrencyCost: 2 },
  code: { id: "Qwen/Qwen2.5-Coder-32B-Instruct", concurrencyCost: 2 },
  verifier: { id: "Qwen/Qwen2.5-72B-Instruct", concurrencyCost: 2 },
};

function headers(apiKey: string, env: NodeJS.ProcessEnv) {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": env.APP_BASE_URL ?? "https://continuum.app",
    "X-Title": "Continuum",
  };
}

export async function getFeatherlessPlan(apiKey = process.env.FEATHERLESS_API_KEY, env: NodeJS.ProcessEnv = process.env) {
  if (!apiKey) throw new Error("Featherless is not configured");
  if (planCache && planCache.expiresAt > Date.now()) return planCache.value;
  const response = await fetch("https://api.featherless.ai/v1/plan", { headers: headers(apiKey, env), signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Featherless plan lookup failed (${response.status})`);
  const value = await response.json() as FeatherlessPlan;
  planCache = { value, expiresAt: Date.now() + 5 * 60_000 };
  return value;
}

export async function listFeatherlessModels(apiKey = process.env.FEATHERLESS_API_KEY, env: NodeJS.ProcessEnv = process.env) {
  if (!apiKey) throw new Error("Featherless is not configured");
  if (modelCache && modelCache.expiresAt > Date.now()) return modelCache.value;
  if (modelErrorCache && modelErrorCache.expiresAt > Date.now()) throw new Error(modelErrorCache.value);
  const url = new URL("https://api.featherless.ai/v1/models");
  url.searchParams.set("available_on_current_plan", "true");
  url.searchParams.set("status", "active");
  url.searchParams.set("conversational", "true");
  url.searchParams.set("sort", "-popularity");
  url.searchParams.set("per_page", "250");
  const response = await fetch(url, { headers: headers(apiKey, env), signal: AbortSignal.timeout(12_000) });
  if (!response.ok) {
    const message = `Featherless model catalog lookup failed (${response.status})`;
    modelErrorCache = { value: message, expiresAt: Date.now() + 60_000 };
    throw new Error(message);
  }
  const payload = await response.json() as { data?: FeatherlessModel[] };
  const value = (payload.data ?? []).filter((model) => model.available_on_current_plan !== false && model.status !== "not_deployed");
  modelCache = { value, expiresAt: Date.now() + 5 * 60_000 };
  modelErrorCache = undefined;
  return value;
}

function modelOverride(taskClass: RouteDecision["taskClass"], env: NodeJS.ProcessEnv) {
  if (taskClass === "classification" || taskClass === "extraction" || taskClass === "misconception_diagnosis") return env.FEATHERLESS_FAST_MODEL;
  if (taskClass === "code_reasoning") return env.FEATHERLESS_CODE_MODEL;
  if (taskClass === "citation_entailment") return env.FEATHERLESS_VERIFIER_MODEL ?? env.FEATHERLESS_REASONING_MODEL;
  return env.FEATHERLESS_REASONING_MODEL ?? env.FEATHERLESS_MODEL;
}

function curatedModel(taskClass: RouteDecision["taskClass"], env: NodeJS.ProcessEnv) {
  if (env.FEATHERLESS_FALLBACK_MODEL) {
    return { id: env.FEATHERLESS_FALLBACK_MODEL, concurrencyCost: Number(env.FEATHERLESS_MODEL_CONCURRENCY_COST ?? 1) };
  }
  if (["classification", "extraction", "summarization", "misconception_diagnosis"].includes(taskClass)) return curatedModels.fast!;
  if (taskClass === "code_reasoning") return curatedModels.code!;
  if (taskClass === "citation_entailment") return curatedModels.verifier!;
  return curatedModels.reasoning!;
}

function concurrencyCostForModel(modelId: string, env: NodeJS.ProcessEnv) {
  const reviewed = Object.values(curatedModels).find((model) => model.id === modelId);
  return reviewed?.concurrencyCost ?? Number(env.FEATHERLESS_MODEL_CONCURRENCY_COST ?? 1);
}

function allowlist(env: NodeJS.ProcessEnv) {
  return new Set((env.FEATHERLESS_MODEL_ALLOWLIST ?? "").split(",").map((value) => value.trim()).filter(Boolean));
}

function candidateScore(model: FeatherlessModel, taskClass: RouteDecision["taskClass"], plan: FeatherlessPlan, env: NodeJS.ProcessEnv) {
  const allowed = allowlist(env);
  if (allowed.size && !allowed.has(model.id)) return Number.NEGATIVE_INFINITY;
  if (model.available_on_current_plan === false || model.status === "not_deployed") return Number.NEGATIVE_INFINITY;
  const contextLimit = Math.min(model.context_length ?? 0, plan.max_context_length ?? Number.POSITIVE_INFINITY);
  if (contextLimit < 8_000) return Number.NEGATIVE_INFINITY;
  const id = model.id.toLowerCase();
  const parameters = model.parameter_size ?? 0;
  const cost = model.concurrency_cost ?? (parameters >= 70e9 ? 4 : parameters >= 16e9 ? 2 : 1);
  const fast = ["classification", "extraction", "summarization", "misconception_diagnosis"].includes(taskClass);
  const code = taskClass === "code_reasoning";
  const highReasoning = ["citation_entailment", "research_synthesis", "mathematical_reasoning"].includes(taskClass);
  let score = 0;
  score += model.availability?.is_hot_live ? 2.5 : model.availability?.is_hot_recent ? 1.2 : model.availability?.tier === "cold" ? -1 : 0;
  score += Math.min(contextLimit / 32_768, 2);
  score += model.features?.tool_use ? 0.4 : 0;
  if (fast) score += cost === 1 ? 3 : cost === 2 ? 1 : -2;
  if (highReasoning) score += cost >= 2 ? 2 : 0;
  if (code) score += id.includes("coder") || id.includes("code") ? 4 : -1;
  if (highReasoning && (id.includes("reason") || id.includes("deepseek") || id.includes("kimi") || id.includes("qwen3"))) score += 2;
  if (fast && (id.includes("instruct") || id.includes("qwen"))) score += 0.8;
  score -= cost * 0.35;
  return score;
}

export async function selectFeatherlessModel(taskClass: RouteDecision["taskClass"], env: NodeJS.ProcessEnv = process.env) {
  const override = modelOverride(taskClass, env);
  if (override) return { id: override, concurrencyCost: concurrencyCostForModel(override, env), selectedBy: "configured_policy" as const };
  try {
    const [plan, models] = await Promise.all([getFeatherlessPlan(env.FEATHERLESS_API_KEY, env), listFeatherlessModels(env.FEATHERLESS_API_KEY, env)]);
    const selected = models.map((model) => ({ model, score: candidateScore(model, taskClass, plan, env) })).filter((entry) => Number.isFinite(entry.score)).sort((left, right) => right.score - left.score || left.model.id.localeCompare(right.model.id))[0];
    if (!selected) throw new Error("No evaluated Featherless model matches this task and plan");
    return { id: selected.model.id, concurrencyCost: selected.model.concurrency_cost ?? 1, selectedBy: "live_catalog_policy" as const, planConcurrency: plan.concurrency };
  } catch (error) {
    const fallback = curatedModel(taskClass, env);
    return {
      ...fallback,
      selectedBy: "curated_fallback_policy" as const,
      catalogError: error instanceof Error ? error.message : "Featherless model catalog unavailable",
    };
  }
}

type Waiter = { weight: number; limit: number; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
let localConcurrencyUsed = 0;
const waiters: Waiter[] = [];

function drainWaiters() {
  for (let index = 0; index < waiters.length;) {
    const waiter = waiters[index]!;
    if (localConcurrencyUsed + waiter.weight > waiter.limit) { index += 1; continue; }
    waiters.splice(index, 1);
    clearTimeout(waiter.timer);
    localConcurrencyUsed += waiter.weight;
    waiter.resolve();
  }
}

async function acquire(weight: number, limit: number) {
  const boundedWeight = Math.max(1, Math.min(weight, limit));
  if (localConcurrencyUsed + boundedWeight <= limit) {
    localConcurrencyUsed += boundedWeight;
    return boundedWeight;
  }
  await new Promise<void>((resolve, reject) => {
    const waiter: Waiter = {
      weight: boundedWeight,
      limit,
      resolve,
      reject,
      timer: setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error("Featherless concurrency queue timed out"));
      }, 20_000),
    };
    waiters.push(waiter);
  });
  return boundedWeight;
}

export async function acquireFeatherlessConcurrency(concurrencyCost: number, env: NodeJS.ProcessEnv = process.env) {
  let limit = Number(env.FEATHERLESS_CONCURRENCY_UNITS ?? 4);
  if (!Number.isInteger(limit) || limit < 1 || limit > 64) limit = 4;
  const acquired = await acquire(concurrencyCost, limit);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    localConcurrencyUsed = Math.max(0, localConcurrencyUsed - acquired);
    drainWaiters();
  };
}

export async function withFeatherlessConcurrency<T>(concurrencyCost: number, run: () => Promise<T>, env: NodeJS.ProcessEnv = process.env) {
  const release = await acquireFeatherlessConcurrency(concurrencyCost, env);
  try { return await run(); }
  finally { release(); }
}

export async function featherlessStatus(env: NodeJS.ProcessEnv = process.env) {
  if (!env.FEATHERLESS_API_KEY) return { configured: false as const };
  try {
    const plan = await getFeatherlessPlan(env.FEATHERLESS_API_KEY, env);
    let catalog: { reachable: boolean; eligibleModels?: number; mode: "live_catalog" | "curated_verified" } = { reachable: false, mode: "curated_verified" };
    try { const models = await listFeatherlessModels(env.FEATHERLESS_API_KEY, env); catalog = { reachable: true, eligibleModels: models.length, mode: "live_catalog" }; } catch { /* Curated, live-probed task models remain available. */ }
    return { configured: true as const, reachable: true, plan: { id: plan.id, name: plan.name, concurrencyUnits: plan.concurrency, maxContextLength: plan.max_context_length, maxModelSize: plan.max_model_size }, catalog };
  } catch (error) {
    return { configured: true as const, reachable: false, error: error instanceof Error ? error.message : "Featherless status check failed" };
  }
}
