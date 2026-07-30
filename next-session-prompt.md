# Next-session prompt

Paste the block below into a fresh session.

---

Finish the Continuum redesign. Everything that remains, end to end, verified working — not a prioritized subset. Work autonomously and commit incrementally; I won't be available to answer questions.

This is a pnpm/turbo monorepo, Next.js App Router.

**Source of truth.** `redesign.md` (2,908 lines, 20 sections) is the specification. `next-session.md` records what has already been executed, what was deliberately deviated from, and the traps. Read `next-session.md` first — it's short — then the `redesign.md` sections you need. Where they disagree, trust `next-session.md`.

**State.** Branch `feat/product-ready-premium-rebuild`, pushed to origin, **not merged to `main`**, so nothing is in production. 412 tests across 45 files, `turbo typecheck` and `turbo build` green. Phases 0, 1, 4 (Home + Review only), 5, 6, 7, 9 and 10 are done — the workspace screens look and behave like the redesign. What's left is the assistant's interface, the data layer, the goal page, the marketing page, the CSS paydown, and essentially all of §18.

## Step 0 — apply the migrations. This gates two routes and the entire e2e suite

```bash
pnpm db:migrate
```

`0009_source_lifecycle` (adds `processing_state`, `processing_error`, `retention` to `sources`) and `0010_study_sessions` are authored but never run. That is why `/memory` and `/research` return 500 with `SQLSTATE 42703 column "processing_state" does not exist`, and why `pnpm test:e2e` times out creating a study session. Both are purely additive per §16.8 and will not disturb the currently-deployed build.

**`.env.local` points at the production Neon database.** The previous session declined to run DDL against production unattended. Run it — that is the intent — but know what you're touching, and don't run anything else destructive against it.

Separately, preview deployments 500 because their branch-scoped database is behind by migration `0008`. Migrate the preview database too. **Do not "fix" it by deleting the branch-scoped `DATABASE_URL`** — that only works by pointing every preview at production.

## The remaining work, in dependency order

1. **§8.4 `GET /api/search` + §8.5 the `⌘J` assistant panel.** Build together. The panel makes Build's and Library's "Ask" real — both already call an `onAskAssistant`-shaped callback with `TODO(§8.5)` waiting on it. Search fixes C13: the palette covers only goals, tasks, projects and receipts, so it can't find a source, paper, conversation or concept.

2. **§11.2 / §11.6 the assistant interface.** Wire `CitationChip` / `ContextChip` from `components/ui` into `assistant-screen.tsx`; replace the ten context-scope checkboxes with removable chips; add the context inspector that opens on a chip click; add the broad-search confirmation (§11.3 step 6) and the attachment destination choice (S12). Extract §11.3's eleven steps into `lib/assistant/orchestrator.ts` — the logic is currently inline in the route. The engine was finished in Phase 3; this is the interface half of C4 and C5, and the §20 judge path does not work without it.

3. **§16.3 the remaining endpoints** — `/api/home`, `/api/goals/[id]`, `/api/projects/[id]` — then retire `getWorkspaceSnapshot` and the client-side view cache in `continuum-app.tsx` (C25). Move each route to fetching its own data.

4. **§9.6 goal page rebuild.** Depends on 3 — it is specified as per-view fetching. Currently the Phase 2 version with the concept map bolted on.

5. **§16.1 route groups `(app)` / `(auth)` / `(marketing)` and §16.7 the 15 redirects.** Coupled: redirects need the new paths to exist.

6. **§10 marketing page.** Seven sections. Six screenshots captured from the *rebuilt* app by a scripted Playwright job (`scripts/capture-marketing.mjs`) so they can be regenerated. Delete `landing.css` (2,483 lines), `landing-motion.tsx`, `hero-views.tsx`. Update `sitemap.ts` and `robots.ts`. Height ≤ 6,500px, zero false claims, demo reachable in one click.

7. **§15.9 CSS paydown to under 600 lines.** `globals.css` is 4,168. The legacy token-alias block at the top is what keeps the old per-screen CSS rendering — migrate each remaining screen's selectors into a co-located module, then delete the aliases.

8. **The remaining specified gaps.** Forget on `/context` (AC-CX3 — needs a store write in both `MemoryStore` and `NeonStore`). Delete the discovery block from `research-screen.tsx` now that Library owns it. "Send to project" and "Download" on source rows, both currently disabled pending an API. Source-detail passage listing. Make the Zotero DOI chip exact by attaching matches in the OpenAlex `search` branch rather than building a session index.

## §18 — the full testing plan. Install the tooling first

`@testing-library/react`, `jsdom`, `@axe-core/playwright` and `@lhci/cli` are all absent, so component tests (§18.2), accessibility tests (§18.6), visual regression (§18.7) and performance budgets (§18.9) cannot run at all. Install them, then build out:

- §18.2 component tests for every `components/ui/*` primitive plus the screen-level cases listed there.
- §18.3 integration tests: ownership scoping on the new endpoints, `forget` excluding a record from the next retrieval, `retention` honoured on `/api/sources`.
- §18.4 rewrite `e2e/continuum.spec.ts` around all nine journeys. It was remapped for Phase 7 only; its Build, Connections and Context tests still drive deleted screens.
- §18.5 the 20-prompt assistant-quality suite (mechanically checkable properties only).
- §18.6 axe on every route in both themes at 1280 and 375 — zero critical or serious.
- §18.7 visual-regression baselines from `/dev/kit` plus nine routes, both themes, three widths.
- §18.8 responsive assertions including the explicit Plan-grid bounding-box check (the C6 guard).
- §18.9 Lighthouse CI against the §19.9 budgets.

## Then close the release gate

Work the §19 acceptance-criteria matrix route by route and the §20 final checklist. Both themes, 1440 and 375. When it passes: merge to `main`, deploy, and run the §12.6 twelve-step Claude MCP procedure against the deployed build, recording results in `docs/mcp-verification.md`.

Update `next-session.md` as you go so it reflects reality rather than intent.

## Parallelizing this

Subagents in git worktrees worked well last session for the screen rebuilds — four ran concurrently. Two things to get right, both learned the hard way:

- **Their worktrees are cut from `main`, not from this branch.** Say so explicitly in every brief, or each agent wastes a step discovering it and resetting.
- **Assign migration numbers and file ownership up front.** Two agents independently authored a migration numbered `0009`, and a `git add -A` swept the worktrees in as embedded repos.

Give each agent one disjoint component directory, tell it to put CSS in a co-located file composing tokens only, and forbid `globals.css`, `components/ui/**`, `layout.tsx` and `next.config`. Do shared-file wiring yourself after merging. The assistant work (items 1–2) and the data layer (item 3) are too entangled to split — do those yourself.

## Traps that have already cost time

- **Never run `pnpm build` while a dev server is up.** They share `apps/web/.next` and the build corrupts what the server is serving. Symptom: a cascade of `Cannot find module './NNNN.js'` and a missing `routes-manifest.json`. Fix: stop the server, `rm -rf apps/web/.next`, restart.
- **`pnpm build` lints strictly.** An unused variable fails a build that typechecks clean.
- Start the dev server with `preview_start { name: "continuum-web" }`, never through Bash.
- The browser pane's screencast freezes on native scroll; scroll with `javascript_tool` and read state through the accessibility tree.
- Dev-mode first-request timing is route compilation, not app latency. Warm up before measuring.
- The plan's identifier regex (`_[a-z0-9]{6,}` in AC-H3 and §11.5) does not match the ids this product mints — `goal_demo_sat` has an underscore. Use the class in `lib/user-copy.ts`.

## Do not

- Do not weaken or delete an existing test to make a change pass. Understand what it protects first — several suites guard specific past regressions: the verbatim C1 reasoning leak, enumeration-safe auth timing, and mastery moving only on a correct unseen check.
- Do not ship a control that does nothing. If a capability needs an API that doesn't exist, either build the API or leave the control out and say so — a dead button is the class of dishonesty this redesign exists to remove.

## Verify every change with

```bash
pnpm typecheck && pnpm test && pnpm build
```
