import type { RouteDecision } from "@continuum/schemas";
import { geminiApiKeys } from "./embeddings";

/**
 * Provider capability & health registry.
 *
 * This module makes routing *health-aware* and *discovery-driven* instead of
 * trusting hard-coded, forward-dated model IDs. It provides:
 *   - runtime Gemini model discovery (the account's real `generateContent` list),
 *   - a preference-ordered, health-gated model selector per provider,
 *   - an in-process circuit breaker so a route that is failing (503/429/404/
 *     empty responses) is skipped for a cooldown instead of retried in a cascade,
 *   - a live `providerHealth()` probe that reports the *truth* for the UI.
 *
 * State is module-level and therefore per warm function instance. That is the
 * correct granularity for a serverless circuit breaker: a hot instance that just
 * saw three 503s from a model stops sending traffic there for a cooldown, and a
 * cold instance starts clean and re-probes.
 */

export type ProviderKey = RouteDecision["route"]; // deterministic | groq | featherless | gemini | ai_gateway

export interface ModelCapabilities {
  text: boolean;
  streaming: boolean;
  structured: boolean;
  vision: boolean;
  embeddings: boolean;
  contextWindow?: number;
  priceClass: "none" | "low" | "medium" | "high";
  local: boolean;
  privacy: "cloud" | "local";
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

interface BreakerState {
  failures: number;
  lastError?: string;
  openUntil?: number; // epoch ms; while now < openUntil the route/model is skipped
  lastFailureAt?: number;
  lastSuccessAt?: number;
}

const breakers = new Map<string, BreakerState>();

const BREAKER_THRESHOLD = 3; // consecutive failures before the breaker opens
const BREAKER_COOLDOWN_MS = 60_000; // how long a tripped route stays skipped

function stateFor(key: string): BreakerState {
  let state = breakers.get(key);
  if (!state) {
    state = { failures: 0 };
    breakers.set(key, state);
  }
  return state;
}

/** True when the route/model key is currently tripped and should be skipped. */
export function isTripped(key: string, now = Date.now()): boolean {
  const state = breakers.get(key);
  return Boolean(state?.openUntil && state.openUntil > now);
}

export function recordSuccess(key: string, now = Date.now()) {
  const state = stateFor(key);
  state.failures = 0;
  state.openUntil = undefined;
  state.lastError = undefined;
  state.lastSuccessAt = now;
}

export function recordFailure(key: string, error: unknown, now = Date.now()) {
  const state = stateFor(key);
  state.failures += 1;
  state.lastFailureAt = now;
  state.lastError = error instanceof Error ? error.message : String(error);
  if (state.failures >= BREAKER_THRESHOLD) {
    // Exponential-ish cooldown, capped, so a persistently dead route backs off
    // further instead of re-tripping every minute.
    const multiplier = Math.min(4, state.failures - BREAKER_THRESHOLD + 1);
    state.openUntil = now + BREAKER_COOLDOWN_MS * multiplier;
  }
}

export function breakerSnapshot(key: string): BreakerState | undefined {
  const state = breakers.get(key);
  return state ? { ...state } : undefined;
}

/** Test/operator hook: clear all breaker state and cached discovery/health. */
export function resetBreakers() {
  breakers.clear();
  geminiModelCache = undefined;
  healthCache = undefined;
}

// ---------------------------------------------------------------------------
// Gemini model discovery
// ---------------------------------------------------------------------------

interface DiscoveredGeminiModel {
  id: string;
  supportsGenerate: boolean;
  contextWindow?: number;
  vision: boolean;
}

type CacheEntry<T> = { value: T; expiresAt: number };
let geminiModelCache: CacheEntry<DiscoveredGeminiModel[]> | undefined;

/**
 * Preference order for Gemini generation. These are ordered by *observed*
 * behavior on the configured keys: fast, clean, non-thinking flash-lite models
 * first, then the thinking flash models, then broad fallbacks. Discovery filters
 * this to what the account can actually call, and the circuit breaker removes any
 * that are currently 503/429/404. Models that returned "no longer available to
 * new users" (e.g. gemini-2.5-flash) are intentionally *not* in this list.
 */
export const GEMINI_GENERATION_PREFERENCE = [
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-3-flash-preview",
  "gemini-2.0-flash-lite-001",
];

const GEMINI_VISION_HINTS = ["flash", "pro", "vision", "image", "omni"];

export async function listGeminiModels(key: string, signal?: AbortSignal): Promise<DiscoveredGeminiModel[]> {
  if (geminiModelCache && geminiModelCache.expiresAt > Date.now()) return geminiModelCache.value;
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
    headers: { "x-goog-api-key": key },
    signal: signal ?? AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Gemini model discovery failed (${response.status})`);
  const payload = (await response.json()) as {
    models?: Array<{ name?: string; supportedGenerationMethods?: string[]; inputTokenLimit?: number }>;
  };
  const models: DiscoveredGeminiModel[] = (payload.models ?? []).map((model) => {
    const id = (model.name ?? "").replace(/^models\//, "");
    return {
      id,
      supportsGenerate: (model.supportedGenerationMethods ?? []).includes("generateContent"),
      contextWindow: model.inputTokenLimit,
      vision: GEMINI_VISION_HINTS.some((hint) => id.includes(hint)),
    };
  });
  geminiModelCache = { value: models, expiresAt: Date.now() + 10 * 60_000 };
  return models;
}

/**
 * Select a Gemini generation model that (a) the account can actually call and
 * (b) is not currently tripped. Prefers the configured `GEMINI_MODEL`, then the
 * observed-good preference list, then any discovered `generateContent` model.
 * Never returns a model the discovery list says is unavailable, so we stop
 * hard-defaulting to a dead ID like `gemini-3.5-flash`.
 */
export async function selectGeminiModel(
  env: NodeJS.ProcessEnv = process.env,
  options: { vision?: boolean } = {},
): Promise<string> {
  const keys = geminiApiKeys(env);
  if (!keys.length) throw new Error("Gemini is not configured");
  const breakerKey = (id: string) => `gemini:${id}`;

  let discovered: DiscoveredGeminiModel[] = [];
  try {
    discovered = await listGeminiModels(keys[0]!);
  } catch {
    // Discovery unavailable (network/quota). Fall back to the preference list
    // and let per-attempt health handling sort out reachability.
  }
  const generateIds = new Set(discovered.filter((model) => model.supportsGenerate).map((model) => model.id));
  const visionIds = new Set(discovered.filter((model) => model.vision && model.supportsGenerate).map((model) => model.id));
  const available = (id: string) => (generateIds.size ? generateIds.has(id) : true);
  const okForVision = (id: string) => (!options.vision ? true : visionIds.size ? visionIds.has(id) : true);
  const usable = (id: string) => Boolean(id) && available(id) && okForVision(id) && !isTripped(breakerKey(id));

  const configured = env.GEMINI_MODEL?.trim();
  const preference = [
    ...(configured ? [configured] : []),
    ...GEMINI_GENERATION_PREFERENCE,
  ];
  const chosen = preference.find(usable);
  if (chosen) return chosen;

  // Last resort: any discovered generate-capable, untripped model.
  const discoveredUsable = discovered.find((model) => model.supportsGenerate && okForVision(model.id) && !isTripped(breakerKey(model.id)));
  if (discoveredUsable) return discoveredUsable.id;

  // Nothing untripped left; fall back to configured or first preference so the
  // caller still attempts (and the breaker cooldown may have just lapsed).
  return configured ?? GEMINI_GENERATION_PREFERENCE[0]!;
}

// ---------------------------------------------------------------------------
// Live provider health probes (truthful status for the UI)
// ---------------------------------------------------------------------------

export interface ProviderHealthReport {
  provider: ProviderKey;
  configured: boolean;
  status: "healthy" | "degraded" | "unavailable" | "not_configured";
  model?: string;
  latencyMs?: number;
  detail?: string;
  checkedAt: string;
  capabilities?: Partial<ModelCapabilities>;
}

let healthCache: CacheEntry<ProviderHealthReport[]> | undefined;
const HEALTH_TTL_MS = 30_000;

async function probeGemini(env: NodeJS.ProcessEnv): Promise<ProviderHealthReport> {
  const base: ProviderHealthReport = { provider: "gemini", configured: false, status: "not_configured", checkedAt: new Date().toISOString() };
  const keys = geminiApiKeys(env);
  if (!keys.length || env.GEMINI_DATA_USE_ACKNOWLEDGED !== "true") {
    return { ...base, detail: keys.length ? "GEMINI_DATA_USE_ACKNOWLEDGED is not set to true" : "No Gemini API keys configured" };
  }
  const startedAt = Date.now();
  try {
    const model = await selectGeminiModel(env);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": keys[0]! },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with the single word: ok" }] }], generationConfig: { maxOutputTokens: 16 } }),
      signal: AbortSignal.timeout(12_000),
    });
    const latencyMs = Date.now() - startedAt;
    if (response.ok) {
      recordSuccess(`gemini:${model}`);
      return { ...base, configured: true, status: "healthy", model, latencyMs, checkedAt: new Date().toISOString(), capabilities: { text: true, streaming: true, structured: true, vision: true, embeddings: true, priceClass: "low", local: false, privacy: "cloud" } };
    }
    recordFailure(`gemini:${model}`, `HTTP ${response.status}`);
    const status = response.status === 503 || response.status === 429 ? "degraded" : "unavailable";
    return { ...base, configured: true, status, model, latencyMs, detail: `generateContent returned ${response.status}`, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { ...base, configured: true, status: "unavailable", detail: error instanceof Error ? error.message : "probe failed", checkedAt: new Date().toISOString() };
  }
}

async function probeGroq(env: NodeJS.ProcessEnv): Promise<ProviderHealthReport> {
  const base: ProviderHealthReport = { provider: "groq", configured: false, status: "not_configured", checkedAt: new Date().toISOString() };
  if (!env.GROQ_API_KEY) return base;
  const startedAt = Date.now();
  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${env.GROQ_API_KEY}` }, signal: AbortSignal.timeout(10_000) });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) return { ...base, configured: true, status: "unavailable", latencyMs, detail: `models list returned ${response.status}`, checkedAt: new Date().toISOString() };
    const payload = (await response.json()) as { data?: Array<{ id: string }> };
    const count = payload.data?.length ?? 0;
    return { ...base, configured: true, status: count ? "healthy" : "degraded", latencyMs, detail: `${count} models available`, checkedAt: new Date().toISOString(), capabilities: { text: true, streaming: true, structured: true, vision: false, embeddings: false, priceClass: "low", local: false, privacy: "cloud" } };
  } catch (error) {
    return { ...base, configured: true, status: "unavailable", detail: error instanceof Error ? error.message : "probe failed", checkedAt: new Date().toISOString() };
  }
}

async function probeFeatherless(env: NodeJS.ProcessEnv): Promise<ProviderHealthReport> {
  const base: ProviderHealthReport = { provider: "featherless", configured: false, status: "not_configured", checkedAt: new Date().toISOString() };
  if (!env.FEATHERLESS_API_KEY) return base;
  const startedAt = Date.now();
  try {
    const response = await fetch("https://api.featherless.ai/v1/plan", { headers: { authorization: `Bearer ${env.FEATHERLESS_API_KEY}`, accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) return { ...base, configured: true, status: "unavailable", latencyMs, detail: `plan lookup returned ${response.status}`, checkedAt: new Date().toISOString() };
    const plan = (await response.json()) as { name?: string; concurrency?: number };
    return { ...base, configured: true, status: "healthy", latencyMs, detail: `plan ${plan.name ?? "unknown"} · ${plan.concurrency ?? "?"} concurrency`, checkedAt: new Date().toISOString(), capabilities: { text: true, streaming: true, structured: false, vision: false, embeddings: true, priceClass: "medium", local: false, privacy: "cloud" } };
  } catch (error) {
    return { ...base, configured: true, status: "unavailable", detail: error instanceof Error ? error.message : "probe failed", checkedAt: new Date().toISOString() };
  }
}

/**
 * Run live health probes for every configured provider. Results are cached for
 * a short TTL so status polling from the UI does not hammer the providers.
 */
export async function providerHealth(env: NodeJS.ProcessEnv = process.env, options: { force?: boolean } = {}): Promise<ProviderHealthReport[]> {
  if (!options.force && healthCache && healthCache.expiresAt > Date.now()) return healthCache.value;
  const reports = await Promise.all([probeGroq(env), probeGemini(env), probeFeatherless(env)]);
  healthCache = { value: reports, expiresAt: Date.now() + HEALTH_TTL_MS };
  return reports;
}
