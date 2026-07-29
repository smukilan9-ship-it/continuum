# Voiceover via Gemini TTS in Google AI Studio

Ten lines. Generate each one separately, download as WAV, drop into
`assets/vo/final/`, run one command. The assembler places every take at its
exact timecode — you never touch the timeline.

---

## 1. Setup (once)

Open **[aistudio.google.com](https://aistudio.google.com)** → new prompt → switch
the mode to **Speech / Generate speech** (AI Studio moves this control around;
look for the speaker icon or a "Speech generation" mode in the model dropdown).

| Setting | Value |
|---|---|
| **Model** | `gemini-3.1-flash-tts-preview` — newest, best prosody. Fallbacks that also work on your key: `gemini-2.5-pro-preview-tts`, `gemini-2.5-flash-preview-tts` |
| **Mode** | Single-speaker |
| **Voice** | `Charon` — see the shortlist below |
| **Temperature** | **0.6–0.8**, not the 1.0 default. Lower = more consistent pacing between takes, which matters when ten clips have to sound like one read |
| **Output** | 24 kHz, 16-bit, mono PCM. Download gives you a `.wav` |

I verified all three models are live on your key and generated a clean take —
so if one errors, it's rate limiting, not the model name.

### Voice shortlist

Audition on line 10; it's the one that has to land.

| Voice | Character | Why |
|---|---|---|
| **Charon** ← start here | Informative, grounded, unhurried | Reads as a product film, not an ad. Handles the dry MCP beat without overselling |
| **Algieba** | Smooth, low, warm | Richer. Good if Charon feels too neutral for the close |
| **Sulafat** | Warm, brighter | Friendlier, more "student-facing". Risks sounding upbeat where you want restraint |
| **Iapetus** | Clear, light | Most neutral. Safe, least memorable |

Avoid the bright/breezy voices (Puck, Aoede, Zephyr) — the film's tone is calm
confidence, and perkiness undercuts the problem framing in the first 12 seconds.

---

## 2. Generating

For each line: paste the whole block below into the prompt box, Run, listen,
download, rename. The direction line before the colon is doing real work —
Gemini TTS follows natural-language style instructions, which is the entire
reason to use it over a flat TTS engine.

**Pace target ~135 wpm.** Every line below is sized to fit its slot with about a
second to spare at that pace. If a take comes back too long, see §4.

**One gotcha:** if the model ever *speaks* the direction out loud, put the text
on its own line after the colon and regenerate. It usually gets it right.

---

### Line 01 → `line01.wav` · **0:01.0 – 0:12.0** (11.0s slot, ~9.3s target)

> Read slowly and plainly, with a touch of weariness — someone stating a frustration they stopped being surprised by. Pause after the first sentence:
> Every tool you use sees a sliver of your work. So you spend your best attention re-explaining context that already exists.

### Line 02 → `line02.wav` · **0:14.5 – 0:20.5** (6.0s slot, ~4.4s target)

> Read warmly and calmly, with a settled, resolved tone. Clear beat after each of the first two sentences:
> One workspace. One memory. Continuum already knows your next step.

### Line 03 → `line03.wav` · **0:21.0 – 0:33.0** (12.0s slot, ~10.7s target)

> Read clearly and warmly, with genuine interest. Slight emphasis on "why" and on "adapts":
> It finds the best resource and shows you why. It maps what you know — and when you get something wrong, the path adapts.

### Line 04 → `line04.wav` · **0:39.0 – 0:54.0** (15.0s slot, ~10.2s target)

> Read steadily, letting each clause land. Do not rush the list at the end:
> This is the live scholarly graph. Follow the citations, keep the paper — it lands beside your Zotero library, PDFs indexed and searchable.

### Line 05 → `line05.wav` · **0:59.0 – 1:06.0** (7.0s slot, ~6.2s target) ⚠ tight

> Read warmly and reassuringly, as if removing an objection the listener was about to raise:
> Your notes don't have to move. Continuum meets them in Obsidian — plain markdown.

### Line 06 → `line06.wav` · **1:07.0 – 1:12.0** (5.0s slot, ~4.0s target)

> Read quietly and confidently. Slight emphasis on "relevance":
> Everything becomes memory — retrieved by relevance, not replay.

### Line 07 → `line07.wav` · **1:20.0 – 1:24.5** (4.5s slot, ~3.6s target) ⚠ tight

> Read lightly and briskly. End on a rising, unfinished note — this sentence continues into the next line:
> It connects to what you already use —

### Line 08 → `line08.wav` · **1:25.0 – 1:33.0** (8.0s slot, ~7.1s target) ⚠ tight

> Continue directly from the previous line, then slow down and land the last two sentences as separate, deliberate statements:
> — so the assistant already knows your weak spots and your deadline. It proposes. You approve.

### Line 09 → `line09.wav` · **1:37.0 – 1:46.0** (9.0s slot, ~6.7s target)

> Read calmly and quietly — understated, not triumphant. Clear pause before "Nothing explained twice":
> And because Continuum speaks MCP, that memory follows you into Claude itself. Nothing explained twice.

### Line 10 → `line10.wav` · **1:49.0 – 1:58.0** (9.0s slot, ~6.2s target)

> Read slowly and deliberately, with a full pause after each of the first two sentences. Let the final clause settle:
> Information is abundant. Learning is fragmented. Continuum is one workspace — where knowledge compounds.

---

## 3. Assembling

Drop the downloaded files into `apps/video/assets/vo/final/` named exactly
`line01.wav` … `line10.wav` (mp3 / aiff / m4a also accepted), then:

```bash
cd apps/video && node scripts/make-vo.mjs
```

It prints a per-line table, writes `out/audio/vo.wav` at **exactly 120.000s**,
and records which lines are real takes in `out/audio/vo-manifest.json`.

You can do this incrementally. Any line you haven't delivered falls back to
macOS `say`, so the track is always assemblable and always the right length —
each take you add just upgrades one slot in place. Nothing downstream moves.

---

## 4. When a take runs long

The script distinguishes two cases, because only one of them matters:

- **"over slot" — a warning.** The line runs past its window but into silence.
  Usually fine; check it against picture in Resolve before touching anything.
- **"COLLIDES" — an error, and it exits non-zero.** The line runs into the next
  line's start. This must be fixed.

To fix, in order of preference:

1. **Regenerate** with a brisker direction — prepend *"at a brisk, natural
   pace,"*. Cheapest fix, and takes vary run to run.
2. **Lower the temperature** to ~0.5 and regenerate. Slower drift, tighter timing.
3. **Trim the take's head/tail silence** — Gemini often adds ~0.2s of each:
   ```bash
   ffmpeg -i in.wav -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse" line05.wav
   ```
4. **Only then**, shorten the copy — and edit it in
   `assets/vo/vo-lines.json`, not here. That file is the single source for this
   document, the recording sheet and the assembler; editing the copy anywhere
   else lets them drift apart.

Lines **05, 07 and 08** are the tight ones (~0.9s headroom). Line 07 flows
straight into line 08 as one sentence, so an overrun there is audible in a way
the others aren't — check that pair together.

---

## 5. Levels

Deliver the takes **dry** — no EQ, no compression, no normalisation. Fairlight
does all of it in Phase C, and pre-processed audio only fights the mix:

- VO −16 LUFS short-term, peaks ≤ −6 dBFS
- Music ducked −7 dB under VO (sidechain, 100ms / 400ms)
- Master −14 LUFS integrated, −1.0 dBTP

---

## 6. One honest caveat

Gemini TTS is good — good enough to ship, and it removes a dependency on your
schedule and your room's acoustics. But a human read still has an edge on a
launch film, mostly in the pauses: the beat before *"Nothing explained twice"*
and the three full stops in line 10 are where a person outperforms a model.

If you have twenty quiet minutes, record line 09 and line 10 yourself and let
Gemini carry the other eight. The assembler mixes sources freely — it does not
care where any given line came from, so this costs you nothing to try.
