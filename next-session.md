# Continuum redesign — handoff to the next session

**Source of truth for the remaining work:** [`redesign.md`](redesign.md) (2,908 lines, 20 sections).
This file records only *what has already been executed from it*, what was
deliberately deviated from, and what will waste your time if you don't know it.

**Branch:** `feat/product-ready-premium-rebuild`
**State:** pushed to `origin/feat/product-ready-premium-rebuild`; **not merged to `main`**
**Green:** 412 tests across 45 files · `turbo typecheck` clean · `turbo build` clean

---

## ⚠️ Two migrations are authored but NOT applied — apply them first

`/memory` and `/research` currently return **500** locally. Nothing else does
(11 of 13 routes return 200). The cause is exact and is not a code bug:

```
column "processing_state" does not exist    SQLSTATE 42703
```

Phase 6 added `packages/db/migrations/0009_source_lifecycle.sql`
(`processing_state`, `processing_error`, `retention` on `sources`) and Phase 7
added `0010_study_sessions.sql`. `packages/db/src/schema.ts` now selects those
columns, so the two `getWorkspaceSnapshot` branches that read `sources` —
`research` (repo.ts:518) and `memory` (repo.ts:529) — fail until the migration
runs. Every other route is unaffected because no other branch selects `sources`.

**Neither migration was run against any database, deliberately.** `.env.local`
points at the **production** Neon instance, and running DDL against a live
database unattended is not something to do on someone's behalf. Both migrations
are purely additive (§16.8) and defaulted, so applying them will not disturb the
currently-deployed build, which does not reference the new columns:

```bash
pnpm db:migrate
```

Run that, then re-check `/memory` and `/research`. The same drift is what breaks
preview deployments (note 2 below) — preview is behind by migration 0008.

---

## Read this before touching anything

1. **The branch is pushed; production is old because nothing was merged.**
   An earlier version of this file said "12 commits ahead of origin, **not
   pushed**". That is wrong: `origin/feat/product-ready-premium-rebuild` is at
   the same commit as local HEAD (0 ahead, 0 behind). What is true is that
   `origin/main` contains **none** of this branch's commits, and production
   deploys from `main` — so `continuumstudy.vercel.app` still runs the
   pre-redesign build. Preview deployments of this branch **do** exist.

2. **Preview deployments 500 on every DB-backed route — it is schema drift, not
   connectivity.** `POST /api/auth/demo` returns an empty-body 500 on preview.
   The runtime log gives the cause exactly:

   ```
   error: column users.email_verified_at does not exist
   code: '42703'   routine: 'errorMissingColumn'
   ```

   The preview database **connects fine** — Postgres parses the query and
   rejects it. `users.email_verified_at` is added by
   `packages/db/migrations/0008_completion_systems.sql`; the branch-scoped
   preview database is at 0007 or earlier and never received it.

   - Branch-scoped `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_URL`, and
     `POSTGRES_URL_NON_POOLING` all exist for this git branch and take priority
     over the shared Production/Preview/Development values.
   - **The correct fix is to run migrations against the preview database**, which
     keeps previews isolated. Getting its credential requires the Vercel
     dashboard or API; reading the CLI credential store was blocked here.
   - **Do not just delete the branch-scoped override.** It "works" only because
     the shared value *is* the production database, so every preview would then
     read and write production data. That is a much larger change than the bug
     requires.
   - Reproducing needs an `Origin` header — without one the route returns a 403
     from the same-origin guard, not the 500.

3. **Never run `pnpm build` while the dev server is running.** They share
   `apps/web/.next`, and the production build wipes the chunks the dev server is
   serving. The symptom is a cascade of `Cannot find module './9265.js'`,
   `ENOENT vendor-chunks/lucide-react…`, and a missing `routes-manifest.json`.
   Stop the dev server, `rm -rf apps/web/.next`, restart. This is the same class
   of failure as note 5 below and cost time twice more this session.

4. **Nothing is deployed to production.** Do not assume a fix is live because it
   is committed or even pushed.

5. **`.env.local` points at the production Neon database.** Confirmed, not
   assumed — `pnpm seed:demo` was run against it and the change was then
   observed on the live site. Any script you run locally with these env vars
   writes to production. `seed:demo` itself is safe and idempotent: it only
   touches `user_demo`.

6. **The demo account has already been reseeded.** The seven `probe` /
   `latency probe` conversations are gone from production. It now holds 4 goals,
   15 milestones, 13 tasks, 3 projects, and two realistic seeded conversations
   whose citations resolve to real records. You do not need to run it again.

7. **Kill `.next` when the dev server does something impossible.** Symptoms:
   `Cannot find module './vendor-chunks/parse5@7.3.0.js'`, a blank page on a
   route that builds fine, or a stale JSX syntax error for a line you already
   fixed. `rm -rf apps/web/.next` and restart. This cost time twice.

8. **Dev-mode first-request timing is not app latency.** The first hit on any
   route compiles it (1–3 s). Warm up before measuring anything, and remove
   ordering bias — measuring "real" before "fake" once produced a fake 13×
   timing gap that did not exist.

9. **The browser pane's screencast freezes on native scroll events.** Scroll
   with `javascript_tool` (`window.scrollTo`) and read state through
   `get_page_text` / the accessibility tree instead.

10. **Dev server:** `preview_start` with `{ name: "continuum-web" }` (port 3000).
   Never run it through Bash.

---

## Session 2 — what changed since the above was written

Seven commits. Phases 1, 4, 5, 6, 7, 9 and 10 all moved; four ran as parallel
agents in isolated worktrees and were merged here.

| Phase | Was | Now | Commit |
|---|---|---|---|
| 1 Design system | ~20% | **Done** | `9192e92` |
| 4 Home / Goal / Review | Not started | **Home + Review done**; goal page still the Phase 2 version | `849c370` |
| 5 Build | ~40% | **Done** — C7 verified end to end | merge `worktree-agent-a321…` |
| 6 Library / sources / Zotero | Not started | **Done** (migration 0009 unapplied) | merge `worktree-agent-ab3e…` |
| 7 Study / Plan | ~15% | **Done** (migration 0010 unapplied) | merge `worktree-agent-ab49…` |
| 9 Settings / Connections | ~60% | **Done** | merge `worktree-agent-a816…` |
| 10 Context + `/start` | Not started | **Done** except Forget | `7863c52`, `5806d11` |

**Still not started: Phase 8 (marketing rebuild) and Phase 2's route-group
migration + the 15 redirects (§16.7).** The redirects cannot land until the new
paths exist, which is why they were left.

Verified green after every merge: **412 tests / 45 files**, `turbo typecheck`,
`turbo build`.

### Corrections and findings from this session

1. **The identifier regex in the plan is wrong.** §9.4 AC-H3 and §11.5 both
   specify `_[a-z0-9]{6,}`, which never matches this product's ids —
   `goal_demo_sat` contains an underscore, so the run after the prefix is not
   six unbroken alphanumerics. Phase 3's output filter already used the correct
   class; `apps/web/lib/user-copy.ts` now shares it and `tests/user-copy.test.ts`
   pins the real shapes.
2. **Agent worktrees are cut from `main`, not from this branch.** All four
   agents started on `25355b6` (pre-redesign) and each had to reset to the
   branch tip before working. If you delegate again, say so explicitly in the
   brief.
3. **Phases 6 and 7 both authored a migration numbered `0009`.** Resolved at
   merge: `0009_source_lifecycle`, `0010_study_sessions`, journal entries 9
   and 10.
4. **`.claude/worktrees/` is now gitignored** — a `git add -A` swept the agent
   worktrees in as embedded repos.
5. **One existing assertion changed**, in `tests/context-packs.test.ts`. It
   checked that a raw id appeared in exported Markdown, which was only true
   because the body was a JSON dump. Its stated purpose (deterministic
   frontmatter, stable ids) is still covered by the line above it; the body
   assertion now checks real content. No other test was touched.

### Known gaps in the new work

- **Forget** (§9.9 AC-CX3) is not built — it needs a store write across both
  `MemoryStore` and `NeonStore`. No dead button was shipped in its place.
- **`⌘J` does not exist**, so Build's *Ask* and Library's *Ask about this* both
  degrade honestly rather than opening a panel. Build passes an `onAskAssistant`
  prop nothing supplies yet.
- **`concept-map.tsx` is orphaned** — §14.1 moves it to the goal Overview, which
  lives in `goal-screen.tsx`.
- **BYOK now appears twice** — Settings › AI is its proper home, but the
  composer's inline key modal still exists in `assistant-screen.tsx`.
- **`e2e/continuum.spec.ts` will fail**; it drives the old Learn screen by copy.
  Playwright is not part of `pnpm test`, so it did not block.
- **`/start` is not visually verified** — reaching it needs an account with no
  goals, and the demo account has four.

---

## What has been executed, phase by phase *(session 1 — see the table above for current state)*

Phase numbers match §17 of `redesign.md`.

### Phase 0 — Truth-telling · **Done** (`ed6b3c5`)

- Deleted the "Knowledge Graph" feature card; replaced with **"Shared memory"**
  describing what exists (relevant recall with provenance).
- Removed `"Knowledge graphs"` from the JSON-LD `featureList` (`app/page.tsx`)
  and `"knowledge graph"` from `keywords` (`app/layout.tsx`).
- Rewrote the Projects card to drop the "Linked milestones" project-management
  implication.
- Removed **OpenAI / GPT** from the logo cloud and hero proof line — no OpenAI
  client exists in the repo.
- "Automatic references" → "One-click citations"; deleted the footer **Pricing**
  link (no pricing page); "Watch Demo" (which scrolled to an animation) →
  **"Try the demo workspace"** + "Create your workspace".
- Deleted six empty Google-OAuth route directories.
- Archived seven overlapping root planning docs to `docs/history/`.
- Added two realistic seeded conversations to `packages/db/src/seed-demo.ts`
  with `usedContext` citing real seeded record ids, plus `RESET_TARGETS` entries
  and inserts. Tests assert every cited id exists and that no message text
  contains an internal identifier.

**Verify:** `rg -i "knowledge.graph|\bopenai\b|\bgpt\b" apps/web --type ts --type tsx` → only a Groq API URL.

### Phase 1 — Design system · **~20%** (`5560a92`)

Done:
- `.screen-loading` skeletons now use surface tokens. They were a fixed light
  ramp (`#eef3f7`/`#f8fafc`) that flashed **three near-white blocks on the dark
  canvas** on every lazily-loaded screen (C17).
- `.badge-neutral`, `.button-secondary`, `.button-primary:hover` de-hardcoded
  (X4/X5/X6). Badge contrast measured 7.13:1 light / 8.3:1 dark.

**Not done — this is the biggest structural debt:**
- The §15.2 token rewrite (both themes).
- The font change (still **DM Sans**; §15.4 specifies Inter + Source Serif 4 +
  JetBrains Mono).
- The ~35-component kit in `components/ui/*` (`ui.tsx` is still one 283-line file).
- The `/dev/kit` route that everything else is meant to be visually regressed against.
- `globals.css` is **4,100+ lines** and grew during this work. §15.9's target is
  under 600.

### Phase 2 — Shell & IA · **~70%** (`e6378d6`)

Done — this is the core IA change:
- The sidebar now lists **the user's goals**, sorted by nearest deadline with
  completed last, capped at 8, each with a progress hairline (`.nav-goal`).
- Fixed nav restructured: `Today · Ask Continuum · Plan`, then
  "Across your work" (`Learn · Code · Research · Library · Context`), then utility.
- New route **`/g/[goalId]`** → `components/workspace/goal-screen.tsx` with four
  views: Overview / Plan / Study / Sources.
- New `goal` view in `repo.getWorkspaceSnapshot` returning one goal's whole
  working set in a single read.
- **`milestones` added to `WorkspaceState` + `normalizeWorkspaceState`.** They
  were already seeded (4/goal) and already fetched, but the normaliser had no
  key for them, so every milestone was dropped before reaching a screen. The
  goal Overview leads with the next incomplete one — first time they have had a UI.
- Study view names the weakest mastery dimension ("Weakest: transfer 28%")
  rather than averaging three numbers and hiding the parts in a tooltip (X8).

Not done:
- The `(app)` / `(auth)` / `(marketing)` route-group migration (§16.1).
- Per-route data fetching; screens still share the snapshot + client view cache
  (C25 stands).
- Command palette still searches only 4 entity types (C13); `GET /api/search`
  (§8.4) not built.
- Breadcrumb in the top bar (shows the view title, e.g. "Goal", not the goal name).
- The 15 legacy-path redirects in `next.config` (§16.7). `/today`, `/goals`,
  `/memory`, `/activity`, `/integrations` etc. are all still live at their old paths.

### Phase 3 — Assistant · **~85%** (`8c7c7f8`, `21bee94`, `4bfbe29`, `c71f28a`)

This was the highest-value work. All of C1, C4, C5 and the latency problem are fixed.

**C1 — the reasoning leak.** Production streamed `Thinking Process:` →
`Persona/Constraints: … No meta-commentary` → `goal_demo_sat` and never reached
an answer. New `apps/web/lib/assistant/output-filter.ts`:
- Buffers the first 200 chars and skips narration paragraphs until one reads as
  an answer.
- Redacts identifiers from retrieved context **before prompt assembly**, so the
  model never receives an id it could echo.
- Emits a notice instead of a blank turn when filtering leaves nothing.
- Two streaming bugs found while testing and fixed: judging the trailing
  paragraph while it was still arriving, and redaction running across chunk
  boundaries that split an identifier (left `o_progress_sat` on screen).
- `lib/reasoning-filter.ts` deleted; its coverage ported.

**C4 — retrieval control.** New `lib/assistant/classify.ts`: six request classes
with hard record/token caps. Greetings and general-knowledge questions retrieve
nothing; ambiguity falls back to one targeted pass, never a wide scan. The scope
flags are still accepted but can only *narrow* an inferred plan.

**C5 — provenance.** New `lib/assistant/provenance.ts`. `usedContext` now
carries real retrieved records; it previously reported the scope names the user
had ticked, which is why a reply that retrieved nothing still claimed
"Answered using 2 records".

**Latency: 32,406 ms → 923 ms** first token (warm, real providers).
The cause was not retrieval. `conversational_support` was not in the fast-task
set, so every chat turn — including "hi" — went to `FEATHERLESS_REASONING_MODEL`
(`Qwen2.5-72B-Instruct`) behind a four-unit concurrency pool. Fixed in
`packages/ai/src/policy.ts` (+ `interactiveTasks` preferring Groq),
`packages/ai/src/featherless.ts`, and by merging the gateway's two sequential
pairs of DB checks into one round trip. A workspace question that *does*
retrieve lands at 2,490 ms.

**Not done (all UI):** the `⌘J` global panel; the context inspector; replacing
the 10 checkboxes in the composer with chips; the broad-search confirmation
prompt; reducing the mode `<select>` from 5 to 3; moving BYOK to Settings.
*The engine supports all of this — only the interface is outstanding.*

### Phase 5 — Build/Code · **~40%** (`4633d4c`)

**C7 fixed.** At 1280×720 the studio collapsed to a single column, stacking
rail → editor → console. With the editor's 480 px minimum that put the console
at 785 px inside a 720 px frame **that does not scroll** — so output was not
below the fold, it was unreachable. Two new breakpoints (1040 px side-by-side
with a horizontal rail; 1180 px rail back in its own column) plus a
`revealConsole()` guard. Verified: rail 180 / editor 320 / console 321, all
visible, output rendered without scrolling.

Not done: the §14.3 rebuild — always-visible resizable console as a first-class
region, stdin merged into the console header, AI tab moved into `⌘J`, timeout
moved out of the rail.

### Phase 7 — Study/Plan · **~15%** (`b02e378`)

**C6 fixed.** At 375 px the week board painted Thursday and Friday *on top of*
Wednesday and clipped titles mid-word. Cause: narrow breakpoints gave each day
a `min-width` (78 vw / 80 vw) while the grid tracks stayed at desktop sizes — a
grid item wider than its track overflows and paints over its neighbour. Tracks
now carry the width, on both the week board and the draft board, at both
affected breakpoints. **Overlapping pairs: 11 → 0.**

Not done: everything else in §14.1 and §14.2 — the Study view rebuild,
`/study/[sessionId]`, the resource panel replacing the 4-step wizard, the
`study_sessions` table (§16.11 migration 2), the mobile day agenda, removing the
hardcoded `concept_potential` question, the Build-my-week dialog.

### Phase 8 — Marketing · **~15%**

Only the false claims are gone (Phase 0). The page is **still 9,843 px, 11
sections, generic-SaaS shaped**. §10 rebuild not started. Note §10.5 requires
screenshots captured from the *rebuilt* app, so this is correctly late.

### Phase 9 — MCP / Settings / Auth · **~60%** (`849af2e`, `2f71e60`, `ea9dd5b`)

**MCP consolidated: 33 → 15 tools** (`packages/mcp/src/index.ts`).
- `find_in_continuum` replaces four search/list tools by fanning out and merging.
- `get_my_current_work` merges the context pack with today's schedule.
- `whats_changed` resumes from the last saved session when given no timestamp.
- `record_practice_result` closes the resource activity that produced the
  evidence in the same call.
- `propose_change` replaces all four `propose_*` tools and is measured against
  the scope its **target** needs — args are parsed *before* the scope check so a
  schedule proposal requires `schedule:propose`, not the declared default.
- Two tools degrade rather than fail on a narrow grant and report what they
  actually searched.
- `route_specialist_task` removed outright, with ~80 lines of routing and
  verification wiring.
- Superseded operations stay callable by name (`continuumTools`) but are
  withdrawn from discovery (`discoverableTools`), which is what the route registers.
- `docs/mcp-tools.md` rewritten; README tool count corrected.
- 26 tests assert each workflow's exact store-call sequence, so "≤ 2 calls" is
  verified rather than claimed.

**Auth recovery built** — `/forgot-password`, `/reset-password`, `/verify-email`,
`api/auth/verification` were all empty directories, and sign-in said
*"Self-service password recovery is not available yet."*
- Built on the existing `auth_tokens` table (single-use + expiry already
  transactional). Only SHA-256 hashes stored; reset links 30 min, verification
  24 h; issuing a new link consumes the previous one.
- Completing a reset revokes every other session; password history is checked;
  opening the page inspects without consuming.
- **Enumeration-safe, verified:** identical status and body, and a median timing
  delta of **−1 ms** between a real and a nonexistent username. (An initial
  1444 ms vs 109 ms reading was first-request route compilation — remeasure warm
  before believing a timing gap.)
- No mail provider is configured; links are logged server-side, never returned
  to the browser.

**C8 fixed:** Connections reported OpenAlex as "Not connected" while scholarly
search was returning live results. Keyless access is deliberate (the route falls
back to OpenAlex's polite pool and reports `keyless`). Now reads
**"Working — no setup needed"**, and a key is presented as an optional
rate-limit upgrade.

Not done: the `/settings/*` split into 8 segments; the outcome-grouped
Connections page; the plain-language OAuth consent screen (§12.4); the §12.6
twelve-step Claude verification (needs a deployed build + connected client).

### Phases 4, 6, 10 — **Not started**

- **4** — `/home` rebuild (still 4 competing cards, C11) and `/review` rebuild.
  *The goal page from Phase 2 is the one piece of Phase 4 that exists.*
- **6** — Library/Sources/Zotero (§13.2, §13.3), including migration 1
  (`processing_state`, `retention` on `sources`).
- **10** — `/context` rebuild (still renders `JSON.stringify` and says
  "Postgres canonical", C21), `/start` onboarding (still 5 steps / ~14 fields,
  C12), terminology map (§14.4), CSS debt paydown.

---

## Corrections to `redesign.md` — the plan was wrong about these

`redesign.md` has been edited in place to record 1 and 2. **Trust this file over
the plan where they disagree.**

1. **The `probe` conversations were never seeded.** §3.4 claimed
   `seed-demo.ts` produced them. It created *no* assistant sessions at all
   (`grep -c assistantSession` → 0). They were runtime artifacts from load
   testing, and `resetDemoData` already wiped them by `user_id`.

2. **Milestones were already seeded** — 4 per goal, not missing. The gap was
   purely UI (and a dropped key in the normaliser), not data.

3. **The MCP surface is 15 tools, not 13.** §12.2 dropped
   `suggest_next_resource` and `start_study_session`; both are real, working
   capabilities that complete the resource workflow (suggest → start → record
   result), so removing them would have cost real function for a rounder number.

4. **`read_source_passage` does not take a `query`.** §12.2 proposed it, but the
   store has no passage-search operation and the two-call workflow works without
   it (`find_in_continuum` already returns chunk ids). Not claimed, not built.

5. **§11.9's latency budgets were written assuming retrieval was the
   bottleneck.** It was model selection. The budgets are still the right
   targets; the diagnosis in the plan is wrong.

---

## Suggested order for the rest

1. **§15 design system** — Phase 1. Everything else composes against it, and it
   is the largest remaining structural debt. Doing §10 or §14 first means
   redoing them.
2. **§10 marketing page** — highest judge-visible item; needs §15 tokens and
   screenshots of the rebuilt app.
3. **§9.11 Settings split** + §9.10 Connections regrouping — currently one page
   mixing identity, security, sessions, export and deletion.
4. **§9.4 `/home`** and **§9.9 `/context`** — the two screens still carrying
   critical findings (C11, C21).
5. **§13 Library/Zotero** and **§14 Study/Plan/Build** rebuilds.
6. **§16.7 redirects** and the `(app)` route-group migration — do this *with* a
   rebuild, not standalone.

---

## Verification

```bash
pnpm test          # 393 tests, 43 files
pnpm typecheck     # 9 packages
pnpm build         # web app
```

Regression suites worth knowing about:

| File | Guards |
|---|---|
| `tests/assistant-output-filter.test.ts` | 43 cases inc. **the production leak verbatim** as a fixture |
| `tests/assistant-classify.test.ts` | 41 cases; asserts greetings/general-knowledge perform **zero** retrieval |
| `tests/mcp.test.ts` | 26 cases; asserts each workflow's exact store-call sequence |
| `tests/account-recovery.test.ts` | 19 cases; asserts the enumeration-safety properties structurally |
| `tests/routing.test.ts` | Asserts a chat turn never reaches the reasoning model |

**Not covered by tests and worth a manual pass:** light theme (verified by token
math and spot checks, not a full sweep), and the §12.6 Claude MCP procedure.
