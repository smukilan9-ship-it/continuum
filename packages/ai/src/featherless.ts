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
const planCache = new Map<string, CacheEntry<FeatherlessPlan>>();
const modelCache = new Map<string, CacheEntry<FeatherlessModel[]>>();
const modelErrorCache = new Map<string, CacheEntry<string>>();

export interface FeatherlessCredential {
  /** Stable, non-secret identifier that is safe for status responses. */
  id: "primary" | "secondary";
  apiKey: string;
}

interface CredentialState {
  failures: number;
  inFlight: number;
  openUntil?: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  lastStatus?: number;
}

const credentialStates = new Map<string, CredentialState>();
let credentialCursor = 0;

function credentialState(id: string) {
  let state = credentialStates.get(id);
  if (!state) {
    state = { failures: 0, inFlight: 0 };
    credentialStates.set(id, state);
  }
  return state;
}

/** Returns configured credentials without ever exposing their values to callers or status payloads. */
export function featherlessCredentials(env: NodeJS.ProcessEnv = process.env): FeatherlessCredential[] {
  const candidates: FeatherlessCredential[] = [
    ...(env.FEATHERLESS_API_KEY_PRIMARY?.trim() ? [{ id: "primary" as const, apiKey: env.FEATHERLESS_API_KEY_PRIMARY.trim() }] : []),
    ...(env.FEATHERLESS_API_KEY_SECONDARY?.trim() ? [{ id: "secondary" as const, apiKey: env.FEATHERLESS_API_KEY_SECONDARY.trim() }] : []),
  ];
  const seen = new Set<string>();
  return candidates.filter((credential) => {
    if (seen.has(credential.apiKey)) return false;
    seen.add(credential.apiKey);
    return true;
  });
}

export function featherlessApiKeys(env: NodeJS.ProcessEnv = process.env) {
  return featherlessCredentials(env).map((credential) => credential.apiKey);
}

/** Pick a healthy key with the least local work, rotating ties deterministically. */
export function selectFeatherlessCredential(env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  const credentials = featherlessCredentials(env);
  if (!credentials.length) throw new Error("Featherless is not configured");
  const healthy = credentials.filter((credential) => (credentialState(credential.id).openUntil ?? 0) <= now);
  if (!healthy.length) throw new Error("Every configured Featherless credential slot is temporarily backing off");
  const pool = healthy;
  const minimumInFlight = Math.min(...pool.map((credential) => credentialState(credential.id).inFlight));
  const leastBusy = pool.filter((credential) => credentialState(credential.id).inFlight === minimumInFlight);
  const selected = leastBusy[credentialCursor % leastBusy.length]!;
  credentialCursor = (credentialCursor + 1) % Math.max(credentials.length, 1);
  return selected;
}

export function recordFeatherlessCredentialSuccess(id: string, now = Date.now()) {
  const state = credentialState(id);
  state.failures = 0;
  state.openUntil = undefined;
  state.lastStatus = undefined;
  state.lastSuccessAt = now;
}

export function recordFeatherlessCredentialFailure(id: string, error: unknown, now = Date.now()) {
  const state = credentialState(id);
  const message = error instanceof Error ? error.message : String(error);
  const status = Number(message.match(/\((\d{3})\)/)?.[1] ?? 0) || undefined;
  state.failures += 1;
  state.lastFailureAt = now;
  state.lastStatus = status;
  // Rate limits back off immediately. Invalid credentials stay out longer. Other
  // transient failures require two consecutive errors before opening the key.
  if (status === 429) state.openUntil = now + 30_000;
  else if (status === 401 || status === 403) state.openUntil = now + 5 * 60_000;
  else if (state.failures >= 2) state.openUntil = now + Math.min(4, state.failures - 1) * 60_000;
}

export function featherlessCredentialHealth(env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  return featherlessCredentials(env).map((credential) => {
    const state = credentialState(credential.id);
    return {
      id: credential.id,
      status: (state.openUntil ?? 0) > now ? "backing_off" as const : state.failures ? "degraded" as const : "available" as const,
      inFlight: state.inFlight,
      failures: state.failures,
      lastStatus: state.lastStatus,
      lastFailureAt: state.lastFailureAt ? new Date(state.lastFailureAt).toISOString() : undefined,
      lastSuccessAt: state.lastSuccessAt ? new Date(state.lastSuccessAt).toISOString() : undefined,
      retryAfter: (state.openUntil ?? 0) > now ? new Date(state.openUntil!).toISOString() : undefined,
    };
  });
}

export function resetFeatherlessCredentialState() {
  credentialStates.clear();
  credentialCursor = 0;
  planCache.clear();
  modelCache.clear();
  modelErrorCache.clear();
}

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

export async function getFeatherlessPlan(apiKey = selectFeatherlessCredential().apiKey, env: NodeJS.ProcessEnv = process.env, cacheKey = "default") {
  if (!apiKey) throw new Error("Featherless is not configured");
  const cached = planCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const response = await fetch("https://api.featherless.ai/v1/plan", { headers: headers(apiKey, env), signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Featherless plan lookup failed (${response.status})`);
  const value = await response.json() as FeatherlessPlan;
  planCache.set(cacheKey, { value, expiresAt: Date.now() + 5 * 60_000 });
  return value;
}

export async function listFeatherlessModels(apiKey = selectFeatherlessCredential().apiKey, env: NodeJS.ProcessEnv = process.env, cacheKey = "default") {
  if (!apiKey) throw new Error("Featherless is not configured");
  const cached = modelCache.get(cacheKey);
  const cachedError = modelErrorCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cachedError && cachedError.expiresAt > Date.now()) throw new Error(cachedError.value);
  const url = new URL("https://api.featherless.ai/v1/models");
  url.searchParams.set("available_on_current_plan", "true");
  url.searchParams.set("status", "active");
  url.searchParams.set("conversational", "true");
  url.searchParams.set("sort", "-popularity");
  url.searchParams.set("per_page", "250");
  const response = await fetch(url, { headers: headers(apiKey, env), signal: AbortSignal.timeout(12_000) });
  if (!response.ok) {
    const message = `Featherless model catalog lookup failed (${response.status})`;
    modelErrorCache.set(cacheKey, { value: message, expiresAt: Date.now() + 60_000 });
    throw new Error(message);
  }
  const payload = await response.json() as { data?: FeatherlessModel[] };
  const value = (payload.data ?? []).filter((model) => model.available_on_current_plan !== false && model.status !== "not_deployed");
  modelCache.set(cacheKey, { value, expiresAt: Date.now() + 5 * 60_000 });
  modelErrorCache.delete(cacheKey);
  return value;
}

function modelOverride(taskClass: RouteDecision["taskClass"], env: NodeJS.ProcessEnv) {
  if (taskClass === "classification" || taskClass === "extraction" || taskClass === "summarization" || taskClass === "misconception_diagnosis") return env.FEATHERLESS_FAST_MODEL;
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

export async function selectFeatherlessModel(taskClass: RouteDecision["taskClass"], env: NodeJS.ProcessEnv = process.env, credential = selectFeatherlessCredential(env)) {
  const override = modelOverride(taskClass, env);
  if (override) return { id: override, concurrencyCost: concurrencyCostForModel(override, env), selectedBy: "configured_policy" as const };
  try {
    const [plan, models] = await Promise.all([getFeatherlessPlan(credential.apiKey, env, credential.id), listFeatherlessModels(credential.apiKey, env, credential.id)]);
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

export async function acquireFeatherlessCredentialLease(id: string) {
  const state = credentialState(id);
  state.inFlight += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.inFlight = Math.max(0, state.inFlight - 1);
  };
}

export async function withFeatherlessExecution<T>(credentialId: string, concurrencyCost: number, run: () => Promise<T>, env: NodeJS.ProcessEnv = process.env) {
  const [releaseConcurrency, releaseCredential] = await Promise.all([
    acquireFeatherlessConcurrency(concurrencyCost, env),
    acquireFeatherlessCredentialLease(credentialId),
  ]);
  try { return await run(); }
  finally { releaseCredential(); releaseConcurrency(); }
}

export async function featherlessStatus(env: NodeJS.ProcessEnv = process.env) {
  const credentials = featherlessCredentials(env);
  if (!credentials.length) return { configured: false as const, keyCount: 0, keys: [] };
  let credential: FeatherlessCredential | undefined;
  try {
    credential = selectFeatherlessCredential(env);
    const plan = await getFeatherlessPlan(credential.apiKey, env, credential.id);
    let catalog: { reachable: boolean; eligibleModels?: number; mode: "live_catalog" | "curated_verified" } = { reachable: false, mode: "curated_verified" };
    try { const models = await listFeatherlessModels(credential.apiKey, env, credential.id); catalog = { reachable: true, eligibleModels: models.length, mode: "live_catalog" }; } catch { /* Curated, live-probed task models remain available. */ }
    recordFeatherlessCredentialSuccess(credential.id);
    return { configured: true as const, reachable: true, keyCount: credentials.length, keys: featherlessCredentialHealth(env), plan: { id: plan.id, name: plan.name, concurrencyUnits: plan.concurrency, maxContextLength: plan.max_context_length, maxModelSize: plan.max_model_size }, catalog };
  } catch (error) {
    if (credential) recordFeatherlessCredentialFailure(credential.id, error);
    return { configured: true as const, reachable: false, keyCount: credentials.length, keys: featherlessCredentialHealth(env), error: error instanceof Error ? error.message : "Featherless status check failed" };
  }
}
