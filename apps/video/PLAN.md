# Continuum — 120-Second Launch Film · Master Implementation Plan (v3)

**Status: PLAN ONLY. Nothing in this document is implemented yet except the items
explicitly marked DONE in §2.**

- Supersedes `Continuum_120_Second_Launch_Film_Plan.docx` (v1) and
  `apps/video/PRODUCTION.md` (v2 creative corrections — its findings are folded in).
- **v3.1 (2026-07-29): timeline rebalanced for judge confidence, not feature
  count.** Differentiator proof beats expanded — Claude MCP 4.5s→10s (+2s sync),
  Assistant 6s→9s, Obsidian sync ~1.5s→a dedicated 8s segment, OpenAlex→Zotero→PDF
  one continuous 16s journey. Paid for by compressing utility shots (Today −3s,
  Learn browsing −3s, Plan −3s, Code −3s, Memory −2s, Connections −3s, Close −2s).
  Runtime (120.000s), the hook→problem→solution arc, and the entire Hook segment
  spec (T2) are unchanged.
- Implementer: a contributor picking this up cold. This document is written to be
  executed without access to the conversation that produced it.
- Hard scope rule for the implementer: **Phase A only.** Build everything that does
  not require the web app to run. Do not start the Next.js dev server, do not touch
  `apps/web`, do not record captures, do not open OBS or Resolve. Those are Phases
  B/C and involve the user.
- Working directory for all Phase A work: `apps/video/`.

---

## 0. What this film must do (judging model)

Judges watch ~120 seconds, mostly once, sometimes muted. The film is the primary
basis for scoring the app. Therefore:

1. **The idea must land in the first 15 seconds** — hook → problem, before any UI.
2. **Confidence beats count.** Every shipped capability still appears (§3.3), but
   screen time buys *proof*, not parade: the four differentiators — Claude MCP,
   the Assistant, Obsidian sync, the OpenAlex→Zotero pipeline — each get a
   visible cause→effect beat a judge cannot dismiss as a mockup. Utility screens
   get exactly as long as legibility demands, no more.
3. **It must work on mute** — labels + on-screen lines carry the full argument;
   VO is reinforcement. This is a QA gate (§9), not a suggestion.
4. **One line must survive in memory** — `One Workspace. Infinite Learning.`
5. **One "whoa" moment** — Claude Desktop answering from Continuum's memory over
   MCP without being briefed (1:37–1:49, twelve full seconds including the
   synchronized return). Everything builds to it.

The arc the user asked to keep — **hook → problem → solution** — is the spine.
The solution section is structured as proof (eight beats, four of them ★
differentiator proofs), then payoff (the moat), then close.

---

## 1. Stack

Per the v1 production doc, with verified status on this machine:

| Tool | Role | Status |
|---|---|---|
| **Build automation** | Creative director + automation: builds all Remotion segments, generates the cutlist, timeline XML, scratch VO, Resolve build script; later drives capture choreography | this plan |
| **Remotion 4.0.500** | Everything synthetic: hook, bridge, close, label overlays, safety typography | ✅ installed in `apps/video`, render verified (ProRes HQ pipeline works end-to-end) |
| **OBS Studio** | One continuous 1080p30 capture of the real app + Claude Desktop (Phase B) | ✅ `/Applications/OBS.app` |
| **DaVinci Resolve (free)** | Conform, pacing, music, grade, Fairlight mix, deliver (Phase C) | ✅ `/Applications/DaVinci Resolve.app` |
| ffmpeg | Probes, scratch-VO assembly, duration assertions | ✅ `/opt/homebrew/bin/ffmpeg` |
| macOS `say` | Scratch VO for edit timing only — replaced by the user's recorded narration | ✅ |
| FCPXML 1.10 / EDL | Machine-generated conform from `cutlist.json` into Resolve | to build (T9) |

Packages already in `apps/video/package.json`: `@remotion/cli, transitions, shapes,
paths, noise, google-fonts, media-utils`. React 19.1.8 matches `apps/web`.

**Resolve free-version caveat the implementer must respect:** external scripting
(`fuscript`, network API) is Studio-only. The automation path that works on free is
(a) FCPXML import — primary, and (b) a Python script run inside Resolve's built-in
Console (Workspace → Console → Py3) — secondary. Both are specified in §6. Never
assume external control of Resolve.

---

## 2. Verified ground truth (do not re-litigate)

Checked against the working tree on `feat/product-ready-premium-rebuild`:

- **Mark** (`apps/web/components/brand-mark.tsx`): lime `#d9ff2f` rounded square
  (r=16 on a 64 viewBox), four dark `#171812` ascending bars at x=12/25/38/51,
  lime connector path `M16.5 42.5C23 42.5 24.5 35 30 35C35 35 36.5 31 42.5 27.5`
  (5px, round caps), node r=4.5 at (30.5, 35). **There is no wave.** The v1 doc's
  "continuous wave" is stale.
- **Wordmark**: lowercase `continuum`, right of the mark.
- **Typeface**: **DM Sans** (`apps/web/app/layout.tsx:2`, `--font-sans`). ⚠️ The
  existing `src/brand.ts` wrongly says Inter — fixing it is T1. Never use Inter.
- **Palette** (`landing.css .landing-shell`): paper `#f7f6f0`, surface `#ffffff`,
  soft `#efede3`, deep `#e3eadf`, ink `#101511`, muted `#616a63`, subtle `#7c847e`,
  forest `#173d2e`, forest-strong `#0f2d22`, emerald `#467a61`, emerald-soft
  `#dcebe2`, accent `#d9ff2f`, border `#dcded8`. Default identity is **light/paper**.
  Dark exists but is not the brand default.
- **Real product copy** (verbatim, never paraphrase on screen):
  - `One Workspace. Infinite Learning.` (hero kicker, footer, metadata title)
  - `Information is abundant.` / `Learning is fragmented.` (problem H2)
  - `Build knowledge that compounds.` (final CTA)
  - `Continuum fights for student outcomes, not screen time.`
  - The v1 doc's long mashup tagline does not exist in the product. Retired.
- **Navigation truth** (`continuum-app.tsx`, `workspace-routes.ts`): Today ·
  Work {Assistant, Plan(`/goals`), Learn, Code, Research} · Sources {Library,
  Memory} · {Review(`/activity`), Connections(`/integrations`), Account & Security}.
- **No "Knowledge Graph" screen exists.** The real surface is the **Concept Map**
  inside Learn (branches: Foundations / Practice / Apply & create / Review & proof).
- **Library is one screen**; `/openalex` and `/zotero` are tab-preselecting aliases
  (`workspace-routes.ts:42`).
- **Connections cards that ship**: Claude (MCP), OpenAlex, Zotero, Obsidian
  (+ Continuum Sync plugin), NotebookLM, Ollama, YouTube Data API.
- **Demo topic in seed/domain defaults**: electric potential / electrostatics
  (`recommendBestResource` defaults). The hook's fictional student matches this so
  captured UI data and the synthetic hook tell one story.
- **DONE already** (verified by render): `src/brand.ts` (needs T1 font fix),
  `src/BrandMark.tsx` (1:1 port with `progress` 0→1 build: tile → bars staggered →
  connector draw → node), `src/LogoReveal.tsx` (180f, becomes raw material for T4
  `Close`), ProRes HQ master config in `remotion.config.ts`, `remotion-studio`
  launch entry (port 3100), `.gitignore` covers `apps/video/out/` and the headless
  shell.
- GitHub URL for the end slate: `github.com/smukilan9-ship-it/continuum`.

---

## 3. The film (locked creative)

### 3.0 Design principles

1. **Paper, not black.** The film lives on `#f7f6f0`. Darkness/cold appears only as
   the *problem* (the hook cools toward gray-blue as chaos builds).
2. **Real UI only.** Remotion never fakes a product screen. Synthetic segments are
   abstractions (windows, typography, the mark) — never imitation app frames.
3. **The visual thesis**: in the hook, *the user is the sync layer* (the same
   context paragraph pasted into tool after tool). Continuum's pitch is that it
   becomes the memory layer instead. The MCP payoff proves it.
4. **Rhyme the ends**: the hook collapses all chaos into a single lime dot; the
   close re-opens that dot, which splits into the four bars of the mark. Chaos,
   compressed, becomes the brand.
5. Motion language: springs with `damping: 200` (site-like restraint), no bounce,
   no motion blur plugins, 12f standard fade, cuts on action.
6. **The continuity contract** — one story object threads the film: the EE-201
   electrostatics exam on Friday. The weakness caught in Learn (boundary
   conditions, 0:31) is the weakness the Assistant cites (1:28), is the focus
   Claude names over MCP (1:43), is the session sitting on Today at the end
   (1:47). The paper kept in Library (0:48) is the source the Code fix cites
   (1:17). Judges believe integrations work when the *same facts* survive every
   boundary crossing — Phase B captures must honor this contract above all else.

### 3.1 Master timeline — 3600 frames @ 30fps, 1920×1080

| TC | Frames | Seg | Content | Source |
|---|---|---|---|---|
| 0:00.0–0:14.0 | 0–420 | S0 | Hook — "you are the sync layer" | Remotion `Hook` |
| 0:14.0–0:21.0 | 420–630 | S1 | Reveal — dot irises open on Today; thesis | OBS `cap_today` + Remotion `Bridge` overlay |
| 0:21.0–0:34.0 | 630–1020 | S2a | Learn — resource → map → weakness caught | OBS `cap_learn` |
| 0:34.0–0:39.0 | 1020–1170 | S2b | Plan | OBS `cap_plan` |
| 0:39.0–0:55.0 | 1170–1650 | S2c | Library — one paper: OpenAlex → Zotero → PDF ★ | OBS `cap_library` |
| 0:55.0–0:59.0 | 1650–1770 | S2d | Research — claims tied to sources | OBS `cap_research` |
| 0:59.0–1:07.0 | 1770–2010 | S2e | Obsidian sync — the note crosses apps ★ | OBS `cap_obsidian` |
| 1:07.0–1:13.0 | 2010–2190 | S2f | Memory | OBS `cap_memory` |
| 1:13.0–1:20.0 | 2190–2400 | S2g | Code | OBS `cap_code` |
| 1:20.0–1:25.0 | 2400–2550 | S2h | Connections (+auth micro-beat) | OBS `cap_connections` |
| 1:25.0–1:34.0 | 2550–2820 | S3a | Assistant builds the session ★ | OBS `cap_assistant` |
| 1:34.0–1:37.0 | 2820–2910 | S3b | Review — approve the proposal | OBS `cap_review` |
| 1:37.0–1:47.0 | 2910–3210 | S3c | Claude Desktop + MCP — the whoa ★ | OBS `cap_claude` |
| 1:47.0–1:49.0 | 3210–3270 | S3d | Back to Continuum — synchronized | OBS `cap_sync` |
| 1:49.0–2:00.0 | 3270–3600 | S4 | Close — dot→bars→mark→lockup→kicker | Remotion `Close` |

★ = differentiator proof beats: 16 + 8 + 9 + 12 = **45 seconds** of the film
(v3 gave them ~31s, much of it shared with other content). Compression came from
Today −3s, Learn −3s, Plan −3s, Code −3s, Memory −2s, Connections −3s, Close −2s;
the Hook is untouched. Every §3.3 row still appears. Total: exactly 120.000s.

### 3.2 Segment specs

#### S0 · `Hook` — Remotion, 420 frames

Fictional student consistent with seed data: 2nd-year EE, electrostatics exam
Friday, weak on boundary conditions.

**v3.2 (2026-07-29): the windows are named real apps, not archetypes.**
Safari, ChatGPT, Claude, Gemini, Preview, Notion, Anki, Terminal, Calendar —
each with its app icon and name in the title bar. Recognition is what makes the
fragmentation argument land: a judge should see *their own* desktop, not an
abstraction of one. The "never a Continuum lookalike" rule (§3.0-2, §8) is
strengthened by this, not weakened.

Two consequences:

- **Claude is deliberately one of the pasted-into windows.** In the hook it is a
  blank slate being hand-fed context at f120; at 1:37 the same app answers from
  Continuum's memory over MCP without being told anything. The hook is what
  makes that payoff mean something — same app, now it already knows.
- **Layout rule: no window may cover the title bar of one that arrived
  earlier.** The title bars now carry the identity, so burying them costs the
  segment its point. Window positions were re-laid out against this constraint
  and duplicates raised 9 → 14 to refill the gaps the spacing opened.

Marks are simple geometric stand-ins in each product's brand colour — drawn for
identification, not traced from logos.

Window design language: white `#ffffff` cards on paper, 12px radius, 1px `#dcded8`
border, soft shadow `0 18px 50px rgba(16,21,17,.10)`, 34px title bars with three
traffic dots, 13–15px DM Sans content. Reference for tone (do not copy code):
the landing's own `FragmentationMerge` in `landing-motion.tsx` — the site already
makes this argument; the film opens with the same metaphor at cinematic scale.

Beat map (frames):

| f | Event |
|---|---|
| 0–18 | Pure paper. One chat window springs in, centered, calm. Title `AI Chat`. Typewriter (~12 chars/s): `Can you explain electric potential? Exam on Friday.` |
| 18–66 | Response begins streaming (gray skeleton lines — never readable fake AI text). Camera starts an imperceptible push: scale 1.00→1.06 across f0–288. |
| 66–240 | The multiplication. Windows arrive on springs, each slightly rotated (−3°…+3°, seeded `random()`): f66 PDF `griffiths_ch2_electrostatics.pdf — Page 3 / 41`; f96 Notes `exam_notes_FINAL_v3` with 4 bullet skeletons; f120 **Chat #2** — a context paragraph pastes in with a **lime highlight sweep**: `Context (again): 2nd-year EE. Exam Friday. Weak areas: boundary conditions, image charges. Working from Griffiths ch.2 + lecture 4 notes. Please don't make me repeat this.`; f150 Browser with **9 tabs** (favicons+labels: YouTube `Electric Potential in 21 min`, StackExchange, Chegg, Quizlet, arXiv, Google Scholar, Reddit, Gmail, Docs); f174 Flashcards `42 / 200 mastered`; f195 Terminal `python practice.py` → red `Traceback (most recent call last)`; f213 **Chat #3** — the SAME lime context block pastes again (this is the thesis — the highlight pulses once); f228 Calendar event `EE-201 EXAM — Fri 9:00 AM`. |
| 240–288 | Acceleration: 8–10 scaled duplicate windows cascade in behind (seeded positions, lower opacity). Color temperature cools: paper lerps `#f7f6f0→#e7e9ec`, shadows deepen, `@remotion/noise` grain ramps 0→0.06. Tiny camera shake (±3px, seeded) ramps in. Audio design note for Resolve: notification pings layering into noise. |
| 288–378 | Freeze. Background windows blur (8px) + desaturate 30%. Typography in ink, DM Sans 600, ~110px, tracking −3, two staggered lines (f288, f312), each 12f fade/16px rise: `Information is abundant.` / `Learning is fragmented.` Hold. |
| 378–414 | Collapse: every window tumbles inward to center with `Easing.in(Easing.quint)`, scale→0, slight rotation; typography exits −20px/12f. All mass lands in a **12px lime dot**. |
| 414–420 | Paper + dot alone. Dot breathes (scale 1→1.15). Handoff. |

Determinism: all randomness via `random('seed-string')` — `Math.random` is
forbidden (breaks render reproducibility across threads).

#### S1 · Reveal — OBS under Remotion `Bridge` overlay, f420–630

`Bridge` (45 frames, rendered with **alpha**, ProRes 4444): the lime dot expands
into a rounded-square iris wipe (the mark's silhouette) that reveals the frame
beneath; a 6f lime edge glow trails the wipe, then the overlay is fully
transparent by f465. In Resolve this sits on V2 over the head of `cap_today`.

`cap_today` (Phase B): Today screen, cursor calm — 7s, one idea only. Beats:
next-action card with its reasoning visible (hold 3s — the point is *the app
already decided*), then at 0:19–0:21 click **Find the best resource**, motivating
the cut into S2a. No scrolling, no tour. Covers checklist items "Dashboard/Today"
and "Resume learning".

#### S2 · The proof block — OBS, f630–2550

Choreography detail for each capture lives in §5 (Phase B). Content contract —
the ★ beats are the film's spine; if capture day runs long, trim anything else
first:

- **S2a Learn (0:21–0:34, 13s).** Ranked Best-Resource with the visible *reason*
  it won (0:21–0:26) → **Concept Map**: branch chips (Foundations / Practice /
  Apply & create / Review & proof) + mastery states, the roadmap glimpsed in the
  transition (0:26–0:30) → a practice question answered **wrong** on camera, the
  weakness caught, the mastery state visibly changing (0:30–0:34). The
  wrong-answer beat is untouchable — it seeds the continuity contract — but
  browsing time is not (v3's blanket "never trim Learn" is retired).
- **S2b Plan (0:34–0:39, 5s).** One glance, one punch-in: goal → deadline → tasks
  against calendar constraints → a completion receipt. Utility shot; legibility
  only, no tour.
- **S2c Library — one paper's journey (0:39–0:55, 16s). ★** The confidence device
  is continuity of a single object, never a montage: OpenAlex search with real
  results, real venues (0:39–0:44) → work detail: abstract, citation count, then a
  one-hop **citation-graph traverse** (0:44–0:47.5) → **Keep** → Zotero tab, where
  the same paper now sits beside the user's own library (0:47.5–0:51) → PDF drop →
  ingest progress → indexed and searchable (0:51–0:55). The paper kept here is the
  source the Code fix cites at 1:17.
- **S2d Research (0:55–0:59, 4s).** A claim with its source attached + one open
  question; single punch-in. The label carries it.
- **S2e Obsidian sync (0:59–1:07, 8s). ★ New dedicated segment** — v3 gave this
  ~1.5s inside a card pan, but it is one of the strongest real integrations
  (`apps/obsidian-plugin` ships in this repo). Beats: Continuum's Obsidian card /
  sync state, trigger visible (0:59–1:00.5) → app switch to the **real Obsidian
  app** (1:00.5–1:01.5) → the synced note opens: session/claim title, frontmatter,
  wikilinks, slow scroll (1:01.5–1:05) → Obsidian's **local graph view**, with
  Continuum's notes sitting inside the user's own graph (1:05–1:07). Direction
  contract: whichever way the shipped sync flows, an artifact created earlier in
  the film must visibly cross the app boundary in one unbroken shot.
- **S2f Memory (1:07–1:13, 6s).** Type a query (1:07–1:09); the receipt generated
  during S2a surfaces by relevance (1:09–1:13); punch-in on its provenance. Label
  carries the differentiator: *retrieved by relevance, not replay*.
- **S2g Code (1:13–1:20, 7s).** Montage beat: run → real traceback (1:13–1:15) →
  ask → source-aware fix that **cites the PDF ingested at 0:53** (1:15–1:18.5) →
  re-run green (1:18.5–1:20). (Callback to the hook's terminal.)
- **S2h Connections (1:20–1:25, 5s).** Grid pan: NotebookLM, Ollama, YouTube,
  OpenAlex, Zotero, Obsidian (1:20–1:22.5) → Claude/MCP card close-up on **scoped
  permissions** (`Read memory · Search sources · Propose changes`, "Writes require
  explicit approval") (1:22.5–1:24) → 1s Account & Security flash — the v1
  "Authentication (brief)" item, framed as security, not a login form (1:24–1:25).
  This card close-up is the setup the finale pays off.

#### S3 · Payoff — OBS, f2550–3270

Four beats, one continuous argument: **propose → approve → prove → sync**. The
music strips to near-silence at 1:34 and stays stripped through 1:47 (§3.6) — the
proof plays almost dry.

- **S3a Assistant (1:25–1:34, 9s). ★** Typed on camera — typing is authenticity:
  `Build me a study session for Friday's electrostatics exam.` (1:25–1:27.5) →
  the reply streams, citing the mastery % and the exact weak concept the judge
  watched get caught at 0:31 — boundary conditions (1:27.5–1:30.5) → the proposal
  card assembles: session blocks with sources attached (1:30.5–1:33) → submitted
  for review (1:33–1:34). The assistant must visibly **propose**, never silently
  mutate — that restraint is what the next beat showcases.
- **S3b Review (1:34–1:37, 3s).** The proposal sits in Review; one click:
  **Approve**. The approval click is the loudest thing in the mix here. This beat
  is what makes the finale trustworthy rather than spooky.
- **S3c Claude Desktop + MCP (1:37–1:47, 10s). ★ The whoa — more than doubled
  from v3's 4.5s.** This beat rhymes with the hook: at f120 the judge watched
  Claude get hand-fed a context paragraph, and it is the same app here.
  Real ⌘-tab app switch, Continuum connector visible in
  Claude's UI (1:37–1:38) → typed live: `What should I focus on tonight?`
  (1:38–1:40) → **tool-call chips fire sequentially, each held long enough to
  read**: `load_learning_state ✓`, `recommend_resource ✓` (1:40–1:42.5) → the
  answer streams, naming the EE-201 exam on Friday, boundary conditions, and the
  just-approved session (1:42.5–1:46) → hold with a slow push-in on the sentence
  citing boundary conditions (1:46–1:47). Zero context pasted — and the judge
  *knows* it, because they watched every one of those facts get created in the
  previous 90 seconds.
- **S3d Sync (1:47–1:49, 2s).** Back in Continuum: Today shows the approved
  session in the schedule. The loop closes (= v1 "Final synchronized dashboard").

#### S4 · `Close` — Remotion, 330 frames (f3270–3600 of film)

| f (comp-local) | Event |
|---|---|
| 0–18 | Paper. The lime dot from the hook descends to center, breathes once. |
| 18–66 | **The rhyme**: the dot splits and extrudes into the four dark bars of the mark (standalone rects at BrandMark geometry, scaled), rising staggered exactly like `BrandMark`'s build. |
| 48–102 | Lime tile scales in beneath (0.96→1.00, 12f fade); standalone bars opacity-swap into the real `BrandMark` (drive `progress` 0.28→1.0 over f48–102); connector draws; node lands f≈96. Music resolves here. |
| 102–168 | Lockup: mark eases to its header position (left), `continuum` wordmark slides in from behind it (reuse `LogoReveal` timing, DM Sans 600, ink). |
| 174–216 | Kicker fades under: `One Workspace. Infinite Learning.` (muted `#616a63`, 40px). |
| 225–330 | Sub-line `Build knowledge that compounds.` (ink, 28px) + `github.com/smukilan9-ship-it/continuum` (subtle, 22px, monospace ok). Hold to end — this is the freeze judges pause on. |

Implementation note: `BrandMark.tsx` already exposes `progress`; the dot→bars
pre-phase is drawn by `Close` itself at matching coordinates, then opacity-swapped
into `BrandMark` — do not add modes to `BrandMark`.

### 3.3 Feature coverage matrix (the "judges see everything" contract)

Every item from the v1 doc's checklist, plus surfaces v1 missed. QA gate: check
each row against the final export.

| # | Capability (v1 wording) | Where | TC | Carried by |
|---|---|---|---|---|
| 1 | Dashboard / Today | S1 | 0:14–0:21 | footage + L01 |
| 2 | Resume learning | S1 | 0:14–0:21 | next-action card |
| 3 | Best Resource | S2a | 0:21–0:26 | footage + L02 |
| 4 | Learn roadmap | S2a | 0:26–0:30 | footage (glimpsed in transition) |
| 5 | Knowledge graph *(ships as Concept Map)* | S2a | 0:26–0:30 | footage + L03 |
| 6 | Concept mastery | S2a | 0:26–0:30 | mastery chips |
| 7 | Practice modes | S2a | 0:30–0:34 | footage + L04 |
| 8 | (added) Plan / goals / receipts | S2b | 0:34–0:39 | footage + L05 |
| 9 | OpenAlex search | S2c | 0:39–0:44 | footage + L06 ★ |
| 10 | Paper summaries *(ships as work detail + abstract)* | S2c | 0:44–0:48 | footage |
| 11 | Citation graph | S2c | 0:44–0:48 | footage + L07 ★ |
| 12 | Source Library | S2c | 0:39–0:55 | the whole journey |
| 13 | Zotero integration | S2c | 0:47–0:51 | footage + L08 ★ |
| 14 | PDF ingestion | S2c | 0:51–0:55 | footage + L09 ★ |
| 15 | Research workflow | S2d | 0:55–0:59 | footage + L10 |
| 16 | Obsidian sync | S2e | 0:59–1:07 | footage + L11 ★ dedicated proof |
| 17 | (added) Memory retrieval | S2f | 1:07–1:13 | footage + L12 |
| 18 | Code workspace | S2g | 1:13–1:20 | footage + L13 |
| 19 | AI debugging | S2g | 1:15–1:20 | footage |
| 20 | (added) NotebookLM · Ollama · YouTube | S2h | 1:20–1:23 | footage + L14 |
| 21 | Authentication (brief) | S2h | 1:24–1:25 | Account & Security flash |
| 22 | AI Assistant | S3a | 1:25–1:34 | footage + L15 ★ |
| 23 | Personalized study session | S3a | 1:27–1:34 | the proposal |
| 24 | (added) Review / approvals | S3b | 1:34–1:37 | footage + L16 |
| 25 | Claude MCP | S2h + S3c | 1:22–1:24 card · 1:37–1:47 proof ★ | L14 + L17 |
| 26 | Final synchronized dashboard | S3d | 1:47–1:49 | footage |

Dropped, deliberately: nothing. (v2 dropped auth; v3 restores it as the Account &
Security micro-beat because the user asked for *all* features.)

### 3.4 Label system (17 overlays, Remotion, alpha)

Geometry: bottom-left, 64px from left, 56px from bottom. A 3px lime rule, then
DM Sans: title 30px/600/ink, sub 20px/400/muted, on a paper chip (`#f7f6f0` at 92%
opacity, 10px radius, 14px padding) so labels survive any footage. In: rule wipes
down 8f, text rises 12px/12f. Out is baked at each label's end: 10f fade. Because
in/out are baked, durations are exact per row — `calculateMetadata` reads them
from `labels-data.ts`.

| id | TC (film) | dur (f) | Title | Sub |
|---|---|---|---|---|
| L01 | 0:14.5–0:20 | 165 | Today | your next action, decided |
| L02 | 0:21–0:26 | 150 | Best Resource | ranked, with reasons |
| L03 | 0:26–0:30 | 120 | Concept Map | mastery per branch |
| L04 | 0:30–0:34 | 120 | Practice | weaknesses caught, path adapts |
| L05 | 0:34–0:39 | 150 | Plan | outcomes, deadlines, proof |
| L06 | 0:39–0:44 | 150 | Library | the live scholarly graph |
| L07 | 0:44–0:47.5 | 105 | Citation Graph | follow the evidence |
| L08 | 0:47.5–0:51 | 105 | Zotero | the same paper, your library |
| L09 | 0:51–0:55 | 120 | PDF Ingest | readable → retrievable |
| L10 | 0:55–0:59 | 120 | Research | claims tied to sources |
| L11 | 0:59–1:07 | 240 | Obsidian Sync | your notes, where they live |
| L12 | 1:07–1:13 | 180 | Memory | retrieved by relevance, not replay |
| L13 | 1:13–1:20 | 210 | Code | run, break, fix — with sources |
| L14 | 1:20–1:25 | 150 | Connections | scoped MCP · NotebookLM · Ollama · YouTube |
| L15 | 1:25–1:34 | 270 | Assistant | already briefed |
| L16 | 1:34–1:37 | 90 | Review | you approve every change |
| L17 | 1:37–1:47 | 300 | Claude Desktop | same memory, everywhere |

### 3.5 Voiceover (record-ready)

~168 words / 120s; roughly a third of the film is intentionally unnarrated — the
approval click and the Claude Desktop proof play nearly dry. The user records it
(per the v1 doc); scratch TTS (T8) exists only to time the edit.

| TC | Line | Words |
|---|---|---|
| 0:01–0:12 | "Every tool you use sees a sliver of your work. So you spend your best attention re-explaining context that already exists." | 21 |
| 0:12–0:14 | *(silence — collapse)* | |
| 0:14.5–0:20 | "One workspace, one memory. Continuum already knows where you are — and decides your next step." | 16 |
| 0:21–0:33 | "It finds the best resource and shows you why. It maps what you know — and when you get something wrong, the path adapts." | 24 |
| 0:34–0:39 | *(silence — let Plan breathe)* | |
| 0:39–0:54 | "This is the live scholarly graph. Follow the citations, keep the paper — it lands beside your Zotero library, PDFs indexed and searchable." | 23 |
| 0:55–0:59 | *(silence — the Research label carries it)* | |
| 0:59–1:06 | "Your notes don't have to move in. Continuum meets them in Obsidian — plain markdown, synced." | 16 |
| 1:07–1:12 | "Everything becomes memory, retrieved by relevance — not by scrolling back." | 11 |
| 1:13–1:19 | *(silence through Code)* | |
| 1:20–1:24 | "It connects to the tools you already use —" | 9 |
| 1:25–1:33 | "— so the assistant is already briefed: your mastery, your weak spots, your deadline. It proposes. You approve." | 18 |
| 1:34–1:37 | *(silence — the approval click is the sound)* | |
| 1:37–1:46 | "And because Continuum speaks MCP, that memory follows you into Claude itself. Nothing explained twice." | 16 |
| 1:49–1:58 | "Information is abundant. Learning is fragmented. Continuum is one workspace — where knowledge compounds." | 14 |

Recording spec: quiet room, 48kHz/24-bit, mouth ~20cm off-axis, 3 full takes +
per-line pickups, peaks ≤ −6dBFS, deliver dry (no EQ/compression — Fairlight does
it). Slate each line with its TC.

### 3.6 Music & sound design brief

- One track, 120s edit, instrumental, minimal pulsing electronic with an organic
  top layer (felt piano / mallets). 100–112 BPM. References for *feel*: Linear
  release films, Arc "Welcome" film, Stripe Sessions openers. No EDM drops, no
  corporate ukulele.
- Hit map: 0:00 sparse pulse → building layers with the chaos; 0:14 first resolve
  (dot lands), groove establishes at 0:21; 0:39 add a layer (the paper's journey);
  0:59 warm lift (the Obsidian reveal); 1:07 sustain; 1:20 begin thinning; 1:34
  **strip to near-silence + pulse and hold it through 1:47** — Review's approval
  click and the entire Claude Desktop proof play almost dry (the most important
  mix move in the film); 1:45 small build; 1:49 theme returns; resolves as the
  node lands (~1:52.2); tail rings out to 2:00.
- Sourcing (user decision, §11): a licensed library track (Artlist/Epidemic if a
  subscription exists) or CC0/royalty-free (Pixabay Music / YouTube Audio
  Library). License must permit the judged upload. Implementer never downloads
  audio autonomously — `assets/audio/bgm.wav` is user-supplied; T9 inserts silence
  of exact length if absent so the conform never blocks.
- SFX: soft UI ticks under hook window arrivals (−26dB), one low whoosh into the
  collapse, one soft bloom at the S1 iris. From any CC0 pack (user-supplied, same
  rule). Diegetic app-audio is not recorded in Phase B.

---

## 4. PHASE A — build now (no app required). Implementer task list.

Conventions: all paths relative to `apps/video/`. After each task: run the listed
DoD checks. Definition of done for the phase: §4.13. Use `pnpm --filter
@continuum/video <script>`. Never `Math.random`. All copy strings come from §3 —
do not improvise on-screen text.

### T1 · Fix brand tokens (font) — `src/brand.ts`
- Replace the Inter stack with DM Sans loaded via `@remotion/google-fonts/DMSans`
  (`loadFont()` — import it in a new `src/fonts.ts` used by every comp so glyphs
  are identical headless vs Studio). `typography.sans` becomes
  `'"DM Sans", system-ui, sans-serif'` with the loaded family first.
- Add the missing tokens used by this plan: `surfaceSoft` chip alpha, hook cool
  target `#e7e9ec`, shadow color `rgba(16,21,17,.10)`.
- DoD: typecheck; render 1 still of existing `LogoReveal` and confirm DM Sans
  (the lowercase `a` is double-story in DM Sans — visually verify).

### T2 · `Hook` composition — `src/Hook.tsx` + `src/hook/`
- Files: `hook/Window.tsx` (title bar, dots, body slots: text / skeleton / tabs /
  terminal / calendar variants), `hook/windows-data.ts` (the §3.2 table as data:
  arrival frame, type, title, position %, rotation, z, content strings),
  `hook/ContextPaste.tsx` (the lime-highlight paste block — reused 2×),
  `hook/Typography.tsx` (the two problem lines).
- 420 frames. Implement the beat map exactly; camera push + shake as a single
  wrapper transform; grain via `@remotion/noise` full-frame overlay (opacity
  ramp 240→288); collapse with `Easing.in(Easing.quint)` per-window with 2f
  seeded stagger.
- DoD: typecheck; stills at f30, f150, f260, f300, f395, f418 audited against the
  beat map; duration exactly 420; re-render f260 twice → identical bytes
  (determinism).

### T3 · `Bridge` overlay — `src/Bridge.tsx`
- 45 frames, **transparent**. Lime dot at center → rounded-square iris expands past
  frame edges (mask reveals transparency beneath), 6f lime edge glow, fully
  transparent by f45. Composition `defaultProps` background must be nothing —
  verify alpha.
- DoD: render with `--codec prores --prores-profile 4444 --pixel-format yuva444p10le`;
  `ffprobe` shows `yuva444p10le`; still at f20 over a magenta test card shows
  transparency.

### T4 · `Close` — `src/Close.tsx` (subsumes `LogoReveal`)
- 330 frames per the §3.2 table. Reuse `BrandMark` (`progress` 0.28→1 over
  f48–102) with the dot→bars pre-phase drawn locally at matching geometry;
  opacity-swap ≤2f so the handoff is invisible. Keep `LogoReveal.tsx` registered
  (it remains useful as a standalone sting) but `Close` is what ships.
- DoD: typecheck; stills at f12, f45, f80, f140, f200, f320 audited; wordmark is
  DM Sans; the four bars land at exactly BrandMark's coordinates before the swap
  (overlay-diff the f60 still against a `BrandMark progress=0.55` still).

### T5 · Label system — `src/Label.tsx`, `src/labels-data.ts`
- Data file = §3.4 table (id, title, sub, durationInFrames). One composition
  `Label` with `calculateMetadata` deriving duration from `labelId` prop.
  Transparent background; geometry/type/anim per §3.4.
- DoD: render L16 and L17 (shortest and longest) with 4444+alpha; ffprobe
  alpha; stills at first/last 10f show baked in/out.

### T6 · `ProblemLines` safety comp — `src/ProblemLines.tsx`
- 150 frames, the two problem lines on paper, no windows (re-usable as a cutaway
  if the hook needs a trim in the edit). Same type spec as the hook typography.
- DoD: still at f75.

### T7 · Register + render pipeline — `src/Root.tsx`, `scripts/render-all.mjs`
- Register: Hook(420), Bridge(45), Close(330), ProblemLines(150), Label(dynamic),
  LogoReveal(180, legacy).
- `render-all.mjs`: renders `out/segments/hook.mov`, `bridge.mov`, `close.mov`,
  `problem-lines.mov` (ProRes HQ; bridge + labels 4444+alpha) and
  `out/overlays/L01…L17.mov` via `--props='{"labelId":"L01"}'`; then writes
  `out/manifest.json` `{file, comp, frames, fps, seconds, md5}` and **asserts**
  each duration against §3.1/§3.4 (hard exit on mismatch, ±0 frames).
- Add package scripts: `render:all`, `render:labels`, `manifest:check`.
- DoD: full run completes; manifest durations all exact; total synthetic runtime
  = 14.0 + 1.5 + 11.0 + label sum.

### T8 · Scratch VO — `scripts/make-scratch-vo.mjs`, `assets/vo/vo-script.txt`
- `vo-script.txt`: §3.5 table verbatim (TC + line), the user's recording sheet.
- Script: per line `say -v Samantha --data-format=LEF32@48000 -o
  assets/vo/scratch/lineNN.wav "<text>"`, then ffmpeg-assemble
  `out/audio/vo-scratch.wav` — each line placed at its §3.5 TC with silence
  padding, total exactly 120.000s. Print per-line overrun warnings if any spoken
  line exceeds its slot (they inform the edit, not fail it).
- DoD: `ffprobe` duration 120.000 ±0.01s; spot-listen lines 1, 5, 11.

### T9 · Cutlist + conform generators — `cutlist.json`, `scripts/make-fcpxml.mjs`
- `cutlist.json` = the machine-readable §3.1 + §3.4 + §3.5 + audio, schema:
  `{fps:30, width:1920, height:1080, events:[{id, track:"V1"|"V2"|"A1"|"A2",
  src, recIn, recOut, srcIn?, note?}]}` — times in frames. V1: hook, 12 capture
  placeholders (`capture/cap_<name>.mov`), close. V2: bridge + L1–L16. A1:
  vo-scratch (later swapped for real VO). A2: `assets/audio/bgm.wav`.
- `make-fcpxml.mjs`: no deps; emits `out/conform/continuum-120.fcpxml`
  (fcpxml 1.10, format `FFVideoFormat1080p30`, frameDuration `1/30s`, one
  `asset` per file — captures may be offline; Resolve relinks) and
  `out/conform/continuum-120.edl` (V1-only CMX3600 fallback).
- If `assets/audio/bgm.wav` missing: generate 120s silence there first (ffmpeg
  `anullsrc`), tagged in manifest as placeholder.
- DoD: XML validates (well-formed; `xmllint --noout`); event count = cutlist;
  every V1 gap-free 0→3600; EDL parses (visual check of record TCs).

### T10 · Resolve console script — `resolve/build_timeline.py` + `resolve/README.md`
- Python 3, uses only the Resolve API objects available in the free Console:
  create/open project `Continuum-120`, set 1920×1080/30 before any media, import
  `out/segments`, `out/overlays`, `capture/`, audio into bins
  (`01_remotion/02_capture/03_overlays/04_audio`), build timeline from
  `cutlist.json` via `mediaPool.AppendToTimeline(clipInfo dicts: mediaPoolItem,
  startFrame, endFrame, trackIndex, recordFrame)`, V2/A tracks included; add
  render-queue presets: ProRes 422 HQ master + H.264 review.
- README: exact run steps (Workspace → Console → Py3 → `exec(open(...).read())`),
  the free-version caveat, and the fallback order: script → FCPXML import →
  manual conform table (auto-generated `out/conform/cutlist.md`).
- DoD: `python3 -m py_compile` passes; dry-run mode (`RESOLVE_DRY=1`) walks
  cutlist and prints the exact clip plan without the API (so it's testable now).

### T11 · Pipeline pilot (no app needed) — proves Phase C before capture day
- Render a 5s slice of `Hook`, screen-record 5s of anything harmless (e.g the
  Remotion Studio window via `screencapture -v` CLI, 1080p) as a stand-in
  "capture", drop both through: fcpxml import → Resolve (user assists, §11) →
  export H.264 → reimport → assert: durations exact, no gamma shift vs source
  stills (compare `#f7f6f0` patch within ΔE<2), label alpha composites cleanly.
- This is the only Phase A task that touches Resolve, and it exists to de-risk
  everything; if the user is unavailable, deliver the bundle + instructions and
  mark the task blocked-on-user.
- DoD: `docs/pilot-report.md` with the two comparison stills and measured values.

### T12 · Docs — `apps/video/README.md`
- One page: the §3.1 table, how to render (`render:all`), where outputs land,
  Phase B/C pointers into this plan, and the §9 QA gates as a checklist.
- DoD: exists, accurate commands.

### 4.13 Phase A definition of done
1. `pnpm --filter @continuum/video typecheck` clean; no `Math.random` anywhere
   (`grep -rn "Math.random" src/ scripts/` → empty).
2. `render:all` green; `out/manifest.json` durations exact to the frame.
3. Alpha verified (ffprobe `yuva444p10le`) for bridge + all labels.
4. Scratch VO 120.000s; conform XML/EDL generated and well-formed.
5. Still audits pass for Hook (6 frames), Close (6 frames), labels (2).
6. Pilot report exists (or explicitly blocked-on-user).
7. Nothing outside `apps/video/` modified; git status shows only `apps/video`
   (+ this plan file).

---

## 5. PHASE B — capture spec (requires the running app; recorded with an operator)

Not for Phase A execution. Recorded after Phase A ships, in one sitting.

**Environment:** display set to 1920×1080 ("looks like", HiDPI); light theme
forced; Do Not Disturb on; dock hidden; menu bar auto-hide; default cursor size;
browser chromeless via `open -na "Google Chrome" --args --app=http://localhost:3000/today`
at exactly 1920×1080; `pnpm seed:demo` run first (empty states read as
unfinished); demo account pre-logged-in; notifications killed. Obsidian
(✅ `/Applications/Obsidian.app`) prepared with a demo vault + the Continuum Sync
plugin connected — rehearse the S2e boundary-crossing shot before rolling;
Claude Desktop signed in with the Continuum MCP connector enabled.

**OBS:** 1920×1080 canvas+output, 30fps **CFR**; Recording format `.mov`, encoder
Apple ProRes 422 (disk ≈16GB per 15 min — fine), no audio tracks; macOS Screen
Recording permission granted beforehand.

**Method:** one continuous master take walking S1→S3d in §3.1 order (the film's
argument is continuity; cutting between separate recordings reads as stitching),
then per-segment pickups ×2, then a 3s static hold of every screen as safety
B-roll. Perform every move ~20% slower than natural; Resolve may speed 100–125%
per shot (never more — it reads as fake). Cursor travels ≥600ms; 500ms hold after
every state change. The choreography may be driven via computer control
(per the v1 stack) with the user supervising; the click-path per segment is the
§3.2 content contract, and the detailed per-second choreography tables are to be
written as `docs/capture-runbook.md` during Phase B prep (blocked on seeded data
shapes — do not write it speculatively in Phase A).

**Claude Desktop segment:** Continuum MCP connected in advance (`/integrations`
card flow); conversation history cleared; the §3.2 S3c prompt typed live; window
sized so the tool-call chips are legible at 1080p.

**File contract (what Phase C expects):** `apps/video/capture/cap_today.mov`,
`cap_learn.mov`, `cap_plan.mov`, `cap_library.mov`, `cap_research.mov`,
`cap_obsidian.mov`, `cap_memory.mov`, `cap_code.mov`, `cap_connections.mov`,
`cap_assistant.mov`, `cap_review.mov`, `cap_claude.mov`, `cap_sync.mov` — each
≥ its §3.1 slot + 2s handles both ends. `cap_obsidian` and `cap_claude` include
real app switches; the switch must be inside the take, not a cut.

---

## 6. PHASE C — Resolve assembly (on this Mac, free version)

**Conform, in fallback order:**
1. **FCPXML** (primary): File → Import Timeline → `out/conform/continuum-120.fcpxml`;
   relink captures; verify 3600-frame timeline, V2 overlays, A1/A2 present.
2. **Console script**: Workspace → Console → Py3 →
   `exec(open("<repo>/apps/video/resolve/build_timeline.py").read())`.
3. **Manual**: follow `out/conform/cutlist.md` (record-TC table) — ~20 min.

**Project settings:** 1920×1080, 30fps, Rec.709 (Scene), "Use Mac display color
profiles" OFF; check one capture clip for the QuickTime gamma shift against a
Phase A still before grading anything (the pilot, T11, already proved this).

**Edit rules:** hard cuts on action; the only dissolves are baked into Remotion
assets; per-shot retime 100–125% allowed on captures to hit the grid; punch-ins
≤115% for legibility (UI text must never soften below ~24px effective); VO leads
picture by 4–8 frames at every section change; swap `vo-scratch.wav` for the
recorded lines one-for-one at the same TCs.

**Grade (subtle — UI must stay honest):** Node 1 contrast S-curve, pivot 0.435,
+3; Node 2 saturation 52→50; Node 3 film grain ~1.5% (finest preset); Node 4
vignette −0.03 barely-there; hook segment only: +0.02 lift cool cast to accent
its cold ramp. No sharpening, no LUTs on UI footage.

**Fairlight:** VO −16 LUFS short-term, peaks ≤ −6dBFS, light compressor 2:1;
music ducked −7dB under VO (auto-ducking sidechain, 100ms/400ms); SFX −26dB;
master: loudness −14 LUFS integrated, true peak −1.0 dBTP (YouTube target).

**Deliver:**
- Master: QuickTime ProRes 422 HQ, 1920×1080/30, `Continuum-120_master.mov`.
- Upload: H.264 MP4, High@4.2, CBR 24Mbps, keyframe 1s, Rec.709, AAC 320k,
  `Continuum-120_upload.mp4`.
- Poster frame: export the S4 lockup-with-kicker still (~f3540) as PNG; user
  decides whether it replaces `apps/web/public/continuum-hackathon-thumbnail.png`.
- QA pass per §9 before calling it done.

---

## 7. `cutlist.json` — authoritative initial contents

Times in frames @30. V1 must be gap-free 0→3600. (T9 generates JSON from exactly
this table; §3.4 gives V2 label rows; §3.5 gives A1 rows.)

| track | src | recIn | recOut |
|---|---|---|---|
| V1 | out/segments/hook.mov | 0 | 420 |
| V1 | capture/cap_today.mov | 420 | 630 |
| V1 | capture/cap_learn.mov | 630 | 1020 |
| V1 | capture/cap_plan.mov | 1020 | 1170 |
| V1 | capture/cap_library.mov | 1170 | 1650 |
| V1 | capture/cap_research.mov | 1650 | 1770 |
| V1 | capture/cap_obsidian.mov | 1770 | 2010 |
| V1 | capture/cap_memory.mov | 2010 | 2190 |
| V1 | capture/cap_code.mov | 2190 | 2400 |
| V1 | capture/cap_connections.mov | 2400 | 2550 |
| V1 | capture/cap_assistant.mov | 2550 | 2820 |
| V1 | capture/cap_review.mov | 2820 | 2910 |
| V1 | capture/cap_claude.mov | 2910 | 3210 |
| V1 | capture/cap_sync.mov | 3210 | 3270 |
| V1 | out/segments/close.mov | 3270 | 3600 |
| V2 | out/segments/bridge.mov | 420 | 465 |
| V2 | out/overlays/L01–L17.mov | per §3.4 | per §3.4 |
| A1 | out/audio/vo-scratch.wav | 0 | 3600 |
| A2 | assets/audio/bgm.wav | 0 | 3600 |

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Font drift (system Inter vs product DM Sans) | T1: bundle via `@remotion/google-fonts/DMSans`; visual double-story-`a` check |
| Free Resolve can't be driven externally | Three-tier conform (§6); console script never assumed to be the only path |
| Alpha overlays flatten | ProRes 4444 + `yuva444p10le`, ffprobe-asserted in T3/T5 DoD |
| QuickTime gamma shift makes paper look gray | T11 pilot measures the `#f7f6f0` patch through the whole pipeline before capture day |
| OBS VFR breaks conform math | CFR forced in OBS settings (§5) |
| Captures run long/short vs grid | 2s handles both ends + 100–125% retime allowance |
| Music licensing on a judged public upload | User-supplied licensed/CC0 track only; silence placeholder keeps pipeline unblocked |
| Seed data looks fake/empty on camera | `pnpm seed:demo` + §5 environment checklist; static B-roll safety holds |
| Hook reads as fake product UI | Hook windows are *named third-party apps* (Safari, ChatGPT, Claude, Gemini, Preview, Notion, Anki, Terminal, Calendar) — impossible to mistake for Continuum |
| Third-party marks in the hook | Simple geometric stand-ins in brand colours, drawn not traced; names do the identifying. Nominative use in a before/after hook, the standard convention for launch films |
| Obsidian sync direction differs from the shot spec | §3.2 S2e direction contract: show the artifact crossing the app boundary whichever way the shipped sync flows; rehearse before rolling (§5) |
| MCP proof reads as staged | Tool-call chips held legibly on screen, history visibly empty, and the continuity contract (§3.0-6): every fact Claude cites was created on camera earlier in the film |
| 3.4s/feature illegibility (v1's core flaw) | Six-surface structure, 16 labels, mute-pass QA gate |

---

## 9. Definition of done — the film itself

1. Exactly 120.000s (3600 frames) at 1920×1080/30.
2. **Mute pass**: a viewer with sound off can name the problem, ≥8 capabilities,
   and the product name. (Labels + typography carry it.)
3. **Coverage pass**: all 26 rows of §3.3 visibly present in the final export.
4. **Brand pass**: DM Sans everywhere synthetic; palette-true paper; the real
   mark geometry; only verbatim product copy on screen.
5. Audio: −14 LUFS / −1 dBTP; VO is the user's recorded voice, not scratch.
6. No placeholder media (silence BGM, scratch VO, capture slugs) in the final
   timeline.
7. Uploaded file plays start-to-finish on YouTube at 1080p without visible
   banding on the paper background (add 0.5% grain if banding appears).

---

## 10. Implementation order & effort (Phase A)

| Order | Task | Est. |
|---|---|---|
| 1 | T1 fonts/brand | 0.5h |
| 2 | T2 Hook (the big one) | 4–6h with still audits |
| 3 | T4 Close | 2–3h |
| 4 | T5 Labels | 1.5h |
| 5 | T3 Bridge | 1h |
| 6 | T6 ProblemLines | 0.5h |
| 7 | T7 render-all + manifest | 1h |
| 8 | T8 scratch VO | 1h |
| 9 | T9 cutlist + fcpxml/edl | 2h |
| 10 | T10 Resolve script | 1.5h |
| 11 | T11 pilot (user-assisted) | 1h |
| 12 | T12 docs | 0.5h |

Suggested checkpoint after T2: render the hook, show stills to the user before
polishing further — it's the segment with the most taste risk.

---

## 11. User decisions & actions (not the implementer's)

1. **Music**: pick/supply `assets/audio/bgm.wav` (licensed for the judged upload).
2. **VO**: record §3.5 to `assets/vo/final/` (spec in §3.5).
3. **End slate line**: confirm the GitHub URL (and whether a hackathon name/date
   line should appear under it).
4. **Pilot session** (T11): ~15 min driving Resolve.
5. **Capture day** (Phase B): ~1–2h with seeded data; operator choreographs.
6. Approve replacing the public thumbnail with the new poster frame, if desired.
