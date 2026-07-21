import type { RouteDecision } from "@continuum/schemas";

type GroqModel = { id: string; active?: boolean };
type CacheEntry<T> = { value: T; expiresAt: number };
let modelCache: CacheEntry<GroqModel[]> | undefined;

const defaults = {
  fast: "llama-3.1-8b-instant",
  general: "llama-3.3-70b-versatile",
  reasoning: "qwen/qwen3.6-27b",
  code: "openai/gpt-oss-120b",
  verifier: "openai/gpt-oss-20b",
};

// Only a subset of Groq models honor `response_format: json_schema`. The fast
// Llama/Qwen instruct models reject it, which is what made structured generation
// fall through the whole fallback chain. These GPT-OSS models support strict
// JSON schema output and are used whenever a schema-bound result is required.
const structuredCapable = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

export async function listGroqModels(apiKey = process.env.GROQ_API_KEY) {
  if (!apiKey) throw new Error("Groq is not configured");
  if (modelCache && modelCache.expiresAt > Date.now()) return modelCache.value;
  const response = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Groq model catalog lookup failed (${response.status})`);
  const payload = await response.json() as { data?: GroqModel[] };
  const value = (payload.data ?? []).filter((model) => model.active !== false);
  modelCache = { value, expiresAt: Date.now() + 10 * 60_000 };
  return value;
}

export function preferredGroqModel(taskClass: RouteDecision["taskClass"], env: NodeJS.ProcessEnv = process.env) {
  if (["classification", "extraction", "summarization", "misconception_diagnosis"].includes(taskClass)) return env.GROQ_FAST_MODEL ?? env.GROQ_MODEL ?? defaults.fast;
  if (taskClass === "code_reasoning") return env.GROQ_CODE_MODEL ?? env.GROQ_MODEL ?? defaults.code;
  if (taskClass === "citation_entailment") return env.GROQ_VERIFIER_MODEL ?? env.GROQ_REASONING_MODEL ?? env.GROQ_MODEL ?? defaults.verifier;
  if (["research_synthesis", "mathematical_reasoning"].includes(taskClass)) return env.GROQ_REASONING_MODEL ?? env.GROQ_MODEL ?? defaults.reasoning;
  return env.GROQ_MODEL ?? defaults.general;
}

export async function selectGroqModel(taskClass: RouteDecision["taskClass"], env: NodeJS.ProcessEnv = process.env, options: { structured?: boolean } = {}) {
  const models = await listGroqModels(env.GROQ_API_KEY);
  const enabled = (id: string) => models.some((model) => model.id === id);
  if (options.structured) {
    // Schema-bound tasks must run on a json_schema-capable model regardless of the
    // latency-optimized default for the task class.
    const preferredStructured = env.GROQ_STRUCTURED_MODEL ?? structuredCapable[0]!;
    const structured = [preferredStructured, ...structuredCapable].find(enabled);
    if (!structured) throw new Error("No Groq model that supports structured JSON output is enabled for this project");
    return structured;
  }
  const preferred = preferredGroqModel(taskClass, env);
  if (enabled(preferred)) return preferred;
  const safeFallbacks = [defaults.fast, defaults.reasoning, defaults.general, defaults.verifier];
  const fallback = safeFallbacks.find(enabled);
  if (!fallback) throw new Error("No reviewed Groq text model is enabled for this project");
  return fallback;
}

export async function groqStatus(env: NodeJS.ProcessEnv = process.env) {
  if (!env.GROQ_API_KEY) return { configured: false as const };
  try {
    const models = await listGroqModels(env.GROQ_API_KEY);
    return {
      configured: true as const,
      reachable: true,
      availableModelCount: models.length,
      policy: {
        fast: preferredGroqModel("classification", env),
        reasoning: preferredGroqModel("research_synthesis", env),
        code: preferredGroqModel("code_reasoning", env),
        verifier: preferredGroqModel("citation_entailment", env),
      },
    };
  } catch (error) {
    return { configured: true as const, reachable: false, error: error instanceof Error ? error.message : "Groq status check failed" };
  }
}
