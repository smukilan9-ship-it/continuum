# Continuum — Real Application Report

Date: 2026-07-21 · Branch: `audit/perf-security-fixes`
Method: live provider probing, end-to-end runs through the running app against
the real Neon database and real provider keys, plus `pnpm test` (98) /
`typecheck` (8 pkgs) / `build`.

This report is deliberately honest about what is **verified real**, what is
**previously verified**, and what remains **experimental or pending**. It does
not claim success from compilation alone or from seeded fixtures.

---

## 1. The headline correction

Live probing overturned the prior audit's central reliability claim. The prior
report said Gemini and Featherless were effectively broken/unavailable. **That
was wrong** — it was a hard-coded, forward-dated **model-ID** problem, not a
credential or code fault:

- **Gemini**: all **10 keys are valid**; the account can call 41 real
  `generateContent` models. The code just hard-defaulted to `gemini-3.5-flash`,
  which returns a transient **503**, and never tried another model.
- **Featherless**: generation **works** with real models; the shipped model IDs
  were fictional (`Qwen/Qwen3.x`) and returned empty 200s, and its `/v1/models`
  discovery endpoint is now **404 "Gone"**.
- **Groq**: healthy, 15 models.

This session replaced the guesswork with **runtime discovery + health checks +
circuit breakers**, and verified all three providers generate real content
end-to-end. See [provider-registry.md](docs/provider-registry.md),
[gemini-verification.md](docs/gemini-verification.md),
[featherless-verification.md](docs/featherless-verification.md).

---

## 2. Completion standard — status against the 15 steps

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 1 | Fresh user creates an account | ✅ Verified live | `POST /api/auth/register` → 201, real `user_id`, scrypt hash, session cookie |
| 2 | User completes onboarding | ⚠️ Partial (real but minimal) | Empty-state onboarding creates a real **goal + a first actionable task** (verified live, persisted & linked); grade/subjects/deadlines/weekly-time/learning-style and auto-milestones/schedule/diagnostic are **not** yet created (see §5) |
| 3 | Creates a real academic goal | ✅ Verified live | `goal.created` → 201, persisted `goal_…`, visible on reload via `/api/state?view=goals` |
| 4 | Continuum generates & persists a real plan | ◻️ Prior-verified only | Deterministic scheduler exists; not re-run live this session |
| 5 | User receives real AI assistance | ✅ Verified live | `POST /api/ai` misconception diagnosis → valid structured output in ~2.6s |
| 6 | Router selects a verified working provider | ✅ Verified live | health-aware routing; `GET /api/ai/status` → all three healthy |
| 7 | Upload/import a real source | ◻️ Prior-verified only | Ingestion + pgvector paths exist; not re-run live this session |
| 8 | Real retrieval with citations | ◻️ Prior-verified only | Evidence-linked retrieval exists; not re-run live this session |
| 9 | Resource broker recommends a real external resource | ◻️ Prior-verified only | Deterministic broker lifecycle exists and passes tests |
| 10 | User returns and completes verification | ◻️ Prior-verified only | Return/verify lifecycle exists and passes tests |
| 11 | Mastery/memory/schedule/goal progress update | ◻️ Prior-verified only | Evidence-gated mastery update passes tests |
| 12 | Claude connects via MCP and retrieves state | ◻️ Prior-verified only | MCP OAuth+PKCE server; continuity verified in prior audit, not re-run |
| 13 | Claude writes an approved update via MCP | ◻️ Prior-verified only | `sync_session` write verified in prior audit |
| 14 | Update appears in the standalone app | ◻️ Prior-verified only | Same store; verified in prior audit |
| 15 | No hard-coded/seeded/fake/unavailable dependencies | ✅ Improved & verified | Fresh account is clean (no Maya leakage); providers are discovery/health-driven, not hard-coded |

Legend: ✅ verified live this session · ⚠️ real but incomplete · ◻️ exists and
was verified in the prior audit but **not re-run live this session** (honestly
flagged, not re-claimed).

---

## 3. What was implemented this session

1. **Provider capability & health registry** (`packages/ai/src/health.ts`, new):
   runtime Gemini model discovery, health/discovery-gated model selection,
   per-route and per-model circuit breakers with backing-off cooldown, and live
   `providerHealth()` probes.
2. **Gemini repair**: `modelForDecision` selects a discovered, untripped model
   instead of the dead `gemini-3.5-flash` default. Verified: `gemini-flash-lite-
   latest` streams real content, ~830ms first token.
3. **Featherless repair**: curated model IDs replaced with live-verified Qwen2.5
   models; empty-response detection in the structured helper; documented the
   removed `/v1/models` endpoint.
4. **Health-aware router**: generation and structured route ordering skip
   circuit-broken routes; generation paths record success/failure.
5. **Provider status surface**: `GET /api/ai/status` returns live, cached,
   truthful per-provider health for the UI.
6. **Config honesty**: `.env.example` / `.env.local` model IDs updated to
   verified values with explanatory comments.
7. **Tests**: `tests/health.test.ts` (9) + updated `tests/featherless.test.ts`;
   full suite **98 passing**.

---

## 4. Live measurements (this session, warm dev server, real Neon)

| Operation | Result |
|---|---|
| `POST /api/auth/register` | 201, real user |
| `POST /api/state` (goal.created) | 201 in ~1.1s, persisted |
| `POST /api/ai` (misconception diagnosis, structured) | **200 in ~2.6s**, valid output |
| `GET /api/ai/status` (cold probe / cached) | 200 in ~2.5s / ~0.1s |
| `POST /api/code` (streaming coach) | 200, streams |
| Gemini stream first-token | ~830ms |
| Featherless stream first-token | ~1.0s |
| Groq structured JSON | valid in ~0.65s |
| `providerHealth()` | groq/gemini/featherless all **healthy** |

Provider health (live): `groq healthy (15 models)`, `gemini healthy
(gemini-flash-lite-latest)`, `featherless healthy (Feather Chat, 4 concurrency)`.

---

## 5. Exact remaining limitations (honest)

- **Onboarding depth (P0 gap, partially closed).** Onboarding now creates a real
  goal **and a first actionable task** (a baseline diagnostic), so a fresh
  account no longer lands on an empty board. It does **not** yet capture
  grade/subjects/deadlines/weekly-time/learning-style, nor auto-generate
  milestones, a full schedule, or an initial diagnostic result. Steps 2 and 4 of
  the completion standard are therefore still only partially real — the richer
  intake + deterministic plan generation is the top follow-up.
- **Not re-run live this session** (exist + passed in the prior audit, but this
  session focused on the provider layer + fresh-user entry): source ingestion &
  retrieval, resource-broker completion loop, mastery/schedule updates, and MCP
  continuity (steps 4, 7–14).
- **External integrations not live-verified** (no external accounts / local
  runtime available): Zotero, Google Calendar, Obsidian vault, local Ollama.
  Deterministic/mocked paths exist. NotebookLM is a handoff only. ChatGPT MCP is
  future scope.
- **No Playwright E2E** added this session; verification here is via real API
  calls + unit/integration tests.
- **Full security re-review** was not re-run; the prior audit found no
  Critical/High issues, and the new `/api/ai/status` route reuses the existing
  auth + rate-limit guards.
- **AI Gateway** general-model default in `configuredProviders()` still shows a
  forward-dated `google/gemini-3.5-flash` label; it is cosmetic (gateway is
  disabled) but should be updated for full product honesty.
- **Featherless gated models** (`meta-llama/*`, `gemma`) need a HuggingFace org
  connection; **Featherless embeddings** are a fallback only and unverified
  (Gemini embeddings are primary and verified at 1536 dims).

---

## 6. Credentials / external setup still required

- Working today (configured in `.env.local`): Neon `DATABASE_URL`, Blob token,
  `GROQ_API_KEY`, `FEATHERLESS_API_KEY`, `GEMINI_API_KEY_1..10` +
  `GEMINI_DATA_USE_ACKNOWLEDGED=true`, `MCP_JWT_SIGNING_SECRET`.
- For integrations: Google OAuth client, Zotero API key/OAuth, a local Ollama
  runtime, an Obsidian vault + plugin token. None are required for the core
  fresh-user + AI flow.

---

## 7. Demo-readiness verdict

**Demo-ready for: fresh account → onboarding goal → real AI diagnosis →
truthful live provider health, all on real persistent state with all three
cloud providers healthy and health-aware routing.** The provider layer is now
genuinely real (discovery + health + breakers), which is the piece the prior
audit had only worked around.

**Not yet demo-complete for** the deeper onboarding (auto plan/tasks/schedule)
and for live external integrations (Zotero/Calendar/Obsidian/Ollama). The MCP
continuity and resource-broker/retrieval flows exist and passed previously but
were not re-run live in this session — re-verify before demoing those steps.
