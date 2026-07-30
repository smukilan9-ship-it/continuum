# Performance baseline

## Before the redesign

Environment: local dev server (`pnpm dev`, Next 15.5) against the real Neon
database and the real configured providers, authenticated as a freshly
registered account. Times are `curl %{time_total}` unless noted, warm (route
already compiled). Dev latency to Neon dominated by ~100 ms round-trip.

## Toolchain health (already green at baseline)

| Check | Result |
|---|---|
| `pnpm test` | 87 passed (17 files) |
| `pnpm typecheck` | 8 packages pass |
| `pnpm build` | success, 17 s; first-load JS ~124 kB (workspace routes), 103 kB shared |
| `pnpm lint` | clean |
| `pnpm audit --prod` | 0 known vulnerabilities |

Bundle size and CSS are **not** a problem: 124 kB first-load, screens are
`dynamic()`-split, `globals.css` has no heavy blur/animation libraries.

## Ranked bottlenecks

### 1. (Critical) AI structured generation hangs ~120 s
`POST /api/ai` (misconception diagnosis / lesson generation) and MCP
`route_specialist_task`:

```
POST /api/ai 200 in 120018ms
AI SDK Warning (groq.chat / llama-3.1-8b-instant):
  The feature "responseFormat" is not supported...
```

Cause: no overall deadline across a provider cascade with 45 s per-attempt
timeouts; the OpenAI-compatible provider does not send `response_format`, so
JSON validation always failed; routing led with models that cannot emit JSON
schema and with Featherless (whose model IDs 404 and whose calls hang).

### 2. (High) Navigation is a full server round-trip per click
Every route is `force-dynamic`; every nav `<Link>` used `prefetch={false}`;
each route re-renders the whole `ContinuumApp` shell.

| Path (warm SSR HTML) | Time |
|---|---|
| `/` | 0.18 s |
| `/goals` | 0.15 s |
| `/learn` | 0.15 s |
| `/research` | 0.14 s |
| `/memory` | 0.14 s |

Each click pays this **plus** a full shell remount, with **no** prefetch and
**no** caching. Session lookup alone is ~100 ms:

```
/api/auth/session  0.68s (cold) → 0.10s → 0.10s
```

On a cold serverless function or a distant Neon region / mobile network this
degrades to the multi-hundred-ms-to-second range that reads as "unresponsive".

### 3. (High) Demo fixture seeded in the cold-start hot path
`ensureDemoSeed()` runs 13 sequential inserts against the remote DB on the
first repository call of a process, and writes a demo user/goals into every
database including production.

### 4. (High, config) Provider model IDs are unavailable
Direct probes of the configured providers:

```
GEMINI gemini-3.5-flash     http=503 (not in the account's model list)
GEMINI gemini-2.5-flash     http=404 "no longer available"
GEMINI gemini-flash-latest  http=503 "high demand"
GROQ   openai/gpt-oss-120b  http=200  ~0.5s  valid JSON   ← the reliable path
GROQ   llama-3.1-8b-instant rejects response_format json_schema
FEATHERLESS /v1/models      http=404; sample model returns 200 with empty body
```

Only Groq `gpt-oss-*` reliably returns schema-valid JSON with the current
credentials. Because generation had no deadline and led with the failing
providers, the entire model layer appeared broken.

## What was measured but was fine
- DB read fan-out uses `Promise.all` (no N+1) with correct indexes.
- Streaming `/api/code` produced well-formed Markdown with fast first-token.
- Client bundle sizes, images, fonts, CSS.


---

# After the redesign

Measured against a live deployment on 2026-07-30. Every number is the §19.9
budget beside what the product actually does.

**How to reproduce.** Deploy a preview, then:

```bash
node scripts/verify-release.mjs <deployment>   # heights, overflow, headings
node scripts/verify-mcp.mjs <deployment>       # MCP call counts
rm -rf apps/web/.next && pnpm build            # bundle sizes
```

Route timings are p75 of five warm `curl -w '%{time_starttransfer}'` samples per
route, from a client in India against `sin1`.

## Against the §19.9 budgets

| Metric | Budget | Measured | |
|---|---|---|---|
| Landing document height @1440 | ≤ 6,500px | **5,479px** (from 9,843) | ✅ |
| App route TTFB (p75) | < 400ms | **195–448ms** (from 800–1,437) | ⚠️ six of seven |
| Assistant first token — chitchat | < 800ms | **~930ms** | ⚠️ |
| Assistant first token — about my work | < 1.5s | **1.4–2.2s** | ⚠️ |
| Marketing JS | < 120 KB | **116 KB** | ✅ |
| App shell JS | < 180 KB | **135 KB** (from 218) | ✅ |
| MCP workflows | ≤ 2 calls | **1 call** each | ✅ |
| `globals.css` | < 600 lines | **503** (from 3,889) | ✅ |

### Per-route TTFB

| Route | p75 |
|---|---|
| `/ask` | 217ms |
| `/plan` | 214ms |
| `/library` | 201ms |
| `/review` | 195ms |
| `/context` | 202ms |
| `/g/[goalId]` | 198ms |
| `/home` | 448ms |

## The single largest change

**Function region.** Functions defaulted to `iad1` (US East) while the Neon
instance is in `ap-southeast-1` (Singapore), so every query crossed the Pacific
and back — and a page render makes at least two. Pinning them to `sin1` in
`apps/web/vercel.json` took p75 from **800–1,437ms to 195–448ms** without
changing a line of application code.

Anyone moving the database must move this too; they are one decision.

## What is still over budget, and why

**Assistant first token.** The ~930ms chitchat figure is dominated by the
provider's own time to first token over the network, not by anything Continuum
does — retrieval is provably zero for that class, asserted with a call counter
in `tests/assistant-orchestrator.test.ts`. The `about_my_work` range is
retrieval plus model; the orchestrator caps retrieval at 2s and degrades rather
than blocking, so the worst case is bounded and reported to the user rather
than hidden.

**`/home` TTFB.** The one route over budget, and the one that reads the most:
`getHomeData` plus `getShellData` plus the schedule. Merging those into one
query is the obvious next step and was not attempted.

## Not measured

- **LCP and CLS under throttling.** §19.9 budgets landing LCP < 2.0s on a
  simulated Fast 3G / 4× CPU throttle and CLS < 0.05. The marketing page is
  structurally CLS-free — every image frame carries `aspect-ratio` plus
  explicit `width`/`height` — but no throttled Lighthouse run is recorded.
- **Cold start.** Every figure above is warm.
