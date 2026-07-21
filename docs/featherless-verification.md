# Featherless verification (live)

Date: 2026-07-21 · Method: direct calls to `api.featherless.ai` with the
configured `FEATHERLESS_API_KEY`, plus end-to-end calls through the
`@continuum/ai` router.

## Headline

**Featherless generation works, but its public model-catalogue endpoint is
gone.** The previously shipped model IDs (`Qwen/Qwen3.5-9B`, `Qwen/Qwen3.6-27B`,
`Qwen/Qwen3-Coder-Next`) are **forward-dated / fictional** and returned **200
responses with empty content** — the silent "empty response" failure. They are
now replaced with **live-verified** Qwen2.5 models, and the structured helper
treats empty content as a hard failure.

## Evidence

### Plan
`GET /v1/plan` → **200**: `feather_pro_plus` / "Feather Chat (formerly
Premium)", `max_context_length: 32768`, `concurrency: 4`.

### Model discovery endpoint
`GET /v1/models` (and several variants) → **404 "Gone."** The public catalogue
endpoint has been removed on this plan. Live discovery is therefore
**unavailable**, and the selector relies on curated IDs (which is exactly the
degraded path the code already had — now pointed at real models).

### Chat completions (`POST /v1/chat/completions`)
| Model | Result |
|---|---|
| `Qwen/Qwen2.5-7B-Instruct` | **200, ~3.1s, real content** ✅ (fast) |
| `Qwen/Qwen2.5-72B-Instruct` | **200, ~0.7s, real content** ✅ (reasoning/verifier) |
| `Qwen/Qwen2.5-Coder-32B-Instruct` | **200, ~8.9s, real content** ✅ (code) |
| `Qwen/Qwen3.5-9B`, `Qwen/Qwen3.6-27B` (old defaults) | **200 but empty content** ❌ |
| `meta-llama/*`, `google/gemma-2-9b-it` | **403 gated** (needs HF org connection) |
| `mistralai/Mistral-7B-Instruct-v0.3` | **503** capacity exhausted (transient) |
| `deepseek-ai/DeepSeek-V3` | **404** model_not_found |
| `Qwen/Qwen2.5-72B` + `response_format: json_schema` | 422 "model is busy" (transient) — structured stays on Groq |

### End-to-end through the app
- `providerHealth()` / `GET /api/ai/status` → `featherless: healthy` (plan probe).
- `selectFeatherlessModel("summarization")` → `Qwen/Qwen2.5-72B-Instruct`,
  `selectFeatherlessModel("code_reasoning")` → `Qwen/Qwen2.5-Coder-32B-Instruct`.
- `streamGeneration` on the Featherless route → real content, **first token
  ~1.0s** (`Qwen/Qwen2.5-72B-Instruct`).

## What changed in code

- `packages/ai/src/featherless.ts`: curated task models replaced with the
  verified IDs above (`fast`→Qwen2.5-7B, `reasoning`/`verifier`→Qwen2.5-72B,
  `code`→Qwen2.5-Coder-32B). Because `/v1/models` is gone, these curated IDs are
  the effective primary path.
- `packages/ai/src/providers.ts`: the OpenAI-compatible structured helper trims
  the response and throws on empty content, so an empty 200 fails fast and the
  route cascade moves on instead of `JSON.parse("")`.
- `.env.example` / `.env.local` model IDs and allowlist updated to the verified
  set, with a comment documenting the removed catalogue endpoint.

## Structured (JSON-schema) generation

Featherless is **not** the structured leader. Groq's GPT-OSS models are the
reliable json_schema route and are tried first (`structuredRouteOrder`). A live
json_schema probe to `Qwen2.5-72B` returned a transient 422 "busy", confirming
this ordering is correct.

## Remaining notes / not done

- **Gated models** (`meta-llama/*`, `gemma`) require connecting a HuggingFace
  organization at featherless.ai; not wired here.
- Featherless **embeddings** (`Qwen/Qwen3-Embedding-8B`) are a *fallback* only —
  Gemini embeddings are primary and verified. The Featherless embedding model ID
  has not been independently re-verified; if used, verify it returns 1536 dims.
