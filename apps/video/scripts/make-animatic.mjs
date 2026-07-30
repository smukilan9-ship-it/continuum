#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { FPS, ROOT, TOTAL_FRAMES, labels, v1, v2Bridge } from "./timeline.mjs";

/**
 * Assembles the full 120 seconds as a watchable animatic.
 *
 * Real hook, real close, real overlays, real audio; on-brand slates where the
 * Phase B captures will go. It is the only way to judge the film's *rhythm* —
 * whether the pacing, the label cadence and the score's strip-to-silence
 * actually work together — before a single frame has been shot.
 *
 * This is a preview, not a deliverable. Resolve conforms from the stems and
 * the cutlist, never from this file.
 */

const OUT = join(ROOT, "out/preview/animatic.mp4");
const REMOTION = join(ROOT, "node_modules/.bin/remotion");

mkdirSync(join(ROOT, "out/preview"), { recursive: true });

const slate = join(ROOT, "out/preview/capture-slate.mov");
if (!existsSync(slate) || process.argv.includes("--force")) {
  console.log("Rendering capture slates (95s)…");
  execFileSync(
    REMOTION,
    [
      "render", join(ROOT, "src/index.ts"), "CaptureSlate", slate,
      "--codec=prores", "--prores-profile=hq",
      "--pixel-format=yuv422p10le", "--image-format=jpeg", "--log=error",
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
}

for (const path of [
  "out/segments/hook.mov",
  "out/segments/close.mov",
  "out/segments/bridge.mov",
  "out/audio/mix.wav",
]) {
  if (!existsSync(join(ROOT, path))) {
    console.error(`✗ missing ${path} — run: pnpm render:all && node scripts/make-mix.mjs`);
    process.exit(1);
  }
}

const hook = v1[0];
const close = v1[v1.length - 1];

// V1: hook, slates for everything in between, close — laid on a black base so
// any gap in the maths would be visible rather than silently papered over.
const inputs = [
  "-f", "lavfi", "-i", `color=c=black:s=1920x1080:r=${FPS}:d=${TOTAL_FRAMES / FPS}`,
  "-i", join(ROOT, "out/segments/hook.mov"),
  "-i", slate,
  "-i", join(ROOT, "out/segments/close.mov"),
  "-i", join(ROOT, "out/segments/bridge.mov"),
];
labels.forEach((label) => {
  inputs.push("-i", join(ROOT, `out/overlays/${label.id}.mov`));
});
inputs.push("-i", join(ROOT, "out/audio/mix.wav"));

const audioIndex = 5 + labels.length;
const steps = [];

const at = (frame) => (frame / FPS).toFixed(4);

steps.push(`[1:v]setpts=PTS-STARTPTS+${at(hook.recIn)}/TB[hook]`);
steps.push(`[2:v]setpts=PTS-STARTPTS+${at(420)}/TB[slate]`);
steps.push(`[3:v]setpts=PTS-STARTPTS+${at(close.recIn)}/TB[close]`);
steps.push(`[0:v][hook]overlay=eof_action=pass:enable='between(n,${hook.recIn},${hook.recOut - 1})'[b1]`);
steps.push(`[b1][slate]overlay=eof_action=pass:enable='between(n,420,${close.recIn - 1})'[b2]`);
steps.push(`[b2][close]overlay=eof_action=pass:enable='between(n,${close.recIn},${TOTAL_FRAMES})'[b3]`);

// V2: alpha overlays, each held to its own window.
steps.push(`[4:v]format=rgba,setpts=PTS-STARTPTS+${at(v2Bridge.recIn)}/TB[bridge]`);
steps.push(
  `[b3][bridge]overlay=format=auto:alpha=straight:eof_action=pass:` +
    `enable='between(n,${v2Bridge.recIn},${v2Bridge.recOut - 1})'[v0]`,
);
labels.forEach((label, index) => {
  const inputIndex = 5 + index;
  const from = label.recIn;
  const to = label.recIn + label.durationInFrames - 1;
  steps.push(`[${inputIndex}:v]format=rgba,setpts=PTS-STARTPTS+${at(from)}/TB[l${index}]`);
  steps.push(
    `[v${index}][l${index}]overlay=format=auto:alpha=straight:eof_action=pass:` +
      `enable='between(n,${from},${to})'[v${index + 1}]`,
  );
});

const finalVideo = `v${labels.length}`;

console.log("Compositing 120s animatic…");
execFileSync(
  "ffmpeg",
  [
    "-y", "-v", "error",
    ...inputs,
    "-filter_complex", steps.join(";"),
    "-map", `[${finalVideo}]`,
    "-map", `${audioIndex}:a`,
    "-t", String(TOTAL_FRAMES / FPS),
    "-c:v", "libx264", "-crf", "19", "-preset", "medium", "-pix_fmt", "yuv420p",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    OUT,
  ],
  { stdio: "inherit" },
);

const probe = JSON.parse(
  execFileSync(
    "ffprobe",
    [
      "-v", "error", "-select_streams", "v:0", "-count_frames",
      "-show_entries", "stream=nb_read_frames,width,height",
      "-show_entries", "format=duration,size",
      "-of", "json", OUT,
    ],
    { encoding: "utf8" },
  ),
);
const stream = probe.streams[0];
const frames = Number(stream.nb_read_frames);

console.log(`\n✓ out/preview/animatic.mp4`);
console.log(
  `  ${stream.width}x${stream.height} · ${frames} frames · ` +
    `${Number(probe.format.duration).toFixed(3)}s · ${(probe.format.size / 1048576).toFixed(1)}MB`,
);
if (frames !== TOTAL_FRAMES) {
  console.error(`\n✗ expected ${TOTAL_FRAMES} frames, got ${frames}`);
  process.exit(1);
}
console.log(`  real hook + close, ${labels.length} labels, full mix; slates stand in for captures`);
