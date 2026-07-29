# @continuum/video

The 120-second Continuum launch film. Remotion authors everything synthetic,
OBS captures the real product, DaVinci Resolve conforms and delivers.

**[PLAN.md](PLAN.md) is the master document** — creative, timeline, capture
spec, grade, deliverables. This file is the operating manual.

---

## Where things stand

| Phase | What | Status |
|---|---|---|
| **A** | Everything that needs no running app: Hook, Bridge, Close, 17 labels, scratch VO, conform bundle | ✅ built |
| **B** | OBS capture of the app + Claude Desktop (needs seeded data, user + Claude) | ⏳ not started |
| **C** | Resolve conform, grade, mix, deliver | ⏳ needs Phase B |

---

## The film

3600 frames · 30 fps · 1920×1080 · exactly 120.000s

| TC | Seg | Content | Source |
|---|---|---|---|
| 0:00–0:14 | S0 | Hook — "you are the sync layer" | Remotion `Hook` |
| 0:14–0:21 | S1 | Today (iris in) | `cap_today` + `Bridge` |
| 0:21–0:34 | S2a | Learn — resource → map → weakness caught | `cap_learn` |
| 0:34–0:39 | S2b | Plan | `cap_plan` |
| 0:39–0:55 | S2c | Library — one paper: OpenAlex → Zotero → PDF ★ | `cap_library` |
| 0:55–0:59 | S2d | Research | `cap_research` |
| 0:59–1:07 | S2e | Obsidian sync — the note crosses apps ★ | `cap_obsidian` |
| 1:07–1:13 | S2f | Memory | `cap_memory` |
| 1:13–1:20 | S2g | Code | `cap_code` |
| 1:20–1:25 | S2h | Connections + auth | `cap_connections` |
| 1:25–1:34 | S3a | Assistant builds the session ★ | `cap_assistant` |
| 1:34–1:37 | S3b | Review — approve | `cap_review` |
| 1:37–1:47 | S3c | Claude Desktop + MCP ★ | `cap_claude` |
| 1:47–1:49 | S3d | Synchronized | `cap_sync` |
| 1:49–2:00 | S4 | Close — dot → bars → lockup | Remotion `Close` |

★ = differentiator proof beats, 45s total. See PLAN §3.1.

---

## Commands

Run from `apps/video/`.

```bash
pnpm studio --port 3100
```

Preview and scrub any composition. Port 3100 keeps it clear of the Next.js dev
server on 3000.

```bash
pnpm render:all
```

Renders every synthetic asset and **asserts each one is exactly the length the
master timeline expects**, at ±0 frames. A segment that renders one frame short
would silently shift every downstream cut, so this fails loudly instead.

```bash
pnpm render:labels     # the 17 overlays only
pnpm manifest:check    # verify existing output without re-rendering
pnpm cutlist           # regenerate cutlist.json
pnpm conform           # regenerate FCPXML + EDL + manual table
pnpm vo:scratch        # rebuild the scratch narration track
node scripts/pilot.mjs # re-run the pipeline checks
```

Full rebuild from clean:

```bash
pnpm render:all && pnpm cutlist && pnpm conform && pnpm vo:scratch
```

---

## Output

| Path | What |
|---|---|
| `out/segments/` | Hook, Bridge, Close, ProblemLines (ProRes; Bridge carries alpha) |
| `out/overlays/` | `L01`–`L17` feature labels (ProRes 4444, alpha) |
| `out/audio/vo-scratch.wav` | 120.000s scratch narration — **replace before delivery** |
| `out/conform/` | `continuum-120.fcpxml`, `.edl`, `cutlist.md` |
| `out/manifest.json` | Every asset with frames, seconds, pixel format, md5 |
| `out/pilot/` | Pipeline pilot artifacts |
| `cutlist.json` | The machine-readable master timeline |
| `assets/vo/vo-script.txt` | The recording sheet |
| `docs/pilot-report.md` | Pilot results + the user-assisted Resolve checklist |

`out/` is gitignored. Everything in it regenerates from source.

---

## How the pieces fit

`scripts/timeline.mjs` holds the master timeline; `src/labels.json` holds the
labels. Nothing else declares a frame number — the render assertions, the
cutlist, the FCPXML and the Resolve script all read from those two files, so
the edit cannot drift from the plan.

```
src/labels.json ─┬─→ src/labels-data.ts ──→ Label.tsx (calculateMetadata)
                 └─→ scripts/timeline.mjs ─┬─→ render-all.mjs   (duration asserts)
                                           ├─→ build-cutlist.mjs → cutlist.json
                                           └─→ make-fcpxml.mjs  → fcpxml / edl / md
                                                                        ↓
                                                        resolve/build_timeline.py
```

Two constants are measured, not derived, and are commented as such:
`LOCKUP_SHIFT_X/Y` in `Close.tsx` (from a render of the finished end slate) and
the swap frame where `Close`'s pre-phase hands off to `BrandMark`.

---

## Phase B — before you record

Full spec in PLAN §5. The short version:

- `pnpm seed:demo` from the repo root first — empty states read as unfinished
- Display at 1920×1080, light theme, DND on, dock hidden, notifications off
- OBS: 1920×1080, 30fps **CFR**, ProRes 422, no audio
- One continuous take through S1→S3d, then per-segment pickups ×2
- Every move ~20% slower than natural; 500ms hold after each state change
- Deliver to `capture/cap_<name>.mov` with **2s handles either end**

The continuity contract (PLAN §3.0-6) matters more than any single shot: the
weakness caught in Learn at 0:31 must be the one the Assistant cites at 1:28 and
Claude names over MCP at 1:43. Judges believe integrations work when the same
facts survive every app boundary.

## Phase C — Resolve

See [resolve/README.md](resolve/README.md) for the three conform paths and the
project settings that must be right before anything else.

---

## QA gates (PLAN §9)

Check these against the final export, not against intentions.

- [ ] Exactly 120.000s (3600 frames), 1920×1080, 30fps
- [ ] **Mute pass** — sound off, a viewer can name the problem, ≥8 capabilities, and the product
- [ ] **Coverage pass** — all 26 rows of PLAN §3.3 visibly present
- [ ] **Brand pass** — DM Sans throughout, paper-true, real mark geometry, only verbatim product copy
- [ ] Audio at −14 LUFS integrated, true peak −1.0 dBTP
- [ ] VO is the recorded voice, **not** `vo-scratch.wav`
- [ ] Music is the licensed track, **not** the silent placeholder
- [ ] No capture slugs or offline media on the timeline
- [ ] Plays through at 1080p on YouTube with no banding on the paper background
