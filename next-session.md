# Continuum redesign — state of the branch

**Specification:** [`redesign.md`](redesign.md) (2,908 lines, 20 sections).
This file records what has actually been executed, what was deliberately
deviated from, and what will waste your time if you don't know it.
**Where the two disagree, trust this file.**

**Branch:** `feat/product-ready-premium-rebuild`
**Green:** 965 tests across 66 files · 9 Playwright journeys + axe + responsive ·
`turbo typecheck` · `turbo build` · ESLint clean

---

## Where it stands

Every phase of §17 has landed, §18 is built, and §19 and §20 are closed.
`docs/acceptance.md` records what verifies each §19 criterion and, where a
criterion is only partly mechanical, names the half that still needs a person.
What remains is listed at the bottom and is all of that kind.

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
| §15.9 CSS paydown | `globals.css` 3,889 → 554 lines. No literal colour survives outside it. |
| §18 testing plan | Component, a11y, assistant-quality, responsive, visual and Lighthouse suites. |
| §19 / §20 | Closed. See `docs/acceptance.md`. |
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
   produced them. They were runtime artifacts from load testing. The same was
   true of the proposal queue: Review's four "byte-identical proposals" were
   load-test residue, and once they were cleaned out the screen had nothing to
   show. Two are seeded now, deliberately.

7. **Two of §20 Phase 2's four deletions did not happen.** `workspace-page.tsx`
   is a 33-line auth-and-shell wrapper and `lib/workspace-routes.ts` is the
   route table. Inlining either into twenty route files would duplicate code to
   satisfy a filename. What the box was for — per-route data, per-route bundles,
   real navigation — is done: every screen is `dynamic()`-split and every view
   reads only its own rows.

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

## Bugs found by running the product, not the tests

Every one was invisible to a green suite, and every one would have hit a real
user. They are worth reading before adding to the suite, because they show what
kind of test was missing.

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

5. **Every primary button was white text on the lime indicator, at 1.49:1.**
   `components/ui/kit.css` defines `.button-primary` on `--accent` near the top
   and then re-defines it on `--accent-mark` four hundred lines later. The
   product's most-used control, in the light theme, on every screen. A green
   suite and a working product both hid it; axe found it in one run.

6. **Review's diff had no left-hand side.** Its view returned no goals, tasks or
   projects, so the target record never resolved and every "before" cell printed
   an em dash. Invisible until the demo had a proposal to show, which it did not.

7. **Lighthouse was measuring the wrong thing.** `preset: "desktop"` sat beside
   `formFactor: "mobile"` in `lighthouserc.json`, and the preset wins — it
   reported a mobile run while applying 40ms RTT, 10 Mbps and no CPU slowdown.
   A green 100 against a condition §19.9 does not budget.

The pattern in all seven: each one is invisible to a test that asserts what the
code does, and obvious to anything that looks at what the user gets.

---

## What is still open

Everything here needs a person or a machine this session did not have. None of
it is code that was skipped.

- **§18.7 visual baselines.** The suite is written and runs under
  `PLAYWRIGHT_VISUAL=1`. Baselines are renderer-specific, so committing them
  from a laptop would fail on the first CI machine. Record them there.
- **§12.6 step 5** (trace a decision to its evidence) and **whether Claude picks
  the right tool from its description**. The tool chain is verified to exist and
  answer; the judgement is not script-checkable.
- **The iOS keyboard never obscuring the composer.** `dvh` and
  `env(safe-area-inset-bottom)` are used; nothing verifies them without a device.
- **A real Zotero library and a real Obsidian vault.** Both are stubbed at the
  network boundary in the journeys.
- **§18.11's Safari and Firefox passes.** Playwright runs Chromium only.
- **The light theme has not had a design pass.** It is verified — every route,
  no overflow, correct tokens, zero axe violations, and now no literal colour —
  but verified is not designed.
