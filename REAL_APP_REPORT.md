# Continuum — Real Application Report

Date: 2026-07-22 · Branch: `audit/perf-security-fixes`
Method: live provider probing, end-to-end runs through the running app against
the real Neon database and real provider keys, plus manual browser verification
of the frontend on localhost.

Latest verified checks before the final release gate:

- `pnpm test`: **176 / 176 passing** across 28 files
- `pnpm test:e2e`: **6 / 6 Playwright journeys passing**
- `pnpm typecheck`: **8 packages passing** at the latest checkpoint
- `pnpm build`: **green** (8 / 8 tasks) at the latest checkpoint

(Earlier per-session sections below quote the suite size *at that time*. Those
numbers are historical; the release-gate section is authoritative.)

This report is deliberately honest about what is **verified real**, what is
**previously verified**, and what remains **experimental or pending**. It does
not claim success from compilation alone or from seeded fixtures.

---

## 0. Frontend + demo pass (2026-07-22)

A UX/design pass turned the verified backend into a polished, judge-friendly app
and added a persistent, disposable demo account. Verified live in the running app
(`pnpm dev` → `http://localhost:3001`, port 3000 was busy so Next.js fell back)
against the real Neon database, plus `pnpm test` (**125**), `typecheck` (8 pkgs),
and `build` (all green).

**Browser-verified on localhost (2026-07-22), desktop + mobile:**

- **Auth** — login page renders; `demo`/`demo123` form login lands on Today via
  normal auth; **"Try the demo"** one-click (`/api/auth/demo`) returns the Mukilan
  session; show/hide password toggles the field type; an invalid password returns
  `401 "Email or password is incorrect"`; registration rejects a 5-char password
  (`400`) and accepts a 6-char password (`201`).
- **Demo data present** — Mukilan (CBSE Class 12) with **4 goals** (SAT 42%,
  SQL/MySQL 58%, OASIS 71%, exoplanet), **15 milestones**, **13 tasks** (done /
  in-progress / planned / backlog), **3 projects**, **3 indexed sources**,
  decisions (incl. the co-expression guardrail), claims + evidence, learning
  states, receipts, memory, and resource activities — rendering across
  Today / Plan / Learn / Research / Memory / Review / Code / Connections.
- **Grounded Q&A** — a question over the OASIS sources returns
  `retrievalMode: "vector"` with a real citation
  (`OASIS — Technical Reference (ihc.md) · passage 3`, cosine 0.81); an unsupported
  question **refuses** ("couldn't find a sufficiently similar supporting passage")
  with zero citations.
- **5-step onboarding** — verified end-to-end on a throwaway fresh account:
  stepper advances 1→5, incomplete steps disable *Continue*, inputs persist on
  *Back*, the draft survives in `localStorage` (`continuum.onboarding.draft.v1`),
  submit calls `/api/onboarding`, duplicate submit is blocked (button disabled +
  "Building your plan…"), and the deterministic plan (**4 milestones, 7 tasks,
  5 schedule blocks**) then appears on Today. The temporary account was deleted
  afterward; the canonical demo account was untouched.
- **Responsive** — the sidebar collapses to a hamburger + bottom tab bar under the
  mobile breakpoint with no horizontal overflow; palette reads sky-blue with navy
  authority, metric/detail grids use soft gap tiles (no box-around-every-value).
- **Integration honesty** — Connections shows Claude MCP "Ready to connect",
  Google Calendar "Setup required", Zotero "Not connected", Obsidian/Ollama
  "Optional", and NotebookLM as **handoff-only** ("Personal NotebookLM does not
  expose a general account-connection API… will not pretend it is connected").

**Local workflow:**

```bash
pnpm seed:demo   # create / reset the demo account + demonstration data (idempotent)
pnpm dev         # Next.js dev server; prints the actual URL (3000, else a fallback like 3001)
```

Then open the printed `http://localhost:<port>` and sign in with `demo` / `demo123`
(or click "Try the demo").

- **Password policy** lowered from 12 → **6** characters, centralized in
  `apps/web/lib/password-policy.ts` and shared by the register schema, client
  form, and helper text. Production registration still enforces ≥6; the demo seed
  is the only path allowed to set a shorter password. Live check: registration
  with an 8-char password returned `201`; a 5-char password is rejected by schema.
- **Persistent demo account** (`packages/db/src/seed-demo.ts`, `pnpm seed:demo`):
  username `demo` / password `demo123`, hashed through the normal scrypt path.
  Verified idempotent (re-run keeps 4 goals / 13 tasks, no duplication), reset to
  canonical state, and that `demo123` authenticates while a wrong password is
  rejected. Created only by the command — never by a request. Demo login is
  feature-flagged (`demoLoginEnabled`) and off in production by default.
- **Rich demo data** built from Mukilan's real projects: SAT prep, a Class 12
  SQL/Python–MySQL unit, the **OASIS** cross-marker IHC research (sourced from the
  real `ihc.md`), and an exoplanet classifier — with milestones, tasks, sources
  (embedded), decisions, notes, claims + evidence, learning states, schedule,
  receipts, and memory. Grounded Q&A over the OASIS sources returns real citations
  (`retrievalMode: "vector"`).
- **Design system** retuned to a light sky-blue / soft-cyan palette with navy for
  authority (`docs/frontend-design-system.md`); coherent tokens with legacy
  aliases; boxed metric/detail grids replaced with soft gap-separated tiles.
- **Auth + onboarding UX**: one-click "Try the demo", show/hide password, inline
  errors; a 5-step guided onboarding with a progress stepper, per-step validation,
  and localStorage save/resume (verified rendering + step advance in the browser).

New/updated docs: [docs/demo-account.md](docs/demo-account.md),
[docs/demo-walkthrough.md](docs/demo-walkthrough.md),
[docs/frontend-design-system.md](docs/frontend-design-system.md), README, and
`.env.example`.

---

## 0.5 NotebookLM unofficial-API viability (investigation only)

A narrowly-scoped viability check of an unofficial NotebookLM Python client
([`teng-lin/notebooklm-py`](https://github.com/teng-lin/notebooklm-py), MIT,
Python 3.10–3.14, actively developed) and the official Enterprise API. **Nothing
was implemented, no dependency was added, and no smoke test was run.** Full write-up:
[docs/notebooklm-unofficial-viability.md](docs/notebooklm-unofficial-viability.md).

- The unofficial client exposes a mature surface (notebooks CRUD, sources incl.
  PDF/text/URL/YouTube/Drive, processing-status polling, grounded `chat.ask` with
  citations, study-guide/quiz/flashcard/audio artifacts, job polling, downloads,
  deletes) — but every capability is **documented only**, none verified live.
- **Smoke test deliberately not attempted:** all auth paths (Playwright login,
  cookie import, master-token) require authenticating a real Google account and/or
  copying session cookies — outside the guardrails — so the check stopped before
  authentication, as instructed.
- It rides Google's **undocumented `batchexecute` RPC** ("can break anytime"),
  needs per-user Google credential/cookie custody, and carries ToS/bot-detection
  risk. The **official Enterprise API is Preview**, licensed/org-gated, and does
  **not** document the chat/artifact workflow Continuum needs.
- **Verdict: `experimental local adapter only` — not production-viable.** Keep
  NotebookLM as an optional, feature-flagged, local-only handoff (as the Connections
  screen already frames it); never a required production dependency. Continuum's
  native ingestion → retrieval → grounded-citation stack already covers the need.

---

## 0.6 Deep frontend / interaction pass (2026-07-22, completed)

A follow-up pass to make the linked features feel like one coherent product. Test
totals updated: `pnpm test` **145 passing** (was 125), typecheck 8/8, build 8/8.

**Done and verified this pass:**

- **Centralized presentation layer** (`apps/web/lib/labels.ts`, `tests/labels.test.ts`,
  14 tests): raw backend enums no longer leak into the UI. `humanize`/`formatLabel`
  plus domain helpers (priority, event type, mastery, source MIME, concept id,
  language, badge tone) render sentence-case, curriculum-friendly labels. Applied
  across Plan, Memory, Review, Research, Learn, Code. Browser-verified: task badges
  read "In progress"/"Done", the Review audit trail shows "Verified checkpoint",
  "Source indexed", etc. — **zero raw snake_case** on screen.
- **Code session no longer resets** (`components/workspace/use-code-session.ts`,
  `tests/code-session.test.ts`, 6 tests). The session (code/topic/language/mode/
  prompt/answer/attempts) persists to `localStorage` and restores on mount, so
  navigating away and back, refresh, and errors never discard work. Two root causes
  fixed: no persistence + remount-on-nav, and a `next/dynamic({ssr:false})` editor
  that suspended the subtree and deferred the restore effect. Verified live: a saved
  session restores the exact topic, language, and code into the editor.
- **Real code editor** (`components/workspace/code-editor.tsx`): CodeMirror 6 with
  syntax highlighting, line numbers, Tab-to-indent (Python-safe), bracket matching,
  undo/redo, and a graceful `<textarea>` fallback — loaded from the editor's own
  effect (not `next/dynamic`) so it never blocks the screen. Plus attempt history
  (restore any past attempt), a confirm-gated Reset session, and duplicate-submit
  guarding. See [docs/code-learning-ux.md](docs/code-learning-ux.md).

**Also completed:**

- **Real disposable Code execution:** JavaScript/TypeScript run in a dedicated
  Web Worker, Python uses Pyodide in a worker, and SQL uses an isolated SQLite-WASM
  database. Runtime output, errors, duration, exit, timeout, and exact-output tests
  are deterministic and visually separate from AI feedback. Java/C/C++/Rust are
  labelled editor-only. Browser execution and navigation persistence are Playwright-tested.
- **Learn:** a curriculum home, six-minute source-locked micro-lesson, unseen
  numerical checkpoint, official YouTube Data API adapter with safe manual handoff,
  and a guided resource return/verification flow. The first Playwright run found
  and fixed a legacy hard-coded cross-account Physics goal reference; events now
  link only to a matching goal owned by the signed-in user.
- **Plan:** seven-day board, Goal and Backlog views, real calendar constraints,
  deterministic draft generation, and a visibly separate explicit confirm/commit.
- **Research:** project-first tabs, official OpenAlex and Crossref adapters,
  normalized/deduplicated metadata, provider health states, saved provenance, and
  a Google Scholar URL handoff with no scraping. OpenAlex's adapter is fixture-tested;
  the browser flow uses a named contract fixture because this environment has no key.
- **Memory + MCP:** meaningful current-state domains, stable token-bounded context
  packs (`current_week`, `current_misconceptions`, `goal:*`, `project:*`), Markdown/
  JSON exports, delta retrieval, and approval-gated updates. MCP now exposes 33 tools
  (31 remote), including pack list/get, changes-since, and approved updates.
- **Obsidian:** the local plugin incrementally mirrors generated context packs under
  `Continuum/Context Packs/`, skips unchanged files, and refuses to overwrite ordinary
  notes. Postgres remains canonical.
- **AI routing:** centralized prompt envelopes separate policy, user request,
  source content, runtime data, and output contract. Featherless supports four
  server-only credentials with stable non-secret IDs, bounded failover, concurrency
  accounting, and 429/auth/transient backoff.
- **Visual QA:** every route was reviewed at 1440×900 and 390×844; rebuilt Code,
  Learn, Plan, Research, Memory, Today, Review, and Connections screenshots are in
  `docs/audit-screenshots/`. The rebuilt routes have no horizontal viewport overflow.
- **Playwright:** 6/6 journeys pass and cover all 15 requested checkpoints, including
  a real OAuth+PKCE MCP retrieval of a database checkpoint saved from Code Lab.

The exact implementation/status boundary is documented under `docs/`; live,
fixture-tested, browser-tested, experimental, unverified, and unavailable claims
are deliberately kept separate.

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
5. **Tests** (+8, **106 at the end of session 2** — since grown to 125):
   `tests/onboarding.test.ts` (deterministic planner), and an MCP shared-state
   read-after-write continuity assertion.

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
   full suite **98 passing at the end of session 1** (historical — now 125).

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
  NotebookLM is a handoff only. ChatGPT MCP is future scope. The Connections
  screen now labels each honestly ("Ready to connect" / "Setup required" /
  "Not connected" / "Optional" / handoff-only), so the earlier product-honesty
  gap is closed in the UI — but none of these providers are actually connected.
- **Onboarding: five-step guided UI, browser-verified.** The in-app onboarding is
  a five-step flow (About you · Your goal · Your time · How we help · Review)
  wired to `/api/onboarding`, with a progress stepper, per-step validation,
  backward-persistence, and `localStorage` save/resume. This was verified in the
  browser on a throwaway account end-to-end (advance/validation/persist/resume,
  duplicate-submit guard, and the generated 4 milestones / 7 tasks / 5 schedule
  blocks appearing on Today). Remaining nuance: the intake maps to the deterministic
  planner's generic milestone/task template, so generated task titles are
  template-shaped ("Targeted practice: study <subject>") rather than subject-bespoke.
- **Object storage under `next dev`.** Vercel Blob's `put` can hang under the dev
  server's patched fetch, so ingestion degrades storage to `unavailable` (bounded
  race) while still indexing. The store works in isolation and on Vercel; the
  original-binary persistence should be re-confirmed on a real deployment.
- **No Playwright test file yet.** Frontend coverage is (a) the
  `scripts/e2e-flow.mjs` runner (real APIs + real MCP OAuth, asserts persisted
  state), (b) 125 CI unit/integration tests, and (c) **manual browser verification
  on localhost this session** (auth, demo data, 5-step onboarding, all main
  screens, grounded Q&A + refusal, desktop + mobile). An automated Playwright suite
  for those flows is the top testing follow-up.
- **No deployment has occurred.** Everything above was verified locally against
  Neon; the working tree is uncommitted and nothing has been pushed or deployed.
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

**Done since the last report:** the polished five-step onboarding UI is now built
and browser-verified (see §0), and the Connections screen labels every integration
honestly.

**Deferred (P1, by scope):** live Zotero / Google Calendar / Obsidian / local
Ollama, an automated Playwright suite, and on-deployment reconfirmation of Blob
binary storage. None block the P0 demo.
