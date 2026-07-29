# Continuum redesign — handoff to the next session

**Source of truth for the remaining work:** [`redesign.md`](redesign.md) (2,908 lines, 20 sections).
This file records only *what has already been executed from it*, what was
deliberately deviated from, and what will waste your time if you don't know it.

**Branch:** `feat/product-ready-premium-rebuild`
**State:** 12 commits ahead of `origin`, **not pushed**
**Green:** 393 tests across 43 files · `turbo typecheck` clean · `turbo build` clean
**Scope of change:** 53 files, +6,279 / −472

---

## Read this before touching anything

1. **Nothing is deployed.** All 12 commits are local. `continuumstudy.vercel.app`
   is still running the pre-redesign build. Do not assume a fix is live because
   it is committed.

2. **`.env.local` points at the production Neon database.** Confirmed, not
   assumed — `pnpm seed:demo` was run against it and the change was then
   observed on the live site. Any script you run locally with these env vars
   writes to production. `seed:demo` itself is safe and idempotent: it only
   touches `user_demo`.

3. **The demo account has already been reseeded.** The seven `probe` /
   `latency probe` conversations are gone from production. It now holds 4 goals,
   15 milestones, 13 tasks, 3 projects, and two realistic seeded conversations
   whose citations resolve to real records. You do not need to run it again.

4. **Kill `.next` when the dev server does something impossible.** Symptoms:
   `Cannot find module './vendor-chunks/parse5@7.3.0.js'`, a blank page on a
   route that builds fine, or a stale JSX syntax error for a line you already
   fixed. `rm -rf apps/web/.next` and restart. This cost time twice.

5. **Dev-mode first-request timing is not app latency.** The first hit on any
   route compiles it (1–3 s). Warm up before measuring anything, and remove
   ordering bias — measuring "real" before "fake" once produced a fake 13×
   timing gap that did not exist.

6. **The browser pane's screencast freezes on native scroll events.** Scroll
   with `javascript_tool` (`window.scrollTo`) and read state through
   `get_page_text` / the accessibility tree instead.

7. **Dev server:** `preview_start` with `{ name: "continuum-web" }` (port 3000).
   Never run it through Bash.

---

## What has been executed, phase by phase

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
