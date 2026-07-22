# Provider capability & health registry

`packages/ai/src/health.ts` makes AI routing **discovery-driven** and
**health-aware** instead of trusting hard-coded, forward-dated model IDs.

## Why

Live probing (2026-07-21) showed every configured cloud provider actually works,
but the shipped defaults pointed at models that were 503/404 (Gemini) or
fictional/empty (Featherless), and Featherless's discovery endpoint was removed.
A key existing → "route is healthy" is a false assumption; this registry closes
that gap. See [gemini-verification.md](gemini-verification.md) and
[featherless-verification.md](featherless-verification.md).

## Components

### Runtime model discovery
- **Gemini**: `listGeminiModels(key)` reads the account's real
  `GET /v1beta/models`, filters to `generateContent`-capable models, caches 10
  min. `selectGeminiModel(env)` prefers the configured model *only if the account
  can call it*, then a live-verified preference list, skipping tripped models.
- **Groq**: `listGroqModels()` (existing) reads `GET /openai/v1/models` and
  validates the selected model against the live catalogue; structured tasks are
  forced onto a json_schema-capable GPT-OSS model.
- **Featherless**: `GET /v1/plan` works; `GET /v1/models` is **410/404 Gone**, so
  the selector uses live-verified curated IDs (Qwen2.5 family).

### Circuit breaker
In-process, per warm function instance (the correct granularity for serverless):
- `recordFailure(key)` / `recordSuccess(key)`; a key opens after **3 consecutive
  failures** and stays skipped for a **backing-off cooldown** (60s × up to 4).
- Keyed at two levels: `route:<provider>` (used by route ordering) and
  `gemini:<modelId>` (used by model discovery).
- `isTripped(key)` gates both `generationRouteOrder` and `structuredRouteOrder`,
  which drop tripped routes but never return empty (last resort still attempts).

### Live health probes
`providerHealth(env)` runs short real probes (cached 30s) and returns a truthful
report per provider: `healthy | degraded | unavailable | not_configured`, the
concrete model in use, latency, and a capability summary. Surfaced at
`GET /api/ai/status`.

## Capability metadata

Each report carries a `ModelCapabilities` summary: `text`, `streaming`,
`structured`, `vision`, `embeddings`, `contextWindow`, `priceClass`,
`local`, `privacy`. Used by the UI and available to the router for capability
filtering (e.g. vision tasks require a vision-capable Gemini model).

## Live results (2026-07-21, through `GET /api/ai/status`)

| Provider | Status | Model / detail | Probe latency |
|---|---|---|---|
| groq | healthy | 15 models available | ~0.5s |
| gemini | healthy | `gemini-flash-lite-latest` | ~1.5–2.0s |
| featherless | healthy | Feather Chat · 4 concurrency | ~1.1s |

## Routing order (unchanged intent, now health-gated)

1. Deterministic code first (`schedule_optimization`).
2. Capability filter (vision → Gemini vision model; structured → Groq GPT-OSS).
3. Drop circuit-broken routes.
4. Provider preference by task class, with an overall wall-clock deadline
   (`AI_STRUCTURED_DEADLINE_MS`, default 40s) and per-attempt timeout.
5. Fall back to the next healthy, capable provider; record the outcome.

## Tests

`tests/health.test.ts` covers discovery filtering, configured-vs-available
selection, tripped-model skipping, breaker threshold/cooldown/reset, and
not-configured reporting. `tests/featherless.test.ts` asserts the curated
fallback under a simulated `/v1/models` 404 (the real condition).
