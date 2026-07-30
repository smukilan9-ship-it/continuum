# Continuum — 120-Second Launch Film · Final Script

Locked. 3600 frames · 30 fps · 1920×1080 · exactly 120.000s.

Every timecode below is authoritative and machine-enforced: `scripts/timeline.mjs`
holds the picture cuts, `src/labels.json` the overlays, `assets/vo/vo-lines.json`
the narration. The render assertions, the cutlist, the FCPXML and the Resolve
script all read from those three files, so this document and the edit cannot
drift apart.

**Narration is generated** — Gemini TTS, `gemini-3.1-flash-tts-preview`, voice
**Charon**, temperature 0.55. **Score and effects are generated too**
(`make-music.mjs`, `make-sfx.mjs`), so nothing in the film needs a licence.

**Locked choices (2026-07-29).** Score: **Motion** — running sixteenth-note
arpeggio over a moving bass, the most energetic of the five styles. Look:
**Depth** — parallax stack, defocus, motion blur, light sweep, bloom. The four
rejected alternatives for each remain in `make-music.mjs` and
`src/hook/styles.tsx`; switching is one flag and moves no frame numbers.

---

## The spine

| TC | Seg | Picture | Narration | Score |
|---|---|---|---|---|
| 0:00–0:14 | S0 | Hook — the desktop floods | L1, L2 | sparse → building |
| 0:14–0:21 | S1 | Today, iris in | L3 | first resolve |
| 0:21–0:34 | S2a | Learn ★ | L4 | groove |
| 0:34–0:39 | S2b | Plan | — | groove |
| 0:39–0:55 | S2c | Library: one paper's journey ★ | L5 | layer added |
| 0:55–0:59 | S2d | Research | — | sustain |
| 0:59–1:07 | S2e | Obsidian sync ★ | L6 | warm lift |
| 1:07–1:13 | S2f | Memory | L7 | sustain |
| 1:13–1:20 | S2g | Code | — | thinning |
| 1:20–1:25 | S2h | Connections + auth | L8 | thinning |
| 1:25–1:34 | S3a | Assistant proposes ★ | L9 | thinning |
| 1:34–1:37 | S3b | Review — approve | — | **near-silence** |
| 1:37–1:47 | S3c | Claude Desktop + MCP ★ | L10 | **near-silence** |
| 1:47–1:49 | S3d | Synchronized | — | small build |
| 1:49–2:00 | S4 | Close — dot → mark → lockup | L11 | theme resolves |

★ = differentiator proof beats, 45s total.

---

## Narration — 15 lines

House register, prepended to every line at generation:

> *In the voice of a premium technology brand film — calm, warm and assured, at
> an easy natural pace. Confident and matter-of-fact. Light rather than heavy,
> never sad, never dramatic, never salesy.*

| # | In → Out | Slot | Spoken | Segment | Line |
|---|---|---|---|---|---|
| 1 | 0:00.4 → 0:09.4 | 9.0s | 7.5s | S0 Hook | Every tool sees a sliver of your work. So your attention goes to re-explaining what already exists. |
| 2 | 0:09.7 → 0:13.2 | 3.5s | 4.4s | S0 Problem statement | Information is abundant. Learning is fragmented. |
| 3 | 0:14.3 → 0:20.8 | 6.5s | 6.4s | S1 Today | One workspace. One memory. Continuum opens on your next step, and why. |
| 4 | 0:21.0 → 0:33.0 | 12.0s | 11.1s | S2a Learn | It finds the best resource, and shows you why it won. It maps what you know, tests it, and adapts when you get something wrong. Mastery is earned, not assumed. |
| 5 | 0:34.0 → 0:38.8 | 4.8s | 3.4s | S2b Plan | Outcomes become a week of work, with proof. |
| 6 | 0:39.0 → 0:54.0 | 15.0s | 13.0s | S2c Library | This is the live scholarly graph — real papers, real citations. Follow the evidence, keep what matters, and it lands beside your Zotero library, every PDF indexed and searchable. |
| 7 | 0:55.0 → 0:58.8 | 3.8s | 3.0s | S2d Research | Every claim, tied to its source. |
| 8 | 0:59.0 → 1:06.0 | 7.0s | 5.8s | S2e Obsidian | Your notes don't have to move. Continuum meets them in Obsidian — plain markdown. |
| 9 | 1:07.0 → 1:12.0 | 5.0s | 5.1s | S2f Memory | Everything becomes memory — retrieved by relevance, not replay. |
| 10 | 1:13.0 → 1:19.5 | 6.5s | 4.7s | S2g Code | Run it. When it breaks, the fix cites the paper you just saved. |
| 11 | 1:20.0 → 1:24.3 | 4.3s | 2.3s | S2h Connections | It connects to what you already use — |
| 12 | 1:25.0 → 1:33.0 | 8.0s | 6.9s | S3a Assistant | — so the assistant already knows your mastery, your weak spots, your deadline. It proposes. You approve. |
| 13 | 1:37.0 → 1:43.5 | 6.5s | 6.2s | S3c Claude MCP | And because Continuum speaks MCP, that memory follows you into Claude itself. |
| 14 | 1:43.9 → 1:47.0 | 3.1s | 3.2s | S3c payoff | Nothing. Explained. Twice. |
| 15 | 1:49.0 → 1:58.0 | 9.0s | 8.8s | S4 Close | Information is abundant. Learning is fragmented. Continuum is one workspace — where knowledge compounds. |

**Lines 2 and 15 are a deliberate bookend.** Line 2 lands the words on the exact
frame the hook puts them on screen; line 15 repeats them and resolves them. Do
not de-duplicate.

**Line 14 is written as three sentences on purpose.** `Nothing. Explained.
Twice.` — the periods produce the beats, and `maxSilence: 0.5` caps them at a
deliberate half-second. Asking Gemini for a *pause* instead produces
multi-second holes (§ below).

**Narration covers 76% of the runtime.** Two silences are deliberate and must
survive any future edit:

- **1:32–1:37** — the approval click lands in the clear, with the score already
  stripped to near-nothing.
- **1:47–1:49** — after `Twice.`

Everything else was dead air. Plan, Research and Code originally carried no
narration at all, which on a film judges score from is a wasted chance to
explain a feature.

---

## Two things Gemini TTS takes literally

Both learned the hard way; both are now guarded in code and documented in
`vo-lines.json`.

1. **Never ask for a pause or a beat.** A direction mentioning a pause produced
   six-second silences — line 11 once returned 32.4s for 14 words. Spacing is
   the timeline's job. `gemini-tts.mjs` caps internal silence at 0.3s regardless.
2. **Never use tempo words like "slowly".** They drop the read to ~74 wpm. Ask
   for the *feeling*; specify the pace as natural. Charon reads at ~120 wpm, so
   copy is sized against that, not the 135 a human would hit.

---

## On-screen text

The only fully rendered copy in the synthetic segments. Everything else is
chrome or grey runs — the shape of overload, not its text.

| TC | Where | Text |
|---|---|---|
| 0:00–0:02 | ChatGPT | `Can you explain electric potential? Exam on Friday.` |
| 0:04 / 0:07.1 | Claude, then Gemini | `Context (again): 2nd-year EE. Exam Friday. Weak areas: boundary conditions, image charges. Working from Griffiths ch.2 + lecture 4 notes. Please don't make me repeat this.` |
| 0:06.5 | Terminal | `ValueError: boundary conditions unresolved` |
| 0:09.6 / 0:10.4 | Full frame | `Information is abundant.` / `Learning is fragmented.` |
| 1:49–2:00 | End slate | `continuum` · `One Workspace. Infinite Learning.` · `Build knowledge that compounds.` · `github.com/smukilan9-ship-it/continuum` |

The identical context block pasted into two different vendors is the hook's
whole thesis: **the human is the sync layer.** All three chat apps also show the
same four questions in their sidebars.

---

## Feature labels — 17 overlays

Bottom-left, paper chip, lime rule. These carry the mute pass.

| id | TC | Title | Sub |
|---|---|---|---|
| L01 | 0:14.5–0:20 | Today | your next action, decided |
| L02 | 0:21–0:26 | Best Resource | ranked, with reasons |
| L03 | 0:26–0:30 | Concept Map | mastery per branch |
| L04 | 0:30–0:34 | Practice | weaknesses caught, path adapts |
| L05 | 0:34–0:39 | Plan | outcomes, deadlines, proof |
| L06 | 0:39–0:44 | Library | the live scholarly graph |
| L07 | 0:44–0:47.5 | Citation Graph | follow the evidence |
| L08 | 0:47.5–0:51 | Zotero | the same paper, your library |
| L09 | 0:51–0:55 | PDF Ingest | readable → retrievable |
| L10 | 0:55–0:59 | Research | claims tied to sources |
| L11 | 0:59–1:07 | Obsidian Sync | your notes, where they live |
| L12 | 1:07–1:13 | Memory | retrieved by relevance, not replay |
| L13 | 1:13–1:20 | Code | run, break, fix — with sources |
| L14 | 1:20–1:25 | Connections | scoped MCP · NotebookLM · Ollama · YouTube |
| L15 | 1:25–1:34 | Assistant | already briefed |
| L16 | 1:34–1:37 | Review | you approve every change |
| L17 | 1:37–1:47 | Claude Desktop | same memory, everywhere |

---

## Score

**Style: Motion.** 100 BPM · Am7 → Fmaj7 → Cmaj7 → G6, two bars each ·
sixteenth-note arpeggio, moving bass on the beat, sustained pad underneath.
Peak −19 dBFS, RMS −41 dBFS.

| TC | Move |
|---|---|
| 0:00 | drone only, pad barely present |
| 0:08 | pulse enters, pad building with the chaos |
| 0:12.6 | peak density |
| 0:14 | first resolve — pulse drops out, mallets enter |
| 0:21 | groove established |
| 0:39 | layer added for the paper's journey |
| 0:59 | warm lift on the Obsidian reveal |
| 1:20 | begin thinning |
| **1:34–1:47** | **strip to near-silence + pulse — the single most important mix move** |
| 1:48 | small build |
| 1:51.4 | theme returns and resolves as the node lands |
| 1:54–2:00 | tail out |

## Effects

Peak −22 dBFS. Nothing sits over unshot footage except the two beats the plan
names.

| TC | Event |
|---|---|
| 0:00.2–0:02 | typing ticks under the question |
| 0:00 / 2.2 / 3.2 / 4.0 / 5.0 / 5.8 / 6.5 / 7.1 / 7.6 | window arrivals, rising in level |
| 0:04.0 / 0:07.1 | the two context pastes |
| 0:08–0:09.7 | acceleration swell |
| 0:12.6–0:13.8 | collapse whoosh + low body |
| 0:13.8 | the dot landing |
| 0:14.0–0:15.5 | iris opening |
| every V1 cut | one barely-there tick |
| **1:34.6** | **the approval click — the loudest effect in the film** |
| 1:40.3 / 1:41.6 | `load_learning_state ✓` · `recommend_resource ✓` |
| 1:52.2 | the mark resolving |

---

## Mix

Music sidechained −8 under narration (100ms / 400ms). Limiter before loudnorm.

| Target | Measured |
|---|---|
| −14 LUFS integrated | **−14.4** |
| −1.0 dBTP | **−1.0** |
| LRA 8–11 LU | **8.9** |

`out/audio/mix.wav` is a stitched reference for judging the audio before footage
exists. **Conform from the three stems, never from the mix** — Resolve keeps A1
narration, A2 score, A3 effects on separate tracks so each stays adjustable
against picture.

---

## What still needs a human

1. **Phase B captures** — 13 clips, spec in PLAN §5. The continuity contract
   matters more than any single shot: the weakness caught in Learn at 0:31 must
   be the one the Assistant cites at 1:28 and Claude names over MCP at 1:43.
2. **Resolve gamma check** — ~15 min, checklist in `docs/pilot-report.md`.
3. **A listening pass on the narration.** Duration, silence and level are
   measured and on target; tone is not something a script can verify.
