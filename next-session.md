# Continuum redesign — state of the branch

**Specification:** [`redesign.md`](redesign.md) (2,908 lines, 20 sections).
This file records what has actually been executed, what was deliberately
deviated from, and what will waste your time if you don't know it.
**Where the two disagree, trust this file.**

**Branch:** `feat/product-ready-premium-rebuild`
**Green:** 498 tests across 51 files · `turbo typecheck` · `turbo build` · ESLint clean

---

## Where it stands

Every phase of §17 has landed. The remaining work is verification breadth,
not features — see "What is still open" at the bottom.

| Area | State |
|---|---|
| §8.4 cross-object search + `⌘K` palette | Done. Nine object kinds, one user-scoped pass. Fixes C13. |
| §8.5 `⌘J` assistant panel | Done. Same thread and composer as `/ask`, one controller (AC-A9). |
| §11.2/§11.3/§11.6 assistant | Done. Orchestrator extracted, citation chips, context inspector, broad-search confirmation, zero checkboxes (AC-A8). |
| §16.3 per-route endpoints | Done. `/api/home`, `/api/goals/[id]`, `/api/projects/[id]`, `/api/search`. |
| C25 client view cache | Removed. Navigation is real router navigation; the shell holds only UI state. |
| §9.6 goal page | Rebuilt on per-view fetching. AC-G1…G5 verified. |
| §13.1 project page | New at `/g/[goalId]/p/[projectId]`. |
| §16.1 route groups + §16.7 redirects | Done. 16 rules, 13 of the 15 (see the deviation below). |
| §10 marketing page | Rebuilt. 5,479px at 1440 (ceiling 6,500). Real screenshots. |
| §15.9 CSS paydown | `globals.css` 3,889 → 510 lines. Legacy token aliases deleted. |
| §9.9 Forget, §13.2/13.3 gaps | Done. |
| §12.6 MCP verification | 11 of 12 steps pass against a live deployment. |

---

## Deviations from the plan, and why

1. **`/research` and `/learn` are not redirected.** §16.7 sends both to
   `/home` on the basis that they are absorbed into the goal page. Learn still
   owns the practice-set builder and the resource panel, which have no other
   address, so redirecting them would delete reachable capability. Both stay
   live and are simply not in the fixed nav (§7.1's six destinations). Recorded
   in `next.config.mjs` beside the rules.

2. **The MCP surface is 15 tools, not §12.2's 13.** `suggest_next_resource` and
   `start_study_session` complete the resource workflow (suggest → start →
   record result). Dropping them for a rounder number would cost real function.

3. **The identifier regex in the plan is wrong.** §9.4 AC-H3 and §11.5 specify
   `_[a-z0-9]{6,}`, which never matches this product's ids — `goal_demo_sat`
   contains an underscore. Use the class in `apps/web/lib/user-copy.ts`.

4. **`read_source_passage` does not take a `query`.** §12.2 proposed it; the
   store has no passage-search operation and the two-call workflow works
   without it. Not claimed, not built.

5. **§11.9's latency budgets assumed retrieval was the bottleneck.** It was
   model selection. The budgets are right; the diagnosis in the plan is not.

6. **The `probe` conversations were never seeded.** §3.4 claimed `seed-demo.ts`
   produced them. They were runtime artifacts from load testing.

---

## Traps

1. **Never run `pnpm build` while a dev server is up.** They share
   `apps/web/.next` and the build corrupts what the server is serving. Symptom:
   a cascade of `Cannot find module './NNNN.js'` and a missing
   `routes-manifest.json`. Stop the server, `rm -rf apps/web/.next`, restart.

2. **`pnpm build` lints strictly.** An unused import fails a build that
   typechecks clean.

3. **Start the dev server with `preview_start { name: "continuum-web" }`,
   never through Bash.** `turbo.json` now passes `PORT` through — strict env
   mode was filtering it, so `next dev` ignored the port its supervisor
   assigned and the preview tooling pointed at the wrong place.

4. **`.env.local` points at the production Neon database.** Confirmed, not
   assumed. Anything you run locally with these env vars writes to production.
   It is fully migrated. `seed:demo` is safe and idempotent — it only touches
   `user_demo` — and re-running it is how you clear test conversations out of
   the demo workspace.

5. **The browser pane's screencast freezes on native scroll.** Scroll with
   `javascript_tool` and read state through the accessibility tree.

6. **Dev-mode first-request timing is route compilation, not app latency.**
   Warm up before measuring. Measuring "real" before "fake" once produced a
   fake 13× gap that did not exist.

7. **Agent worktrees are cut from `main`, not from this branch.** Say so
   explicitly in every brief, or each agent wastes a step discovering it.

8. **Migrations now run in the deployment build**
   (`scripts/migrate-on-deploy.mjs`). Preview databases used to drift and 500
   on every DB-backed route; Vercel marks those connection strings sensitive so
   they cannot be pulled and migrated from a laptop. It is a no-op without
   `DATABASE_URL` and non-fatal unless `MIGRATE_ON_DEPLOY=required`.

---

## Verification

```bash
pnpm typecheck && pnpm test && pnpm build
node scripts/verify-release.mjs            # §19.1/§19.7/§19.10, needs a dev server
node scripts/verify-mcp.mjs <deployment>   # §12.6, needs a deployed build
node scripts/capture-marketing.mjs         # §10.5 screenshots, needs a dev server
```

Regression suites worth knowing about — each one guards a specific past failure:

| File | Guards |
|---|---|
| `tests/assistant-output-filter.test.ts` | 43 cases including **the production reasoning leak verbatim** |
| `tests/assistant-classify.test.ts` | Greetings and general knowledge perform **zero** retrieval |
| `tests/assistant-orchestrator.test.ts` | The refusals: no retrieval for chitchat, no scope names as provenance, an excluded record stays excluded, a wide search stops and asks |
| `tests/oauth.test.ts` | The full flow on an origin that is **not** `APP_BASE_URL` — every preview |
| `tests/mcp.test.ts` | The exact tool inventory, every input schema, and that a union-schema tool registers with a real shape |
| `tests/account-recovery.test.ts` | Enumeration-safe timing, asserted structurally |
| `tests/context-forget.test.ts` | A forgotten record is gone from the next `searchMemory` **and** `searchWorkspace` |
| `tests/goal-endpoints.test.ts` | Ownership scoping; no cross-goal leakage in any view |
| `tests/learning.test.ts` | Mastery moves only on a correct unseen check |

---

## Bugs this session found by running the product, not the tests

All four were invisible to a green suite, and all four would have hit a real
user. They are worth reading before adding to the suite, because they show
what kind of test was missing.

1. **`save_to_continuum` was dead for every MCP client.**
   `McpServer.registerTool` takes a Zod *shape*; reading `.shape` off a
   `z.discriminatedUnion` yields `undefined`. The tool was registered with no
   schema and every call failed before its handler ran. 26 unit tests passed
   throughout, because they call `executeTool` directly and never go through
   registration.

2. **OAuth rejected the resource its own discovery document advertised.**
   `/.well-known/oauth-protected-resource/mcp` returns the *serving* origin;
   validation compared against `APP_BASE_URL`. On every preview — and on
   production whenever the base URL is an alias — Claude could not connect. It
   broke in four places with three different misleading messages.

3. **A 503 that blamed the model for our bug.** A response header carried an
   ellipsis; header values are Latin-1, so assigning it threw *inside* the
   catch that wraps provider calls, and every assistant turn reported "the
   model is temporarily unavailable" after a successful model call.

4. **An infinite render loop in the assistant controller**, from a callback
   defined inside a `useMemo` and consumed by an effect keyed on its identity.

---

## What is still open

- **§18.7 visual-regression baselines** and **§18.9 Lighthouse budgets** are
  configured but have no committed baseline numbers.
- **§12.6 step 5** (trace a decision to its evidence) needs a demo workspace
  with a claim that has linked evidence. The tool chain is verified to exist
  and answer; the end-to-end trace is not.
- **Whether Claude *chooses* the right tool** from its description is not
  script-checkable. It needs a person with Claude Desktop following §12.6.
- **115 raw hex values** remain inside the migrated per-screen CSS. They are
  pre-existing — they were in `globals.css` before, equally against §15.9's
  rule 3 — and most are light-theme values with no token equivalent, so
  replacing them is a colour decision rather than a mechanical one.
- **The light theme** is verified by the §19 sweep (every route, no overflow,
  correct tokens) but has not had a full design pass.
