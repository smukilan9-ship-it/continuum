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

## 2. Completion standard — the full demo flow now passes live (15/15)

The complete hackathon demo flow has been executed **end-to-end on a single
brand-new account**, through the real application APIs + a real MCP OAuth+PKCE
handshake, asserting persisted state at every step. Reproduce with `pnpm dev`
then `pnpm e2e:flow` (see [docs/fresh-user-e2e.md](docs/fresh-user-e2e.md)).

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 1 | Fresh user completes account creation | ✅ Live | `POST /api/auth/register` → 201, real `user_id`, scrypt, session |
| 2 | Meaningful onboarding (deep intake) | ✅ Live | `POST /api/onboarding` persists goal + 4 milestones + 7 tasks with estimates + dependency chain |
| 3 | Real plan: milestones, tasks, initial schedule | ✅ Live | deterministic scheduler commits a 7-day schedule (5 blocks) + a next action |
| 4 | Upload a real source/paper | ✅ Live | `POST /api/sources` (PDF) → 1 chunk, `embeddingStatus: stored` (pgvector) |
| 5 | Ingested, chunked, embedded, retrievable | ✅ Live | vector search returns the passage |
| 6 | Answer grounded in the source with exact citation | ✅ Live | cites `electric-potential.pdf · passage 1`; unanswerable Q declines |
| 7 | Broker compares native vs external | ✅ Live | selects PhET "Charges and Fields" over native, with alternatives |
| 8 | Selects + explains the best external resource | ✅ Live | recommendation carries exact task + verification contract |
| 9 | Precise guided activity | ✅ Live | completion instructions + unseen checkpoint |
| 10 | Return + verification question | ✅ Live | correct answer passes; **wrong answer does not** (evidence-gated) |
| 11 | Mastery/memory/goal/schedule update | ✅ Live | `updateMastery` → practicing (u=0.78); spaced follow-up scheduled |
| 12 | Outcome receipt explains the change | ✅ Live | receipt persisted + visible via `/api/state?view=learn` |
| 13 | Claude connects via MCP and retrieves state | ✅ Live | OAuth register→authorize(PKCE)→token; `list_goals` returns the same goal |
| 14 | Claude records an approved progress update | ✅ Live | `sync_session` → receipt with provenance + timestamp |
| 15 | Update appears immediately in the app | ✅ Live | receipt visible via `/api/state?view=memory` |

All 15 use the fresh account and normal APIs — no Maya, no seed, no manual DB
edits, no mocked success states.

---

## 3. What was implemented

### Session 2 — the complete demo flow made real

1. **Deep onboarding + deterministic planning** (`packages/domain/src/onboarding.ts`,
   `POST /api/onboarding`, new): full intake (level, subjects, goal, type,
   deadline, weekly hours, preferred times, confidence, prefs, privacy mode) →
   goal + phase milestones + actionable tasks with estimates and a diagnostic-
   first dependency chain + a committed 7-day schedule + a next action, all
   without an LLM. Idempotent (no duplicate plans on retry). New repo support:
   `createMilestone`/`listMilestones`/`listTaskDependencies`, task-dependency
   persistence, milestones in the workspace snapshots.
2. **Resilient source ingestion**: the original-binary Blob upload is now a
   bounded, non-fatal race so a slow/hung object store can never stall
   ingestion; chunking + embeddings + indexing proceed regardless. Verified: PDF
   → 1 chunk, embeddings stored in pgvector.
3. **Retrieval calibration**: cosine threshold 0.45→0.6 (measured against
   gemini-embedding-001: on-topic ~0.72, unrelated ~0.42–0.46) so answerable
   queries cite the exact passage and unanswerable queries decline instead of
   fabricating a citation.
4. **Live E2E runner** (`scripts/e2e-flow.mjs`, `pnpm e2e:flow`): self-contained,
   registers a fresh account, runs all 15 steps incl. a real MCP OAuth+PKCE
   handshake, and asserts persisted state. Verified 15/15.
5. **Tests** (+8, now **106**): `tests/onboarding.test.ts` (deterministic
   planner), and an MCP shared-state read-after-write continuity assertion.

### Session 1 — provider layer

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

- **P0 demo flow: fully closed.** The onboarding-depth gap flagged in session 1
  is resolved — onboarding now generates milestones, tasks, dependencies, and a
  committed schedule, and the whole 15-step flow (incl. ingestion, retrieval,
  broker, verify, mastery, MCP continuity) is re-run live each time via
  `pnpm e2e:flow`.
- **P1 external integrations not live-verified** (no external accounts / local
  runtime available, and deliberately deferred per the P1 scope): Zotero, Google
  Calendar, Obsidian vault, local Ollama. Deterministic/mocked paths exist.
  NotebookLM is a handoff only. ChatGPT MCP is future scope. The UI should label
  these "available after setup"/"experimental" (a remaining product-honesty
  task).
- **Onboarding intake not yet wired into a polished multi-step UI.** The
  `/api/onboarding` endpoint accepts and persists the full intake and the flow is
  verified via API; the in-app onboarding screen still collects the smaller
  goal-first form. Wiring the full intake form to the endpoint is the top UI
  follow-up.
- **Object storage under `next dev`.** Vercel Blob's `put` can hang under the dev
  server's patched fetch, so ingestion degrades storage to `unavailable` (bounded
  race) while still indexing. The store works in isolation and on Vercel; the
  original-binary persistence should be re-confirmed on a real deployment.
- **Playwright** is not used; live E2E is the `scripts/e2e-flow.mjs` runner
  (real APIs + real MCP OAuth, asserts persisted state) plus CI unit/integration
  tests.
- **Full security re-review** was not re-run this session; new routes
  (`/api/onboarding`, `/api/ai/status`) reuse the existing auth + same-origin +
  rate-limit guards and are user-scoped.
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

**Demo-ready for the entire headline flow.** A brand-new account goes
register → deep onboarding → deterministic plan (milestones + tasks + schedule)
→ real PDF upload → grounded retrieval with exact citations (and honest refusal
on unanswerable questions) → resource broker recommends and explains a real
external resource (PhET) → guided activity → return + evidence-gated
verification → mastery + receipt + spaced reschedule → Claude connects via real
MCP OAuth, reads the same state, records an approved update, and it appears
instantly in the app. This is verified live on every run of `pnpm e2e:flow`
(15/15), against real Neon + real providers + the real MCP server, with no Maya,
seed, or mocked outcomes. All three cloud providers are healthy and routing is
discovery/health-aware.

**Deferred (P1, by scope):** live Zotero / Google Calendar / Obsidian / local
Ollama, a polished multi-step onboarding UI, and on-deployment reconfirmation of
Blob binary storage. None block the P0 demo.
