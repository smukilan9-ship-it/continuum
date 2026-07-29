#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "./timeline.mjs";

/**
 * Stitches narration, score and effects into one 120-second reference mix
 * (PLAN §6 Fairlight targets).
 *
 * This is a *reference*, not the deliverable: Resolve keeps the three stems on
 * separate tracks so they stay adjustable against picture. But a single
 * stitched file is the only way to judge whether the audio works as a piece
 * before a frame of footage exists, so it is worth building properly —
 * sidechain ducking and true-peak limiting included.
 */

const STEMS = {
  vo: "out/audio/vo.wav",
  bgm: "assets/audio/bgm.wav",
  sfx: "assets/audio/sfx.wav",
};

for (const [name, path] of Object.entries(STEMS)) {
  if (!existsSync(join(ROOT, path))) {
    console.error(`✗ missing ${name} stem: ${path}`);
    console.error(
      name === "vo"
        ? "  run: node scripts/gemini-tts.mjs && node scripts/make-vo.mjs"
        : `  run: node scripts/make-${name === "bgm" ? "music" : "sfx"}.mjs`,
    );
    process.exit(1);
  }
}

mkdirSync(join(ROOT, "out/audio"), { recursive: true });
mkdirSync(join(ROOT, "out/preview"), { recursive: true });

const out = join(ROOT, "out/audio/mix.wav");

/**
 * The music ducks under the voice rather than sitting at a fixed level — a
 * static balance either buries the narration or leaves the score inaudible in
 * the gaps, and this film has a lot of deliberate gaps.
 *
 * 100ms attack / 400ms release per PLAN §6.
 */
const filter = [
  "[0:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=1.0,asplit=2[voMix][voKey]",
  "[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=0.95[bgmRaw]",
  "[2:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=0.85[sfx]",
  "[bgmRaw][voKey]sidechaincompress=threshold=0.02:ratio=8:attack=100:release=400:makeup=1[bgm]",
  "[voMix][bgm][sfx]amix=inputs=3:normalize=0:duration=longest[sum]",
  // Catch inter-sample peaks before loudnorm rather than after.
  "[sum]alimiter=limit=0.9:attack=5:release=60[lim]",
  "[lim]loudnorm=I=-14:TP=-1.0:LRA=11[outa]",
].join(";");

execFileSync(
  "ffmpeg",
  [
    "-y", "-v", "error",
    "-i", join(ROOT, STEMS.vo),
    "-i", join(ROOT, STEMS.bgm),
    "-i", join(ROOT, STEMS.sfx),
    "-filter_complex", filter,
    "-map", "[outa]",
    "-t", "120",
    "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le",
    out,
  ],
  { stdio: "inherit" },
);

execFileSync("ffmpeg", [
  "-y", "-v", "error",
  "-i", out,
  "-c:a", "libmp3lame", "-b:a", "192k",
  join(ROOT, "out/preview/audio-full.mp3"),
]);

// Report what actually came out, not what was asked for. ebur128 writes its
// summary to stderr across several indented lines, so capture and parse both.
let report = "";
try {
  execFileSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", out, "-af", "ebur128=peak=true", "-f", "null", "-"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
} catch {
  /* ffmpeg exits non-zero on the null muxer in some builds; stderr is what matters */
}
report = execFileSync(
  "bash",
  [
    "-c",
    `ffmpeg -hide_banner -nostats -i ${JSON.stringify(out)} -af ebur128=peak=true -f null - 2>&1`,
  ],
  { encoding: "utf8" },
);

function pick(label) {
  const match = report.match(new RegExp(`^\\s*${label}:\\s*(-?[\\d.]+|-inf)`, "m"));
  return match ? match[1] : "?";
}

const duration = execFileSync(
  "ffprobe",
  ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
  { encoding: "utf8" },
).trim().split(",")[0];

console.log(`\n✓ out/audio/mix.wav        ${Number(duration).toFixed(3)}s stereo 48kHz`);
console.log(`✓ out/preview/audio-full.mp3`);
console.log(`  integrated     ${pick("I")} LUFS   (target −14)`);
console.log(`  true peak      ${pick("Peak")} dBFS   (target −1.0)`);
console.log(`  loudness range ${pick("LRA")} LU`);
