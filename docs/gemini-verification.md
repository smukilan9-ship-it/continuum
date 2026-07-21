# Gemini verification (live)

Date: 2026-07-21 · Method: direct calls to `generativelanguage.googleapis.com`
with the configured `GEMINI_API_KEY_1..10`, plus end-to-end calls through the
`@continuum/ai` router and the running app.

## Headline

**Gemini works.** All ten configured keys are valid and the account can call
real `generateContent` models. The prior audit's "Gemini unavailable" verdict
was a **model-ID** problem, not a credential or code problem: the code hard-
defaulted to `GEMINI_MODEL=gemini-3.5-flash`, which currently returns **503
(temporary high demand)**, and never tried any other model. Runtime discovery +
health selection now fixes this.

## Evidence

### Keys
`GET /v1beta/models?pageSize=1` with each of the 10 keys → **200 for all 10**.
The keys are valid API keys (not just consumer-app access).

### Model discovery
`GET /v1beta/models` → 50 models, **41 support `generateContent`**.

### `generateContent` probes (key 1)
| Model | Result |
|---|---|
| `gemini-flash-lite-latest` | **200, ~770ms, clean text** ✅ (selected default) |
| `gemini-3.1-flash-lite` | **200, ~827ms, clean text** ✅ |
| `gemini-3.6-flash` | 200, ~3.4s (thinking model; needs adequate `maxOutputTokens`) |
| `gemini-3-flash-preview` | 200 but slow / can time out (thinking) |
| `gemini-3.5-flash` (old default) | **503** high demand (temporary) |
| `gemini-2.5-flash`, `gemini-2.5-flash-lite` | **404** "no longer available to new users" |
| `gemini-2.0-flash`, `gemini-2.0-flash-lite` | **429** quota exceeded |

Note: a tiny `maxOutputTokens` (e.g. 20) makes *thinking* models return an
empty candidate (all budget consumed by reasoning). With a normal budget they
return real content. Callers should not set sub-100 token caps for Gemini.

### Embeddings
`gemini-embedding-001` with `outputDimensionality: 1536` → **200, exactly 1536
dims** ✅ (matches the pgvector column). This is the primary embedding provider
and it works.

### End-to-end through the app
- `providerHealth()` (and `GET /api/ai/status`) → `gemini: healthy
  (gemini-flash-lite-latest)`, ~1.5–2.0s probe.
- `streamGeneration` on the Gemini route → real answer, **first token ~830ms**.

## What changed in code

- `packages/ai/src/health.ts` adds `listGeminiModels()` (runtime discovery of the
  account's real `generateContent` list, cached 10 min) and `selectGeminiModel()`
  which prefers the configured model **only if the account can call it**, then a
  live-verified preference list (`gemini-flash-lite-latest` → `gemini-3.1-flash-
  lite` → `gemini-3.6-flash` → …), skipping any model whose per-model circuit
  breaker is open (recent 503/404/429).
- `packages/ai/src/providers.ts` Gemini branch now calls `selectGeminiModel()`
  instead of `env.GEMINI_MODEL ?? "gemini-3.5-flash"`.
- Default `GEMINI_MODEL` in `.env.example`/`.env.local` set to
  `gemini-flash-lite-latest`.

## Handling of provider errors

- **503 / 429** → the model's breaker records a failure; after 3 the model is
  skipped for a cooldown and discovery picks the next healthy model.
- **404 "no longer available"** → excluded from the preference list entirely; if
  a configured model 404s, discovery filters it out (it won't be in the
  `generateContent` set).
- **Quota (429)** on one key → the generation/embedding paths rotate across the
  10 keys before failing.

## Remaining notes

- Multiple keys in one Google Cloud project **do not** multiply project quota.
- `gemini-3.5-flash`'s 503 is transient; it may recover. The router does not
  depend on it either way.
