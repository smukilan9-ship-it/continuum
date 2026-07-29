#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT, framesToTimecode, FPS } from "./timeline.mjs";

/**
 * Builds a 120-second scratch narration track from macOS `say`, with every
 * line sitting at its exact timeline position (PLAN §3.5, T8).
 *
 * This is edit scaffolding, not a deliverable. Its only job is to let the cut
 * be timed against real speech before the user records; Resolve swaps it for
 * the recorded takes one-for-one at the same timecodes. It also writes the
 * recording sheet the user reads from, so the two can never drift.
 *
 * Overruns are reported, not fatal — a line running long is information for
 * the edit (trim the line, or widen the gap), not a build failure.
 */

const VOICE = process.env.VO_VOICE ?? "Samantha";
const TOTAL_SECONDS = 120;

const source = JSON.parse(
  readFileSync(join(ROOT, "assets/vo/vo-lines.json"), "utf8"),
);
const lines = source.lines;

mkdirSync(join(ROOT, "assets/vo/scratch"), { recursive: true });
mkdirSync(join(ROOT, "out/audio"), { recursive: true });

function probeDuration(path) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
    { encoding: "utf8" },
  );
  return Number(out.trim());
}

console.log(`Rendering ${lines.length} scratch lines with voice "${VOICE}"\n`);

const rendered = [];
for (const line of lines) {
  const name = `line${String(line.n).padStart(2, "0")}.wav`;
  const path = join(ROOT, "assets/vo/scratch", name);
  execFileSync("say", [
    "-v", VOICE,
    "--data-format=LEF32@48000",
    "-o", path,
    line.text,
  ]);
  const spoken = probeDuration(path);
  const slot = line.end - line.start;
  rendered.push({ ...line, path, spoken, slot });

  const flag = spoken > slot ? `⚠ OVER by ${(spoken - slot).toFixed(2)}s` : "ok";
  console.log(
    `  ${String(line.n).padStart(2)}  ${line.start.toFixed(1).padStart(6)}s  slot ${slot.toFixed(1).padStart(5)}s  spoken ${spoken.toFixed(2).padStart(5)}s  ${flag}`,
  );
}

// Delay each line to its cue, then sum. `normalize=0` keeps levels as spoken —
// amix's default normalisation would duck every line by 1/N and make the
// scratch track useless for judging pacing against the picture.
const inputs = rendered.flatMap((line) => ["-i", line.path]);
const delays = rendered
  .map(
    (line, index) =>
      `[${index}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono,` +
      `adelay=${Math.round(line.start * 1000)}[d${index}]`,
  )
  .join(";");
const mixInputs = rendered.map((_, index) => `[d${index}]`).join("");
const filter =
  `${delays};${mixInputs}amix=inputs=${rendered.length}:normalize=0:duration=longest[sum];` +
  `[sum]apad,atrim=0:${TOTAL_SECONDS},asetpts=N/SR/TB[out]`;

const output = join(ROOT, "out/audio/vo-scratch.wav");
execFileSync(
  "ffmpeg",
  [
    "-y", "-v", "error",
    ...inputs,
    "-filter_complex", filter,
    "-map", "[out]",
    "-ar", "48000", "-ac", "1", "-c:a", "pcm_s24le",
    output,
  ],
  { stdio: "inherit" },
);

const finalDuration = probeDuration(output);

// The recording sheet the user actually reads from.
const sheet = [
  "CONTINUUM — 120s LAUNCH FILM · VOICEOVER SCRIPT",
  "",
  "Recording spec (PLAN §3.5): quiet room, 48kHz/24-bit, mouth ~20cm off-axis,",
  "3 full takes + per-line pickups, peaks <= -6 dBFS, deliver dry (no EQ or",
  "compression — Fairlight does it). Slate each line with its number.",
  "",
  "Deliver takes to: assets/vo/final/lineNN.wav",
  "",
  "Roughly a third of this film carries no narration. The gaps are deliberate:",
  "the approval click at 1:34 and the Claude Desktop proof at 1:37-1:47 play",
  "almost dry. Do not fill them.",
  "",
  "-".repeat(72),
  "",
  ...rendered.flatMap((line) => [
    `[${String(line.n).padStart(2, "0")}]  ${framesToTimecode(Math.round(line.start * FPS))} → ${framesToTimecode(Math.round(line.end * FPS))}   (${line.slot.toFixed(1)}s)   ${line.segment}`,
    "",
    `      ${line.text}`,
    "",
  ]),
  "-".repeat(72),
  `Total narration slots: ${rendered.reduce((sum, l) => sum + l.slot, 0).toFixed(1)}s of ${TOTAL_SECONDS}s`,
  "",
].join("\n");
writeFileSync(join(ROOT, "assets/vo/vo-script.txt"), sheet);

const overruns = rendered.filter((line) => line.spoken > line.slot);
console.log(`\n  → out/audio/vo-scratch.wav  ${finalDuration.toFixed(3)}s`);
console.log(`  → assets/vo/vo-script.txt   recording sheet`);

if (Math.abs(finalDuration - TOTAL_SECONDS) > 0.01) {
  console.error(
    `\n✗ scratch track is ${finalDuration.toFixed(3)}s, expected ${TOTAL_SECONDS}.000s`,
  );
  process.exit(1);
}
if (overruns.length) {
  console.log(
    `\n⚠ ${overruns.length} line(s) run past their slot at TTS pace: ${overruns
      .map((l) => l.n)
      .join(", ")}. A human reader is usually faster — check against picture before trimming copy.`,
  );
}
console.log("\n✓ scratch VO is exactly 120.000s");
