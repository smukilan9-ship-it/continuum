# Continuum — 120-Second Launch Film · Master Plan (v4)

**Status: PROPOSED, awaiting approval. Nothing in §5–§11 is built yet.**

v4 rewrites v3.3 against the product as it actually shipped on 2026-07-31. v3.3
was written against a warm-paper/lime brand, a DM Sans typeface, an EE-student
persona, and a feature set that has since changed underneath it. Every one of
those is now wrong. The film's *structure* survives; its palette, typeface, logo,
persona, script and half its proof beats do not.

Superseded: v3.3 (2026-07-29), `PRODUCTION.md` (v2), the v1 docx.

---

## 0. What changed, and why this is a rewrite

Basis: a full read of the codebase, plus a live walkthrough of
`https://continuumstudy.vercel.app` on 2026-07-31.

| # | v3.3 assumed | Actually shipped | Consequence |
|---|---|---|---|
| 1 | Warm paper `#f7f6f0`, lime `#d9ff2f` | Canvas `#f7faf8`, **jade `#0e8a6e`** + **amber `#e08704`**, ink `#0b1f1a` | Every synthetic frame regrades |
| 2 | Logo: lime tile, dark bars | **Jade gradient tile, white bars, amber traced line + node** | `BrandMark.tsx` is wrong in every particular |
| 3 | DM Sans | **Inter** (+ Source Serif 4 for reading surfaces, JetBrains Mono for code) | `fonts.ts` comment is factually false |
| 4 | "Information is abundant. / Learning is fragmented." on the landing page | Landing says **"Every tool holds a piece. None of them holds the thread."** and **"Your work, and an AI that actually knows it."** | Script bookend changes (see decision below) |
| 5 | 2nd-year EE, electric potential, Griffiths | **Mukilan, CBSE Class 12** — SAT 1520→1570 due 3 Oct, SQL/Python–MySQL, OASIS IHC research | Hook strings retheme |
| 6 | Nav: Today/Learn/Code/Memory/Activity | **Home · Ask · Plan · Study · Build · Projects · Library · Context · Review · Settings** | Labels and capture paths change |
| 7 | Integrations-heavy proof beats | Product now has an **explain-back grader, a spaced-repetition queue, a citation inspector, dual-model verification, per-task model routing** | Timeline rebalances toward learning + AI |

**Two decisions taken by the user, 2026-07-31:**
- **Hook retheme → SAT persona.** Layout, timing, apps and animation unchanged;
  strings only. This is what makes the continuity contract (§4.2) work.
- **Problem line → keep both.** The hook still displays *and speaks* "Information
  is abundant. Learning is fragmented." The new thread line becomes the spoken
  opening; the close lands on the product's current hero line.

---

## 1. The judging model this film is built to win

100 points, four equal 25s. v3 optimised for "showcase every feature", which maps
to roughly one of the four. v4 maps each act to a criterion.

| Criterion | Pts | Where the film earns it |
|---|---|---|
| **Educational Impact** | 25 | Act I: the spaced-repetition queue, the transfer delta, and the explain-back grader quoting the learner's own wrong words beside the passage that corrects them |
| **Creative Use of AI/ML** | 25 | Act II: grounded retrieval, the inspector showing *the exact text sent to the model*, the honest "nothing matched" disclosure, dual-model verification |
| **Technical Execution** | 25 | Act III + the code shot: the app on camera, scoped MCP with a "what it can never do" list, propose→approve, 3s of the grounding doc |
| **The Pitch & Demo** | 25 | Hook, turn, close — and that the whole thing is 120.000s, narrated, scored and cut to frame |

**The discipline this imposes:** no shot earns its place by being a feature. It
earns it by moving one of those four numbers. Anything that does neither is cut.

---

## 2. Verified ground truth — what the film may and may not claim

Audited against source. **Do not put a claim on screen or in narration that is
not in this table.**

### REAL and demoable — safe to feature

| Capability | Evidence |
|---|---|
| **Grounded answers with passage-level citations** | 4 concurrent retrieval legs with per-leg deadlines; vector *raced against* lexical; chips persisted on the message, not just streamed |
| **Citation inspector** | `"What this answer used"` → `"The exact text sent to the model:"` + verbatim passage + `Open` / `Don't use this again` |
| **Honest disclosure** | `"Answered from general knowledge — nothing in your workspace matched."` — this line is *how the five grounding bugs were found* |
| **Explain-back grader** | `"Your source says otherwise"` quotes the learner's own claims and prints the passage beneath; score recomputed server-side; a contradiction is a ceiling (0.5), not a deduction |
| **Spaced repetition (SM-2, modified)** | `"Ordered by what keeps slipping, not by what is oldest"` · `"Forgotten 2 times — it comes back sooner each time"`; a lapse halves the interval rather than resetting it |
| **Mastery ≠ reading** | Five dimensions; transfer moves *only* on an unseen check. On screen: `Transfer 34% → 51%` |
| **Dual-model verification** | Two providers, each pinned; *any* evaluator may lower a grade, awarding one needs agreement. UI: `"Two independent model routes agreed with high confidence."` |
| **Per-task model routing** | 15 task classes, 5 routes, mandatory human-readable reason, logged to `model_routes` |
| **Deterministic scheduling** | `schedule_optimization` → `deterministic`, cost class `none`. The router knows when *not* to call a model |
| **OpenAlex** | Live, no key. Verified in-session: 250M+ corpus, real citation counts, citation-graph traversal (References / Cited by / Related), Zotero DOI cross-match |
| **Scoped MCP + OAuth 2.1/PKCE** | 15 tools (9 read, 5 additive-write, 1 propose), 13 scopes with plain-English consent, individually uncheckable |
| **Propose → approve → commit** | Transactional; schedule changes need approve *and* commit. Review renders a real before→after diff |
| **Obsidian two-way Markdown sync** | Real plugin, three-way conflict detection, per-type folder map |
| **Zotero** | Connected on the demo account (`Mukilan_Senthilkumar`); metadata + abstracts indexed |
| **Browser code execution** | Verified live: Python, 11ms, real output |
| **Image → questions** | Gemini vision, normalised bounding boxes, cropped diagram beside the question, answer-key provenance |

### NOT REAL — must be removed from the film

The current label **L14 `"scoped MCP · NotebookLM · Ollama · YouTube"`** contains
two claims the product cannot back and one it explicitly denies.

- **NotebookLM is not an integration.** No Google API call, no OAuth, no upload —
  it is a Markdown download. The product's own UI files it under *"Export
  elsewhere — Not a connection."* Listing it beside scoped MCP is the single
  biggest factual liability in the film.
- **Ollama chat generation does not exist.** `generateLocalOllamaLesson()` has
  zero callers and is hardcoded to one prompt. What exists is a connection
  *tester*. (Server-side Ollama *embeddings* are real — a different claim.)
- **YouTube search has no UI.** The route and key vault work; nothing calls them.
- **Zotero PDFs are not chunked or indexed** — metadata and abstracts only. PDFs
  *uploaded to Continuum* are extracted, chunked and embedded. No cut may imply
  the Zotero PDF was ingested.

→ **L13 becomes `"scoped MCP · Obsidian · OpenAlex · Zotero"`.** All four are
backed by code and all four are visible on camera.

---

## 3. Blockers — fix before any capture

Ordered by how much of the film each damages.

### B1 · Stray mobile nav controls on every screen ⛔ blocks all 13 clips
A **✕** sits beside the sidebar wordmark and a **☰** in the top bar, at every
desktop width, on every screen. `globals.css:281` sets `.mobile-only { display:
none }`; `kit.css:94` sets `.icon-button { display: inline-grid }` at equal
specificity, and kit.css is imported *after* globals.css (`layout.tsx` lines 4
and 7), so the later rule wins.

Verified live at 1920px: both render `display: grid`, `visible: true`, 44px wide.
They read as an unfinished build. **This is in every frame of every clip.**
One-line specificity fix.

### B2 · Deployed MCP server advertises deprecated tool names ⛔ blocks the MCP beat
The live endpoint exposes the 16 `legacyTools` (`load_learning_state`,
`search_memory`, `get_context_pack`, …), all flagged `deprecated: true,
remoteAccessible: false` in the working tree. Independently confirmed: the MCP
server connected to *this session* exposes exactly that legacy set. The current
15-tool surface (`get_study_status`, `find_in_continuum`, `propose_change`, …) is
what should appear on camera. **Redeploy before the Claude take.**

### B3 · Concept map renders unstyled on `/g/[goalId]` ⛔ do not film
`concept-map.tsx` imports no CSS; its classes live in `study/study.css`, which
the goal route never loads. Renders as run-on stacked text. Same failure mode as
the Research fix, not applied here. Fix the import, or never scroll to it — note
it *works* if you client-navigate from `/learn` first, so it will pass rehearsal
and fail the take.

### B4 · Stale marketing screenshots
`public/marketing/light/*.png` were captured 2026-07-30; the mark went purple →
jade on 2026-07-31. Every product frame on the landing page shows the **old
purple logo**. Re-run `node scripts/capture-marketing.mjs` before filming `/`.
Also `study-check.png` is the Goal page with the broken concept map, used under
the copy *"Study that only counts real evidence"* — it does not show that.

### B5 · Verify two recently-broken screens
`/library` (500 on `/api/sources`) and `/research` (unstyled) were both broken
within the last commit cycle and both are flagship. Confirm they render as cards
on the actual recording machine before rolling.

### B6 · Build workspace holds garbled state
The deployed editor currently contains malformed leftover code. Reset to a clean
program carrying one deliberate error before the Build take.

---

## 4. The film — locked creative (v4)

3600 frames · 30fps · 1920×1080 · exactly **120.000s**.

### 4.1 Master timeline

| TC | Frames | Seg | Picture | Criterion |
|---|---|---|---|---|
| 0:00–0:14 | 0–420 | S0 | **Hook** — the desktop floods (synthetic; retheme only) | Pitch |
| 0:14–0:20 | 420–600 | S1 | Home — the turn | Pitch |
| **0:20–0:45** | **600–1350** | **ACT I** | **"It teaches."** | **Educational Impact** |
| 0:20–0:26 | 600–780 | A1a | Study — Due today, spaced repetition | |
| 0:26–0:32 | 780–960 | A1b | Study session — check → `Transfer 34% → 51%` | |
| 0:32–0:40 | 960–1200 | A1c ★ | **Explain it back → "Your source says otherwise"** | |
| 0:40–0:45 | 1200–1350 | A1d | Practice grade → "Two independent model routes agreed" | |
| **0:45–1:12** | **1350–2160** | **ACT II** | **"It knows your work."** | **Creative AI/ML** |
| 0:45–0:53 | 1350–1590 | A2a | Ask — grounded answer, citation chips | |
| 0:53–1:00 | 1590–1800 | A2b ★ | **Inspector — "The exact text sent to the model"** | |
| 1:00–1:04 | 1800–1920 | A2c ★ | **"Answered from general knowledge — nothing matched"** | |
| 1:04–1:12 | 1920–2160 | A2d | Library Discover — OpenAlex live → save VALIS | |
| **1:12–1:44** | **2160–3120** | **ACT III** | **"It stays yours."** | **Technical Execution** |
| 1:12–1:18 | 2160–2340 | A3a | Plan — Build my week (deterministic) | |
| 1:18–1:24 | 2340–2520 | A3b | Build — run → error → Ask | |
| 1:24–1:29 | 2520–2670 | A3c | Obsidian two-way sync | |
| 1:29–1:34 | 2670–2820 | A3d ★ | **Connections — "What it can never do"** | |
| 1:34–1:44 | 2820–3120 | A3e ★ | **Claude MCP proposes → Review → Approve** | |
| 1:44–1:47 | 3120–3210 | S3 | **Source code — `docs/retrieval-chain.md`** (3s hard cap) | Technical |
| 1:47–2:00 | 3210–3600 | S4 | **Close** — dot → mark → lockup | Pitch |

★ = the five shots that carry the film. If anything is cut, cut around them.

### 4.2 The continuity contract

One thread must survive end to end, or the film is a feature list:

> The **arc-length / sector-area swap under time pressure** is hand-fed to Claude
> in the hook (0:04) → caught by the review queue (0:20) → corrected by the
> explain-back grader (0:32) → cited by the Assistant (0:45) → named by Claude
> over MCP, without being told, at 1:34.

This is already true in the seed (`misc_demo_sat_geo`, active, confidence 0.72).
The capture must not break it.

### 4.3 The closing source-code shot (3s, recorded)

The strongest three seconds of code available is **not** application source — it
is `docs/retrieval-chain.md`, the document titled *"How an answer gets grounded"*
recording the five ways grounding silently failed, beside `git log --oneline`
over the five commits that fixed them.

Why: it is the one artifact proving the AI work is engineering rather than a
prompt, and it pays off line 10 ("when it doesn't know, it says so") — that
disclosure is literally what made the bugs findable.

Frame: editor at ~15px JetBrains Mono showing the heading and the ASCII path
diagram, then a 1s hold on the terminal with the five commit titles. **Hard cap
3.0s / 90 frames.** Recorded, not synthetic.

---

## 5. Brand port — synthetic segments regrade

### 5.1 `src/brand.ts` — replace the palette wholesale

Mirror `apps/web/app/globals.css` `:root` exactly. The film is graded next to
real UI footage; drift is visible.

```
canvas        #f7faf8     surface        #ffffff     surfaceRaised #f2f7f5
surfaceSunken #e9f0ed     line           #dfe8e4     lineStrong    #c3d2cd
ink           #0b1f1a     ink2           #415a54     ink3          #64807a
brand         #0e8a6e     brandStrong    #0a6b55     brandHover    #12a081
brandDeep     #07332b     brandSoft      #e4f5ef     brandLine     #b6e3d4
amber         #e08704     amberLift      #f5a623     amberStrong   #b86c02
amberSoft     #fdf1dc     fieldMark      #7fe6c4     onAmber       #2b1a00
inkInverse    #e8f4f0     inkInverse2    #a9c8bf     surfaceInverse #07332b

gradientBrand  linear-gradient(122deg, #0e8a6e 0%, #12a081 46%, #4cc0a0 100%)
gradientField  linear-gradient(155deg, #0a4a3c 0%, #07332b 52%, #052620 100%)
gradientAmber  linear-gradient(122deg, #e08704 0%, #f5a623 100%)
```

**Role discipline, taken from the product:** jade carries *action*, amber carries
*momentum*. A jade element is something you press; an amber element is something
moving. Keeping them separate is what stops the film shouting in one colour.

Delete `accent: #d9ff2f`, `paper`, `forest`, `emerald`, `markInk`, `paperCold`.

### 5.2 `src/BrandMark.tsx` — port the real mark 1:1

Replace with the shipped geometry (`apps/web/components/brand-mark.tsx`,
byte-identical to `app/icon.svg`):

- 64×64, `rx=16`, **diagonal jade gradient bottom-left → top-right**
  (`x1=0 y1=64 → x2=64 y2=0`): `#046b57` 0% → `#05a37c` 52% → `#0abc90` 100%
- **Four white bars**, `rx 4.5`, 9 wide, at varying opacity:
  `(12,32,h23,.55)` `(25,20,h35,.75)` `(38,25,h30,.62)` `(51,12,h34,.90)`
- **Amber `#ffb020` traced line**, 5px, round caps:
  `M16.5 42.5C23 42.5 24.5 35 30 35C35 35 36.5 31 42.5 27.5`
- **Amber node**, `r=4.5` at `(30.5, 35)` — the only warm pixel in the mark

The reveal choreography survives: tile settles → bars rise in sequence →
connector draws → node lands. Only the fills change.

**`Close.tsx`'s measured constants must be re-measured** after the port —
`SWAP_START 58`, `SWAP_END 59` (a 1-frame hard cut, never a crossfade),
`LOCKUP_SHIFT_X 448.5`, `LOCKUP_SHIFT_Y 111.5`. The bar opacities change the
rendered bbox.

### 5.3 `src/fonts.ts` — DM Sans → Inter

The existing comment claims DM Sans is the product typeface. It is not;
`layout.tsx:11` loads **Inter** (400/500/600). Swap to
`@remotion/google-fonts/Inter`.

Add **Source Serif 4** for one purpose only: the quoted passage in the inspector
beat, matching the product's own rule that serif is scoped to reading surfaces.
Add **JetBrains Mono** for the code shot's overlay.

`typography.displayTracking` moves from −2.5 to about −1.6 — Inter is tighter
than DM Sans at display size and the old value will look broken.

### 5.4 Hook restyling

The five looks (`depth` / `grid` / `signal` / `glass` / `ink`) stay, and **Depth
stays the chosen look**. But the cold-collapse target and paper values move onto
the new canvas. The hook currently ends at `#f5f4ee` and hands to a bridge
starting `#f7f6f0`; both become **`#f7faf8`**, and the handoff must be
re-verified by sampling pixel (120,120) across the cut, as before.

---

## 6. Hook retheme — strings only

`src/hook/windows-data.ts` and `src/hook/ui/*`. **No layout, timing, arrival
frame, rotation, z-order or animation changes.** The layout rule holds: no window
may cover the title bar of one that arrived earlier.

| Field | New value |
|---|---|
| `OPENING_QUESTION` | `Can you explain arc length vs sector area? SAT on Oct 3.` |
| `CONTEXT_PASTE` | `Context (again): Class 12, CBSE. SAT on Oct 3. Weak areas: arc length vs sector area, circles in the coordinate plane. Working from my error log + Bluebook mock 4. Please don't make me repeat this.` |
| Preview title | `bluebook_mock4_review.pdf` · `Page 12 of 48` |
| Notion subtitle | `sat_error_log_FINAL_v3` (and `_v2` on the duplicate) |
| Anki subtitle | `SAT · Advanced Geometry` |
| Terminal | `ValueError: sector area formula not defined`, over `practice.py` |
| Safari tab 1 | `SAT Circles & Parabolas in 21 min` |
| `REPEATED_TOPICS` | four SAT-geometry questions, identical in all three chat sidebars |
| Calendar | already `October 2026` — no change |

`CONTEXT_PASTE` remains pasted **identically** into Claude (f120) and Gemini
(f213). That repetition is the hook's whole thesis: the human is the sync layer.

---

## 7. Script (v4) — 16 lines

Charon reads ~120 wpm ≈ 2 words/second. Slots below are budgets; the TTS pass
measures actual takes and `make-vo.mjs` hard-fails anything past 120s.

House register, prepended at generation (unchanged — this is the tone approved on
2026-07-29):

> *In the voice of a premium technology brand film — calm, warm and assured, at
> an easy natural pace. Confident and matter-of-fact. Light rather than heavy,
> never sad, never dramatic, never salesy.*

| # | In → Out | Slot | Segment | Line |
|---|---|---|---|---|
| 1 | 0:00.4 → 0:08.6 | 8.2s | S0 | Every tool holds a piece of your work. None of them holds the thread. So you become the thread. |
| 2 | 0:09.4 → 0:13.4 | 4.0s | S0 type | Information is abundant. Learning is fragmented. |
| 3 | 0:14.3 → 0:19.6 | 5.3s | S1 Home | One workspace. One memory. It opens on your next step — and tells you why. |
| 4 | 0:20.2 → 0:25.8 | 5.6s | A1a | It knows what you're forgetting, and brings it back before you lose it. |
| 5 | 0:26.2 → 0:31.6 | 5.4s | A1b | Reading isn't learning. Mastery only moves when you answer something you haven't seen. |
| 6 | 0:32.2 → 0:39.6 | 7.4s | A1c ★ | So it asks you to explain it back — and when you're wrong, it shows you your own words beside the sentence that corrects them. |
| 7 | 0:40.2 → 0:44.6 | 4.4s | A1d | Two models grade you independently. Neither can talk the other into a pass. |
| 8 | 0:45.2 → 0:52.6 | 7.4s | A2a | Ask anything, and the answer is built from your own material — your sources, your decisions, your results. |
| 9 | 0:53.2 → 0:59.6 | 6.4s | A2b ★ | Not a summary of them. The exact passage it used, one click away. |
| 10 | 1:00.2 → 1:03.8 | 3.6s | A2c ★ | And when it doesn't know, it says so. |
| 11 | 1:04.2 → 1:11.6 | 7.4s | A2d | Two hundred and fifty million papers, live — follow the citations, keep what matters, and it lands beside your Zotero library. |
| 12 | 1:12.2 → 1:17.6 | 5.4s | A3a | Your week is solved, not guessed. No model touches your calendar. |
| 13 | 1:18.2 → 1:23.6 | 5.4s | A3b | Run your code here. When it breaks, the fix already knows what you're building. |
| 14 | 1:24.2 → 1:33.6 | 9.4s | A3c/d | Your notes stay in Obsidian. Your papers stay in Zotero. And you decide, permission by permission, what any assistant can ever touch. |
| 15 | 1:34.2 → 1:43.4 | 9.2s | A3e ★ | Because Continuum speaks MCP, that memory follows you into Claude. It proposes. You approve. Nothing moves until you say so. |
| 16 | 1:47.4 → 1:58.2 | 10.8s | S4 Close | Information is abundant. Learning is fragmented. Continuum is one workspace — and an AI that actually knows your work. |

**Coverage ≈ 89%.** Two silences are deliberate and must survive any edit:
- **1:43.4 → 1:47.4** — the approval click and the code shot land in the clear,
  with the score already stripped to near-nothing. This is the film's single most
  important mix move, now doing double duty.
- **0:08.6 → 0:09.4** — the breath before the problem statement.

**Bookend:** lines 2 and 16 are a deliberate pair. Line 2 lands the words on the
exact frame the hook puts them on screen; line 16 repeats them and resolves into
the product's current hero line. Do not de-duplicate.

**Two things Gemini TTS takes literally** (both learned the hard way, both
guarded in code and documented in `vo-lines.json`):
1. **Never ask for a pause or a beat.** A direction mentioning a pause produced
   six-second silences — one line once returned 32.4s for 14 words. Spacing is
   the timeline's job; `gemini-tts.mjs` caps internal silence at 0.3s regardless.
2. **Never use tempo words like "slowly".** They drop the read to ~74 wpm. Ask
   for the *feeling*; specify the pace as natural.

**Numerals:** line 11 is written out (`Two hundred and fifty million`) because
the TTS reads `250M+` as "two hundred fifty em plus". Verify on the take.

---

## 8. Labels — 14 overlays (was 17)

Bottom-left, **white chip at 92%, jade rule** (was paper/lime). These carry the
mute pass — a judge scrubbing without audio should still get the argument.

| id | TC | Title | Sub |
|---|---|---|---|
| L01 | 0:14.5–0:19.5 | Home | your next action, and the reason |
| L02 | 0:20–0:26 | Review queue | ordered by what keeps slipping |
| L03 | 0:26–0:32 | Mastery | transfer moves only on an unseen check |
| L04 | 0:32–0:40 | Explain it back | graded against your own source |
| L05 | 0:40–0:45 | Verification | two independent model routes |
| L06 | 0:45–0:53 | Grounded answers | built from your material |
| L07 | 0:53–1:00 | Evidence | the exact text sent to the model |
| L08 | 1:00–1:04 | Honesty | it tells you when it doesn't know |
| L09 | 1:04–1:12 | OpenAlex | 250M+ works · citation graph · Zotero |
| L10 | 1:12–1:18 | Plan | solved deterministically, not generated |
| L11 | 1:18–1:24 | Build | run, break, fix — in context |
| L12 | 1:24–1:29 | Obsidian | two-way Markdown, conflicts surfaced |
| L13 | 1:29–1:34 | Permissions | scoped MCP · Obsidian · OpenAlex · Zotero |
| L14 | 1:34–1:44 | Claude Desktop | same memory · you approve every change |

No label over the code shot or the close.

---

## 9. Capture spec — 14 clips (Phase B, with the user)

**Environment:** display 1920×1080 HiDPI; Do Not Disturb; dock hidden; menu bar
auto-hidden; chromeless browser at exactly 1920×1080; `pnpm seed:demo` run first;
demo account signed in; **B1–B6 all fixed and verified.**

**OBS:** 1920×1080 canvas + output, 30fps **CFR**, `.mov`, Apple ProRes 422, no
audio track.

**Method:** one continuous master take per act — the film's argument is
continuity, and cutting between separate recordings reads as stitching — then
per-segment pickups ×2, then a 3s static hold of every screen as safety B-roll.
Every move ~20% slower than natural; cursor travel ≥600ms; 500ms hold after every
state change. Resolve may speed 100–125% per shot, never more.

| File | Slot | Choreography | Watch for |
|---|---|---|---|
| `cap_home.mov` | 180f | Land on `/home`; slow arc across the dark Next card (the jade spotlight tracks the pointer); hold on `Because it is due in 1 day.`; hover `▶ Start` (sheen sweeps, button lifts) | Don't scroll to `This week` — it's one sentence under a heading |
| `cap_study_queue.mov` | 180f | `/learn`; let the four sections rise-in; hold on `3 concepts are due` / `Ordered by what keeps slipping, not by what is oldest` and the amber streak flame (2.4s loop); click the amber `Review` on the SAT row | Amber `Review` vs secondary is the lapse signal — frame both |
| `cap_study_check.mov` | 180f | **Pre-warm the session** — lesson generation is a live model call and can sit for seconds. Start parked on the check phase; choice chip → `Check my answer →` → hold on `✓ Transfer updated` + `Transfer 34% → 51%` + the four dots stepping | If a wait is unavoidable the skeleton reads honestly, but budget for it |
| `cap_explain.mov` | 240f ★ | `Explain it back`, source **hidden**; type a plausible-but-wrong explanation; `Check my explanation` → hold on `⚠ Your source says otherwise` (own words quoted) + the passage + `− Not in your answer` + `✓ You had this` | The single most important shot in the film. Shoot it three times |
| `cap_practice.mov` | 150f | Practice runner; submit the parameter-order answer (seeded wrong); hold on `What was missing` and the shield note `Two independent model routes agreed with high confidence…` | Also visible: `Answer key: Extracted from source` |
| `cap_ask.mov` | 240f | `/ask`; type `Why can't OASIS claim single-cell co-expression?`; status pill reads `Looking through your OASIS project…`; answer streams; chips land | The seed contains the exact answering passage — this will ground |
| `cap_inspector.mov` | 210f ★ | Click the chip `Cross-marker association is not co-expression · decision`; inspector slides in; **hold 2s** on `The exact text sent to the model:` and the blockquote; reveal `Don't use this again` | The chip's `Open` goes to the source, not the passage — don't imply otherwise |
| `cap_honesty.mov` | 120f ★ | New thread; ask a pure general-knowledge question; hold on the grey line `Answered from general knowledge — nothing in your workspace matched.` | Cheap to shoot, disproportionately valuable |
| `cap_discover.mov` | 240f | `/library` → `Discover`; query **`whole slide image registration immunohistochemistry`** → results land (`25 of 4,147`); click **`Virtual alignment of pathology image series…`** (Nature Communications, 2023, 93 citations); right panel fills; `Citation graph` → `Cited by`; `Save ▾` | **Verified in-session.** That query surfaces the real VALIS paper already in the workspace, so the arc closes on itself. Do *not* use `cross-marker spatial association` — it returns echocardiography and gut microbiome |
| `cap_plan.mov` | 180f | `/plan`; `✨ Build my week` → `45 min` → `✨ Generate` (`Drafting your week…`) → grid fills with dashed blocks + the dashed draft bar; drag one block, let it snap; `💾 Save week` | The greyed `School` bands are the fixed commitments — they make the point |
| `cap_build.mov` | 180f | `/build` with a clean program carrying one deliberate error; `⌘↵` → console border goes jade → red error block → `Go to line 4` → `✦ Ask` | Never film the idle console. Fix B6 first |
| `cap_obsidian_perms.mov` | 300f | Obsidian: edit a note in the watched folder → switch to Continuum → it's there. Then `/settings/connections`, slow-scroll the Claude card so `What it can read` → `What it can propose` → **`What it can never do`** pass through frame in sequence | The app switch must be *inside* the take, not a cut. Don't click anything on the settings card |
| `cap_claude_review.mov` | 300f ★ | Claude Desktop, MCP connected, history cleared. Ask about the SAT weakness **without supplying context**; tool-call chips appear; Claude names the arc-length/sector-area swap; it calls `propose_change`; switch to Continuum `/review`; hold on the before→after diff (struck red → green); click **`✓ Approve`** | **B2 must be fixed** or the deprecated tool names appear. Size the window so chips are legible at 1080p |
| `cap_code.mov` | 90f | Editor on `docs/retrieval-chain.md` (heading + ASCII path diagram), then terminal `git log --oneline` over the five grounding commits | Hard cap 3.0s |

**Handles:** every clip ≥ its slot + 2s at both ends.

---

## 10. Score, effects, mix

**Score stays Motion** (100 BPM, Am7–Fmaj7–Cmaj7–G6, sixteenth-note arpeggio over
a moving bass) — chosen 2026-07-29, and it survives the rewrite. The `ARC`
section-gain table in `make-music.mjs` re-times to the new act boundaries:

| TC | Move |
|---|---|
| 0:00 | drone only |
| 0:08 | pulse enters, building with the chaos |
| 0:12.6 | peak density |
| 0:14 | first resolve — pulse drops, mallets enter |
| 0:20 | groove established (Act I) |
| 0:45 | layer added (Act II) |
| 1:12 | warm lift (Act III) |
| 1:29 | begin thinning |
| **1:38–1:47** | **strip to near-silence — the approval click and the code shot land in the clear** |
| 1:48 | small build |
| 1:52 | theme returns and resolves as the node lands |
| 1:54–2:00 | tail out |

**Effects** peak −22 dBFS. The approval click at ~1:41 remains the loudest effect
in the film. One barely-there tick on every V1 cut.

**Mix:** music sidechained −8 under narration (100ms / 400ms), limiter before
loudnorm. Targets **−14 LUFS integrated, −1.0 dBTP, LRA 8–11**.

Conform from the three stems (A1 vo · A2 bgm · A3 sfx), never from `mix.wav` —
Resolve keeps them on separate tracks so each stays adjustable against picture.

---

## 11. Build order

**Phase A — no app required. This is what gets built on approval.**

| # | Task | DoD |
|---|---|---|
| A1 | `brand.ts` palette port | typecheck; pilot ΔE < 1.0 against `globals.css` values |
| A2 | `BrandMark.tsx` 1:1 port | pixel-diff the still against `app/icon.svg` at 320px |
| A3 | `fonts.ts` → Inter (+ serif, mono) | render a still; Inter's single-story `a` visible |
| A4 | `Close.tsx` re-measure lockup constants | programmatic bbox of the jade tile; assert both shifts |
| A5 | Hook string retheme | all nine title bars legible at f260; no layout delta vs current render |
| A6 | Hook cold-collapse → `#f7faf8` | sample pixel (120,120) across the hook→bridge cut; exact match |
| A7 | `timeline.mjs` — new V1, gap-free 0→3600 | `assertV1GapFree()` passes |
| A8 | `labels.json` — 14 labels, jade rule | `assertLabelsSane()` passes |
| A9 | `vo-lines.json` — 16 lines + directions | no pause or tempo words; per-line `maxSilence` |
| A10 | Gemini TTS pass, 10-key rotation | 16/16 `readyForDelivery`; nothing past 120s |
| A11 | `make-music.mjs` ARC re-time | peak/RMS within 1 dB of current |
| A12 | `make-sfx.mjs` cue re-time | approval click lands on the new frame |
| A13 | `make-mix.mjs` | −14.0 LUFS, −1.0 dBTP measured |
| A14 | Re-render Hook / Bridge / Close / 14 labels | `render-all.mjs` ±1 frame on every asset |
| A15 | `make-animatic.mjs` | 3600 frames, 120.000s |
| A16 | `SCRIPT.md` rewrite | matches `vo-lines.json` and `labels.json` exactly |

**Phase A′ — app fixes (small, but they gate capture):** B1 (one-line CSS), B3
(one import), B6 (reset the editor), redeploy for B2, re-capture marketing for B4.

**Phase B — capture** (user + me, on request; §9).
**Phase C — Resolve conform, grade, mix, deliver** (§12 of v3 still applies:
FCPXML primary, Console script secondary, manual TC table as fallback).

---

## 12. Verification

**Machine-checked, every build:**
- `assertV1GapFree()` — V1 tiles [0, 3600) with no gap or overlap
- `assertLabelsSane()` — no label overlaps or runs past the end
- `render-all.mjs` — every asset within ±1 frame of the master timeline
- no `Math.random` anywhere (it breaks reproducibility across render threads)
- `ffprobe` on the animatic: exactly 3600 frames, 120.000s
- `ebur128` on the mix: −14 ±0.5 LUFS, −1.0 dBTP
- pilot colour gates: ΔE < 1.0 for canvas, jade, amber, chip blend
- **new:** every on-screen claim string cross-checked against §2's REAL table

**Needs a human:**
1. A listening pass on tone. I can measure duration, silence and loudness; I
   cannot judge whether it sounds right.
2. The Resolve gamma check (~15 min, checklist in `docs/pilot-report.md`).
3. Watching the animatic once, end to end, before capture is scheduled.

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| Live model calls stall on camera (lesson generation, Ask, grading) | Pre-warm every session; shoot pickups; the skeleton states are honest and usable if a wait is unavoidable |
| MCP beat shows deprecated tool names | B2 — redeploy and verify the 15-tool surface before the Claude take |
| A claim on screen outruns the code | §2 is the allowlist; every label and every line traced back to it |
| Act III runs long (5 beats, 32s) | A3c and A3d share one narration line and one continuous take. If it still overruns, Obsidian loses 2s before Permissions does |
| The film reads as a feature list | Every act opens on a person's problem, not a screen. The continuity contract (§4.2) is the spine |
| The 3s code shot reads as filler | It is the only shot with no UI in it — the cut alone marks it as different. Mono type, dark ground, no label |
