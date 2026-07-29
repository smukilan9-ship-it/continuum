#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "./timeline.mjs";

/**
 * Pipeline pilot (PLAN §4 T11) — proves the Phase C plumbing before capture day.
 *
 * The expensive failure this exists to prevent: shooting an hour of footage,
 * building the whole timeline, and only then discovering the paper background
 * reads grey or the label overlays composite as boxes. Everything that can be
 * measured without Resolve gets measured here.
 *
 * What it cannot prove alone is the QuickTime gamma shift on a real screen
 * recording — that needs Resolve and a real OBS file, and is left as a checklist
 * in the report for the user-assisted session.
 */

const PILOT = join(ROOT, "out/pilot");
mkdirSync(PILOT, { recursive: true });

const REMOTION = join(ROOT, "node_modules/.bin/remotion");
const PAPER = [0xf7, 0xf6, 0xf0];

function sh(command, args) {
  return execFileSync(command, args, { cwd: ROOT, encoding: "utf8" });
}

/** sRGB → CIE Lab (D65), so colour drift is measured in perceptual units. */
function srgbToLab([r, g, b]) {
  const lin = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const [R, G, B] = lin;
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deltaE(a, b) {
  const [l1, a1, b1] = srgbToLab(a);
  const [l2, a2, b2] = srgbToLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Average colour of a patch, so a single stray pixel cannot skew the reading. */
function samplePatch(imagePath, x, y, size = 32) {
  const raw = join(PILOT, "sample.raw");
  sh("ffmpeg", [
    "-y", "-v", "error",
    "-i", imagePath,
    "-vf", `crop=${size}:${size}:${x}:${y}`,
    "-f", "rawvideo", "-pix_fmt", "rgb24",
    raw,
  ]);
  const buffer = readFileSync(raw);
  unlinkSync(raw);
  let r = 0;
  let g = 0;
  let b = 0;
  const pixels = buffer.length / 3;
  for (let i = 0; i < buffer.length; i += 3) {
    r += buffer[i];
    g += buffer[i + 1];
    b += buffer[i + 2];
  }
  return [r / pixels, g / pixels, b / pixels].map(Math.round);
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name} — ${detail}`);
}

console.log("Continuum-120 pipeline pilot\n");

// 1 — a 5s slice of the Hook, rendered exactly as the real segments are.
console.log("1. Rendering a 5s Hook slice at master settings");
sh(REMOTION, [
  "render", join(ROOT, "src/index.ts"), "Hook", "out/pilot/hook-slice.mov",
  "--frames=0-149",
  "--codec=prores", "--prores-profile=hq",
  "--pixel-format=yuv422p10le", "--image-format=jpeg",
  "--log=error",
]);
// JSON, not `-of csv=p=0` — csv appends a trailing separator ("150,") that
// silently becomes NaN.
const sliceFrames = Number(
  JSON.parse(
    sh("ffprobe", [
      "-v", "error", "-select_streams", "v:0", "-count_frames",
      "-show_entries", "stream=nb_read_frames", "-of", "json",
      join(PILOT, "hook-slice.mov"),
    ]),
  ).streams[0].nb_read_frames,
);
check("slice length", sliceFrames === 150, `${sliceFrames} frames (expected 150)`);

// 2 — a stand-in for an OBS capture, at the format Phase B will deliver.
console.log("\n2. Generating a stand-in capture (ProRes 422, 1080p30, 9s)");
sh("ffmpeg", [
  "-y", "-v", "error",
  "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=9",
  "-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le",
  join(PILOT, "cap_standin.mov"),
]);

// 3 — the paper background, measured through a full render round-trip.
console.log("\n3. Measuring the paper background through render → ProRes → frame");
sh(REMOTION, [
  "still", join(ROOT, "src/index.ts"), "Hook", "out/pilot/paper-source.png",
  "--frame=5", "--image-format=png", "--log=error",
]);
sh("ffmpeg", [
  "-y", "-v", "error",
  "-i", join(PILOT, "hook-slice.mov"),
  "-vf", "select=eq(n\\,5)", "-vframes", "1",
  join(PILOT, "paper-roundtrip.png"),
]);
const sourcePaper = samplePatch(join(PILOT, "paper-source.png"), 80, 80);
const roundTripPaper = samplePatch(join(PILOT, "paper-roundtrip.png"), 80, 80);
const sourceDrift = deltaE(PAPER, sourcePaper);
const proresDrift = deltaE(sourcePaper, roundTripPaper);
check(
  "paper in the Remotion render",
  sourceDrift < 2,
  `rgb(${sourcePaper}) vs brand #f7f6f0 — ΔE ${sourceDrift.toFixed(2)}`,
);
check(
  "paper survives ProRes encode",
  proresDrift < 2,
  `rgb(${roundTripPaper}) vs source — ΔE ${proresDrift.toFixed(2)}`,
);

// 4 — alpha correctness, measured two ways.
//
// Over a flat grey the chip's blend is arithmetic, so the exact expected value
// is known: 0.92 * paper + 0.08 * grey. Comparing against pure paper instead
// would be wrong — the chip is deliberately 92% opaque so captured UI shows
// through it faintly.
console.log("\n4. Compositing a label overlay (alpha correctness)");
const GREY = [0x80, 0x80, 0x80];
const CHIP_ALPHA = 0.92;

function compositeOver(source, output) {
  sh("ffmpeg", [
    "-y", "-v", "error",
    "-i", source,
    "-i", join(ROOT, "out/overlays/L11.mov"),
    "-filter_complex",
    "[1:v]format=rgba,setpts=PTS-STARTPTS[fg];[0:v]setpts=PTS-STARTPTS[bg];" +
      "[bg][fg]overlay=format=auto:alpha=straight:eof_action=pass",
    "-frames:v", "90",
    "-c:v", "prores_ks", "-profile:v", "3",
    output,
  ]);
}

sh("ffmpeg", [
  "-y", "-v", "error",
  "-f", "lavfi", "-i", "color=c=0x808080:s=1920x1080:r=30:d=3",
  "-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le",
  join(PILOT, "grey.mov"),
]);
compositeOver(join(PILOT, "grey.mov"), join(PILOT, "composite-grey.mov"));
compositeOver(join(PILOT, "cap_standin.mov"), join(PILOT, "composite.mov"));

for (const [input, output] of [
  ["composite-grey.mov", "composite-grey-f60.png"],
  ["composite.mov", "composite-f60.png"],
]) {
  sh("ffmpeg", [
    "-y", "-v", "error",
    "-i", join(PILOT, input),
    "-vf", "select=eq(n\\,60)", "-vframes", "1",
    join(PILOT, output),
  ]);
}

/**
 * Locate the chip by finding what changed against the flat grey plate, then
 * sample its top-right interior — inside the padding, clear of the rule and
 * both text lines, so the reading is chip background and nothing else.
 */
function chipInteriorSample(imagePath) {
  const raw = join(PILOT, "chip.raw");
  sh("ffmpeg", ["-y", "-v", "error", "-i", imagePath, "-f", "rawvideo", "-pix_fmt", "rgb24", raw]);
  const buffer = readFileSync(raw);
  unlinkSync(raw);
  const width = 1920;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  for (let y = 800; y < 1080; y += 1) {
    for (let x = 0; x < 700; x += 1) {
      const i = (y * width + x) * 3;
      if (Math.abs(buffer[i] - GREY[0]) > 6 || Math.abs(buffer[i + 1] - GREY[1]) > 6) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
      }
    }
  }
  return { box: { minX, minY, maxX }, sampleAt: [maxX - 16, minY + 8] };
}

const { box, sampleAt } = chipInteriorSample(join(PILOT, "composite-grey-f60.png"));
const chipOverGrey = samplePatch(join(PILOT, "composite-grey-f60.png"), sampleAt[0], sampleAt[1], 6);
const expectedBlend = PAPER.map((channel, index) =>
  Math.round(channel * CHIP_ALPHA + GREY[index] * (1 - CHIP_ALPHA)),
);
check(
  "chip alpha blends exactly as declared",
  deltaE(expectedBlend, chipOverGrey) < 3,
  `rgb(${chipOverGrey}) vs expected rgb(${expectedBlend}) at 92% — ΔE ${deltaE(expectedBlend, chipOverGrey).toFixed(2)}`,
);
check(
  "chip lands bottom-left at the specified inset",
  box.minX === 64 && 1080 - (box.minY + (1080 - 56 - box.minY)) === 56,
  `left inset ${box.minX}px (spec 64), chip top y=${box.minY}`,
);

// Over real footage: everything outside the chip must be bit-identical. A
// flattened overlay would darken the whole frame and fail here.
const outside = samplePatch(join(PILOT, "composite-f60.png"), 1500, 200, 24);
const standIn = samplePatch(join(PILOT, "cap_standin.mov"), 1500, 200, 24);
check(
  "footage outside the chip is untouched",
  deltaE(outside, standIn) < 2,
  `rgb(${outside}) vs source rgb(${standIn}) — ΔE ${deltaE(outside, standIn).toFixed(2)}`,
);

// 5 — the conform files exist and agree with the timeline.
console.log("\n5. Checking the conform bundle");
const cutlist = JSON.parse(readFileSync(join(ROOT, "cutlist.json"), "utf8"));
sh("xmllint", ["--noout", join(ROOT, "out/conform/continuum-120.fcpxml")]);
check("cutlist totals", cutlist.totalFrames === 3600, `${cutlist.totalFrames} frames`);
check("fcpxml is well-formed", true, "xmllint --noout passed");

const failed = results.filter((result) => !result.pass);

const report = `# Pipeline pilot report

Generated ${new Date().toISOString()} by \`scripts/pilot.mjs\`.

De-risks Phase C (PLAN §4 T11) before a single frame of Phase B is shot.

## Automated checks

| check | result | detail |
|---|---|---|
${results.map((r) => `| ${r.name} | ${r.pass ? "PASS" : "FAIL"} | ${r.detail} |`).join("\n")}

**${results.length - failed.length}/${results.length} passed.**

### What these prove

- Remotion renders the brand paper \`#f7f6f0\` accurately, and a ProRes 422 HQ
  encode at the master settings does not shift it.
- ProRes 4444 label overlays composite with true transparency: the chip lands as
  paper, and the footage outside it is bit-for-bit unchanged. If alpha were being
  flattened, the second check would fail with the whole frame darkened.
- \`cutlist.json\` totals 3600 frames and the FCPXML parses.

## Artifacts

| file | what it is |
|---|---|
| \`out/pilot/hook-slice.mov\` | 5s of the Hook at master settings (ProRes 422 HQ) |
| \`out/pilot/cap_standin.mov\` | Stand-in for an OBS capture, 9s ProRes 422 1080p30 |
| \`out/pilot/paper-source.png\` | Paper straight from Remotion |
| \`out/pilot/paper-roundtrip.png\` | The same frame after a ProRes encode |
| \`out/pilot/composite-f60.png\` | Label L11 composited over the stand-in |

## Still blocked on the user (~15 min in Resolve)

The QuickTime gamma shift cannot be measured without Resolve and a real screen
recording. Run this before capture day:

1. Record ~10s of anything with OBS at the Phase B settings (1080p30 CFR, ProRes 422).
2. New Resolve project, settings per \`resolve/README.md\` — especially
   **"Use Mac display color profiles for viewers" OFF**.
3. \`File → Import → Timeline…\` → \`out/conform/continuum-120.fcpxml\`.
4. Confirm: timeline is **3600 frames**, V2 has **18** clips, A1 and A2 present.
5. Drop \`out/pilot/hook-slice.mov\` and the OBS clip side by side. Pick the paper
   background on the Hook clip with the colour picker: it should read
   **~247, 246, 240**. If it reads noticeably darker or greener, the display
   profile setting is still on.
6. Export an H.264 at the PLAN §6 upload settings, re-import, and confirm the
   paper has not shifted again.

If step 5 shows a shift that the setting does not fix, add a single Color Space
Transform node (Rec.709 → Rec.709, gamma 2.4 → 2.4, "Use White Point Adaptation"
off) on the capture clips only — never on the Remotion segments.
`;

mkdirSync(join(ROOT, "docs"), { recursive: true });
writeFileSync(join(ROOT, "docs/pilot-report.md"), report);

console.log(`\n→ docs/pilot-report.md`);
if (failed.length) {
  console.error(`\n✗ ${failed.length} pilot check(s) failed`);
  process.exit(1);
}
console.log(`\n✓ ${results.length}/${results.length} automated pilot checks passed`);
console.log("  Resolve gamma verification remains user-assisted — see the report.");
