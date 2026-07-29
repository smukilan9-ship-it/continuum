# Conforming Continuum-120 in DaVinci Resolve

Three ways in, in the order you should try them. Three exist because the **free
version of Resolve cannot be driven from outside the app** — `fuscript` and the
network API are Studio-only — and a conform with a single path is a conform that
fails the night before the deadline.

Before any of them, generate the conform files:

```bash
cd apps/video && node scripts/build-cutlist.mjs && node scripts/make-fcpxml.mjs
```

---

## Project settings (do this first, every time)

Resolve conforms a new timeline to the first clip it sees unless you set the
format up front.

- Timeline resolution **1920 × 1080**, frame rate **30**, playback frame rate **30**
- Colour science **DaVinci YRGB Color Managed**, output **Rec.709 Gamma 2.4**
- Preferences → General → **"Use Mac display color profiles for viewers" OFF**

That last one is not optional. With it on, the viewer applies the display
profile on top of the timeline transform and the paper background reads grey —
you will grade against a lie.

---

## Path 1 — FCPXML (primary)

`File → Import → Timeline…` → `out/conform/continuum-120.fcpxml`

Builds the whole thing: 15 picture clips on V1, the iris plus 17 labels on V2,
scratch VO on A1, music on A2. Captures that have not been shot yet import
offline; right-click → *Relink Media* after Phase B.

**Verify after import:** timeline is exactly **3600 frames**, V2 has 18 clips,
A1 and A2 are both present.

## Path 2 — console script

`Workspace → Console → Py3`, then:

```python
exec(open("/Users/mukilan/Desktop/promotheus/apps/video/resolve/build_timeline.py").read())
```

Creates the project, sets the format, imports into four bins
(`01_remotion`, `02_capture`, `03_overlays`, `04_audio`), lays every clip from
`cutlist.json`, and queues both deliverables from PLAN §6.

Clips whose source is not on disk are skipped and listed by name, so a
pre-capture run still gives you the full synthetic spine.

See exactly what it will do, without Resolve, from anywhere:

```bash
RESOLVE_DRY=1 python3 resolve/build_timeline.py
```

## Path 3 — manual

`out/conform/cutlist.md` is a record-timecode table for every clip on every
track. Roughly 20 minutes by hand. Also the reference for checking that
whichever automated path you used actually landed things where it claims.

There is also `out/conform/continuum-120.edl` (CMX3600), but it carries **V1
only** — no overlays, no audio. It is a last resort for picture conform.

---

## Handles

Captures are shot with 2-second handles either end (PLAN §5), so every capture
clip trims in at source frame 60. That is already baked into the cutlist — do
not trim again. The handles are there so a shot that runs slightly long or
short can be retimed 100–125% onto the grid without running out of material.
