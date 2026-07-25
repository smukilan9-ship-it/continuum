# Continuum — Audit & Remediation Report

Date: 2026-07-21
Scope: full-repository audit, high-impact performance and reliability fixes,
security review, and live verification of the core product flows.
Branch: `audit/perf-security-fixes` (off `main`).

> **Correction (later same day):** the "provider model IDs are forward-dated /
> unavailable — worked around" conclusion below (item 4, §2.4, §7) was
> **superseded**. Live probing showed all 10 Gemini keys are valid and both
> Gemini and Featherless generate real content — the failures were entirely
> hard-coded, forward-dated model IDs plus Featherless's removed `/v1/models`
> endpoint, not credentials. This was fixed with real runtime discovery + health
> checks + circuit breakers, verified end-to-end. See
> [REAL_APP_REPORT.md](REAL_APP_REPORT.md) and
> [docs/provider-registry.md](docs/provider-registry.md).

---

## 1. Initial state (verdict up front)

Continuum is **substantially more complete and better engineered than a
first read of the prompt implies.** It is a pnpm/Turborepo monorepo
(Next.js 15 App Router, React 19, Drizzle + Postgres/Neon, pgvector) with a
real user-scoped database, real password + Google-OpenID auth, opaque
revocable sessions, a standards-compliant remote MCP server (OAuth
authorization-code + PKCE, per-tool scopes, dynamic client registration),
and 87 passing automated tests. The advertised **cross-assistant continuity**
differentiator genuinely works end-to-end, and the **outcome-first resource
broker** is a real, deterministic lifecycle, not a mock.

The prompt's premise — "painfully slow and unresponsive", "unclear whether
features work", "mocked features presented as real" — was **partly borne out
in exactly two places**, both now fixed, plus a data-hygiene issue:

| # | Problem | Severity | Status |
|---|---------|----------|--------|
| 1 | AI structured generation could **hang up to 120 s** and return nothing | Critical (UX) | **Fixed** |
| 2 | Every in-app navigation was a **full server round-trip + shell remount** | High (UX) | **Fixed** |
| 3 | The **demo "Maya" fixture auto-seeded into every database**, incl. production, on cold start | High (data integrity) | **Fixed** |
| 4 | Configured provider **model IDs are forward-dated/unavailable** (Gemini 503/404, Featherless empty) | High (reliability) | **Worked around + documented** |

Baseline health that was already green: `pnpm test` (87), `pnpm typecheck`
(8 packages), `pnpm build` (17 s), `pnpm lint`, `pnpm audit --prod`
(0 vulnerabilities). No secrets committed; `.env*` correctly ignored.

---

## 2. Root causes of slowness

### 2.1 AI generation hang (the real "frozen UI")
Structured (JSON-schema) generation froze requests for ~120 s. Three
compounding causes:

1. **No overall deadline.** Attempts cascaded across providers, each with a
   45 s per-attempt timeout, so worst case was `providers × attempts × 45 s`.
2. **The AI SDK OpenAI-compatible provider does not send `response_format:
   json_schema`.** `Output.object` silently degraded to prompt-only JSON that
   reasoning models routinely break, so every attempt failed validation.
3. **Routing led structured tasks with models that cannot emit JSON schema**
   (Groq `llama-3.1-8b-instant`) or with a provider that hangs (Featherless,
   whose configured model IDs 404), so the one reliable path was never
   reached inside the budget.

Evidence (dev server log): `POST /api/ai 200 in 120018ms`, with
`AI SDK Warning (groq.chat / llama-3.1-8b-instant): "responseFormat" is not
supported`.

### 2.2 Navigation architecture
Every route is `export const dynamic = "force-dynamic"`, every nav link used
`prefetch={false}`, and each route re-rendered the **entire** client shell.
A click therefore paid the full SSR + remote-Neon latency (~150 ms warm,
much worse on a cold serverless function or mobile) **and** remounted the
sidebar/topbar every time — the classic "unresponsive" feel.

### 2.3 Cold-start fixture seeding
`ensureDemoSeed()` ran on the first repository call of every process and did
13 sequential inserts against the remote database before the first real
query returned — and it seeded a demo user into production.

### 2.4 Provider credential/model drift
`gemini-3.5-flash` is not in the account's model list (returns 503); real
flash models (`gemini-2.5-flash`, `gemini-flash-latest`) return 404/503 for
these keys; Featherless `/v1/models` 404s and its configured model IDs
return empty. These are **credential/model-availability** problems, not code
bugs, but they made the whole model layer look broken because generation had
no deadline and led with the failing providers.

---

## 3. Fixes implemented (focused commits on `audit/perf-security-fixes`)

1. **`perf(ai): stop structured generation from hanging up to 120s`**
   - Wall-clock budget (`AI_STRUCTURED_DEADLINE_MS`, default 40 s) + shorter
     per-attempt timeout (`AI_ATTEMPT_TIMEOUT_MS`, default 20 s), both
     clamped to the remaining budget.
   - Direct `response_format: json_schema` (`strict:false`, schema via
     `z.toJSONSchema`) for Groq/Featherless, bypassing the SDK's degraded
     JSON mode; Zod-validated. Verified: Groq `gpt-oss-120b` returns valid
     JSON in ~1.4 s.
   - `structuredRouteOrder` leads with Groq (its GPT-OSS models are the most
     reliable JSON-schema route); `selectGroqModel` forces a schema-capable
     model for structured tasks.
   - `/api/ai` now generates **content-only** schemas (no server-controlled
     ids/timestamps the model cannot produce) and gets `maxDuration=60`.
   - **Result:** `/api/ai` 200 in ~2–4 s; MCP `route_specialist_task` 200 in
     ~4 s (both were hangs/timeouts).

2. **`perf(web): make workspace navigation instant and client-side`**
   - `ContinuumApp` owns a per-view state cache seeded from the SSR snapshot;
     clicks switch instantly from cache and refresh in the background via
     `/api/state`; the shell no longer remounts.
   - Links intercepted for left-click (new-tab / modifier-click preserved),
     URL updated with `history.pushState`, `popstate` handled for
     back/forward, hover/focus pre-warms a view's data.
   - **Verified in-browser:** clicking a nav item issues only
     `GET /api/state?view=…` (no document reload), shell stays mounted,
     back/forward work, zero console errors.

3. **`fix(db): keep the demo fixture out of production and the hot path`**
   - `ensureDemoSeed()` is gated by `demoSeedEnabled()` (on in dev, off in
     production, override via `CONTINUUM_SEED_DEMO`); in production it is a
     resolved no-op. `pnpm db:seed` uses a new `runDemoSeed()` to load the
     fixture deliberately.

---

## 4. Security findings

Full detail in [docs/security-audit.md](docs/security-audit.md). **No
Critical or High exploitable issues were found.** The security engineering is
genuinely strong:

- User/tenant ownership is enforced **server-side on every query** (no IDOR
  found across a 1,284-line repository review).
- Slow scrypt password hashing, opaque revocable sessions, login lockout,
  same-origin write protection, secure cookies, remote-DB TLS enforcement.
- MCP: OAuth authorization-code + PKCE, per-tool scopes, token
  audience/issuer/resource validation, immediate revocation checks, origin
  allowlist, rate limiting.
- No secrets in tracked files or git history; `.env*` ignored; no
  `NEXT_PUBLIC_*` secret exposure; no secret logging; `pnpm audit --prod`
  clean. Provider keys are server-only and never returned in responses.
- Retrieved sources are explicitly marked untrusted in every system prompt;
  the browser-to-loopback Ollama path validates a loopback hostname (no
  SSRF).

Informational/Low items (documented, not blocking): CSP uses
`script-src 'unsafe-inline'` (Next.js default tradeoff); a few authenticated
routes echo `error.message`; a static non-production MCP demo token exists
(disabled in production).

---

## 5. Feature verification (live)

Full matrix in [docs/functionality-audit.md](docs/functionality-audit.md).
Highlights, tested live against the real Neon DB and real providers:

- **Cross-assistant continuity — WORKS both directions (HTTP, end-to-end).**
  MCP `sync_session` write → visible in the app via `/api/state`; app
  `goal.created` → visible via MCP `list_goals`. See
  [docs/mcp-verification.md](docs/mcp-verification.md).
- **MCP server — WORKS.** `initialize`, `tools/list` (27 tools),
  `resources/list` (7), and read/write tool calls all succeed.
- **Model routing — WORKS with fallback + deadline.** `route_specialist_task`
  returns a correct answer in ~4 s via Groq; independent-verifier path routes
  to a second provider.
- **Streaming Code coach — WORKS.** `/api/code` streams well-formed Markdown
  with fast time-to-first-token.
- **Resource broker lifecycle — WORKS.** recommend → start → return → verify →
  evidence-gated mastery update → outcome receipt → spaced follow-up, all
  user-scoped and deterministic.
- **Auth/onboarding — WORKS.** register, login (scrypt), session, logout.

Cannot be live-verified without external credentials/accounts (honestly
flagged): live Zotero library sync, a
running local Ollama, and any real Gemini/Featherless generation (their
current keys/model IDs error — Groq carries the model layer).

---

## 6. Performance before/after

| Metric | Before | After |
|---|---|---|
| AI structured generation (`/api/ai`) | **~120 s hang → nothing** | **~2–4 s, valid output** |
| MCP `route_specialist_task` | 40 s+ timeout | ~4 s |
| In-app navigation | full SSR round-trip + shell remount (~150 ms warm, worse cold) | **instant (cache-first), no reload** |
| `/api/state` warm read | ~150–200 ms | ~150 ms (now off the click's critical path) |
| Cold-start first request | +13 sequential seed inserts | seed removed from prod hot path |
| Build / tests / typecheck | green | green (89 tests) |

Detail: [docs/performance-baseline.md](docs/performance-baseline.md),
[docs/performance-after.md](docs/performance-after.md).

---

## 7. Remaining limitations / required external setup

- **Provider credentials.** The deployed `GEMINI_MODEL=gemini-3.5-flash` is
  not an available model and the Gemini keys currently return 503/404;
  Featherless model IDs return empty. Structured generation and the code
  coach route around this via Groq, but to restore Gemini/Featherless the
  operator must set working model IDs and healthy keys. This is deployment
  config, not code.
- **Not live-tested (no credentials):** Zotero, local
  Ollama end-to-end. Deterministic/mocked paths and code paths exist and are
  reviewed.
- **ChatGPT MCP** remains future scope, as the repo already states.

## 8. Demo-readiness verdict

**Demo-ready for the two headline flows.** Cross-assistant continuity (app ⇄
Claude via MCP) and the outcome-first resource redirect+verify+return loop
both work end-to-end on real persistent state, navigation is instant, and the
AI paths that back the demo (MCP specialist routing, streaming code coach,
`/api/ai` diagnostics) respond in seconds instead of hanging. Keep Groq
configured; treat Gemini/Featherless as best-effort until their
credentials/model IDs are refreshed.
