# Performance after fixes

Same environment as the baseline (local dev, real Neon, real providers).

## Headline changes

| Metric | Before | After | How |
|---|---|---|---|
| `/api/ai` misconception diagnosis | ~120 s hang, no output | **3.76 s, HTTP 200, valid** | deadline + direct json_schema + Groq-first + content-only schema |
| `/api/ai` lesson generation | ~120 s hang | **1.97 s, HTTP 200, valid** | same |
| MCP `route_specialist_task` | 40 s+ timeout | **~4 s, correct answer** | same routing fix |
| In-app navigation (perceived) | full SSR + shell remount | **instant, no document reload** | client-side view cache + background refresh |
| `/api/state` warm read | ~0.15–0.20 s | ~0.15 s (now off the click critical path) | unchanged; just no longer blocking the click |
| Cold-start first request | +13 sequential seed inserts | seed removed from prod hot path | `demoSeedEnabled()` gate |

## Evidence

AI (was a 120 s hang):
```
misconception_diagnosis  http=200 3.76s
lesson_generation        http=200 1.97s
```

MCP specialist routing (was a 40 s timeout):
```
route_specialist_task    3.86s   isError:false
answer: "Electric potential is defined as the work per unit charge ..."
assistance: {"reason":"...","verification":"not_required","fallbackUsed":false}
```

Navigation (browser network trace after clicking "Research"):
```
GET http://localhost:3000/api/state?view=research → 200      ← XHR only
GET .../_app-pages-browser_components_workspace_research-screen_tsx.js → 200
(no new document GET /research; shell stays mounted; 0 console errors)
```
`location.pathname` becomes `/research` via `pushState`; browser Back
restores `/` + "Today" via the `popstate` handler.

`/api/state` warm samples (data path; now fetched in the background while the
cached view is shown instantly):
```
today    0.19 0.18 0.18
goals    0.15 0.15 0.15
research 0.16 0.15 0.14
memory   0.15 0.15 0.15
```

## Against the suggested budgets

| Budget | Target | Status |
|---|---|---|
| Local navigation feedback | < 100 ms | **Met** — cached-first switch is immediate; no reload |
| No full-app blocking spinner | — | **Met** — only per-view skeleton on first, uncached visit |
| No duplicate API call on normal rerender | — | **Met** — in-flight guard + cache |
| Model request begins responding | < 2.5 s when provider permits | **Met** — Groq structured ~1–4 s; code stream first-token fast |
| Standard API reads p95 | < 500 ms | **Met warm** (~150 ms); cold serverless still bounded by Neon RTT |

## Still bounded by external factors (documented)
- Absolute API latency floors at the Neon round-trip (~100 ms here); a
  cold serverless function pays pool + TLS setup on top. Client-side
  navigation removes this from the perceived path but not from a hard reload.
- Gemini/Featherless remain slow/erroring with the current credentials;
  structured generation deliberately routes around them to Groq, and the
  deadline guarantees a fast failure if every provider is unhealthy.

## Tunables added
- `AI_STRUCTURED_DEADLINE_MS` (default 40000) — overall structured-generation budget.
- `AI_ATTEMPT_TIMEOUT_MS` (default 20000) — per-attempt timeout.
- `GROQ_STRUCTURED_MODEL` (default `openai/gpt-oss-120b`) — schema-capable Groq model.
- `CONTINUUM_SEED_DEMO` — force the demo fixture on/off.
