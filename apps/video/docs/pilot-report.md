# Pipeline pilot report

Generated 2026-07-28T20:01:10.305Z by `scripts/pilot.mjs`.

De-risks Phase C (PLAN §4 T11) before a single frame of Phase B is shot.

## Automated checks

| check | result | detail |
|---|---|---|
| slice length | PASS | 150 frames (expected 150) |
| paper in the Remotion render | PASS | rgb(247,246,240) vs brand #f7f6f0 — ΔE 0.00 |
| paper survives ProRes encode | PASS | rgb(248,246,240) vs source — ΔE 0.36 |
| chip alpha blends exactly as declared | PASS | rgb(238,237,232) vs expected rgb(237,237,231) at 92% — ΔE 0.64 |
| chip lands bottom-left at the specified inset | PASS | left inset 64px (spec 64), chip top y=934 |
| footage outside the chip is untouched | PASS | rgb(253,0,252) vs source rgb(249,4,248) — ΔE 1.85 |
| cutlist totals | PASS | 3600 frames |
| fcpxml is well-formed | PASS | xmllint --noout passed |

**8/8 passed.**

### What these prove

- Remotion renders the brand paper `#f7f6f0` accurately, and a ProRes 422 HQ
  encode at the master settings does not shift it.
- ProRes 4444 label overlays composite with true transparency: the chip lands as
  paper, and the footage outside it is bit-for-bit unchanged. If alpha were being
  flattened, the second check would fail with the whole frame darkened.
- `cutlist.json` totals 3600 frames and the FCPXML parses.

## Artifacts

| file | what it is |
|---|---|
| `out/pilot/hook-slice.mov` | 5s of the Hook at master settings (ProRes 422 HQ) |
| `out/pilot/cap_standin.mov` | Stand-in for an OBS capture, 9s ProRes 422 1080p30 |
| `out/pilot/paper-source.png` | Paper straight from Remotion |
| `out/pilot/paper-roundtrip.png` | The same frame after a ProRes encode |
| `out/pilot/composite-f60.png` | Label L11 composited over the stand-in |

## Still blocked on the user (~15 min in Resolve)

The QuickTime gamma shift cannot be measured without Resolve and a real screen
recording. Run this before capture day:

1. Record ~10s of anything with OBS at the Phase B settings (1080p30 CFR, ProRes 422).
2. New Resolve project, settings per `resolve/README.md` — especially
   **"Use Mac display color profiles for viewers" OFF**.
3. `File → Import → Timeline…` → `out/conform/continuum-120.fcpxml`.
4. Confirm: timeline is **3600 frames**, V2 has **18** clips, A1 and A2 present.
5. Drop `out/pilot/hook-slice.mov` and the OBS clip side by side. Pick the paper
   background on the Hook clip with the colour picker: it should read
   **~247, 246, 240**. If it reads noticeably darker or greener, the display
   profile setting is still on.
6. Export an H.264 at the PLAN §6 upload settings, re-import, and confirm the
   paper has not shifted again.

If step 5 shows a shift that the setting does not fix, add a single Color Space
Transform node (Rec.709 → Rec.709, gamma 2.4 → 2.4, "Use White Point Adaptation"
off) on the capture clips only — never on the Remotion segments.
