# Performance baseline (before fixes)

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
