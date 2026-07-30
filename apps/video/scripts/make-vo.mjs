#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { FPS, ROOT, framesToTimecode } from "./timeline.mjs";

/**
 * Assembles the 120-second narration track (PLAN §3.5).
 *
 * Per line it prefers a real take from `assets/vo/final/lineNN.*` — the Gemini
 * TTS exports from AI Studio, or a human recording — and falls back to macOS
 * `say` only for lines not delivered yet. The edit can therefore be timed from
 * day one, and each line upgrades independently without re-cutting anything:
 * every take lands at the same timecode as the scratch it replaces.
 *
 * A line running past its own slot is a warning. A line running into the *next
 * line* is an error — that is the only overrun that actually breaks the mix.
 *
 *   node scripts/make-vo.mjs
 *   VO_VOICE=Daniel node scripts/make-vo.mjs   # different fallback voice
 */

const VOICE = process.env.VO_VOICE ?? "Samantha";
const TOTAL_SECONDS = 120;
const TAKE_EXTENSIONS = ["wav", "mp3", "aiff", "aif", "m4a", "flac"];

const source = JSON.parse(readFileSync(join(ROOT, "assets/vo/vo-lines.json"), "utf8"));
const lines = source.lines;
const WPM = source.pace?.wpm ?? 135;

mkdirSync(join(ROOT, "assets/vo/scratch"), { recursive: true });
mkdirSync(join(ROOT, "assets/vo/final"), { recursive: true });
mkdirSync(join(ROOT, "out/audio"), { recursive: true });

function probeDuration(path) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "json", path],
    { encoding: "utf8" },
  );
  return Number(JSON.parse(out).format.duration);
}

/** A delivered take wins over scratch, whatever container it arrived in. */
function findTake(n) {
  const stem = `line${String(n).padStart(2, "0")}`;
  for (const extension of TAKE_EXTENSIONS) {
    const path = join(ROOT, "assets/vo/final", `${stem}.${extension}`);
    if (existsSync(path)) return path;
  }
  return null;
}

console.log("Assembling narration\n");

const rendered = [];
for (const line of lines) {
  const take = findTake(line.n);
  let path = take;
  if (!path) {
    path = join(ROOT, "assets/vo/scratch", `line${String(line.n).padStart(2, "0")}.wav`);
    execFileSync("say", ["-v", VOICE, "--data-format=LEF32@48000", "-o", path, line.text]);
  }
  const spoken = probeDuration(path);
  rendered.push({
    ...line,
    path,
    spoken,
    slot: line.end - line.start,
    source: take ? "take" : "scratch",
  });
}

const problems = [];
console.log("  #  in        out       slot   spoken  source    status");
console.log("  " + "-".repeat(68));
rendered.forEach((line, index) => {
  const endsAt = line.start + line.spoken;
  const next = rendered[index + 1];
  const collides = Boolean(next && endsAt > next.start);
  const overruns = line.spoken > line.slot;

  // The film is hard-cut at 120s, so a final line that runs past the end is
  // silently truncated mid-word by the atrim below — the one overrun that
  // produces a broken master rather than a warning.
  const truncated = endsAt > TOTAL_SECONDS;

  if (collides) {
    problems.push(
      `line ${line.n} ends at ${endsAt.toFixed(2)}s and runs into line ${next.n} at ${next.start.toFixed(2)}s`,
    );
  }
  if (truncated) {
    problems.push(
      `line ${line.n} ends at ${endsAt.toFixed(2)}s, past the ${TOTAL_SECONDS}s end of the film — it would be cut off mid-word`,
    );
  }

  const status = collides
    ? `COLLIDES with line ${next.n}`
    : truncated
      ? `RUNS PAST ${TOTAL_SECONDS}s — would be truncated`
      : overruns
        ? `over slot by ${(line.spoken - line.slot).toFixed(2)}s (fits the gap)`
        : "ok";

  console.log(
    `  ${String(line.n).padStart(2)}  ${framesToTimecode(Math.round(line.start * FPS))}  ${framesToTimecode(Math.round(line.end * FPS))}  ` +
      `${line.slot.toFixed(1).padStart(5)}s  ${line.spoken.toFixed(2).padStart(6)}s  ` +
      `${line.source.padEnd(9)} ${status}`,
  );
});

// Delay each line to its cue, then sum. `normalize=0` keeps levels as delivered
// — amix's default normalisation would duck every line by 1/N and make the
// track useless for judging pacing against picture.
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

const output = join(ROOT, "out/audio/vo.wav");
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
const takeCount = rendered.filter((line) => line.source === "take").length;

writeFileSync(
  join(ROOT, "out/audio/vo-manifest.json"),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      durationSeconds: Number(finalDuration.toFixed(3)),
      linesDelivered: takeCount,
      linesScratch: rendered.length - takeCount,
      // PLAN §9 gate 6: the film cannot ship while this is false.
      readyForDelivery: takeCount === rendered.length,
      lines: rendered.map((line) => ({
        n: line.n,
        start: line.start,
        end: line.end,
        source: line.source,
        spoken: Number(line.spoken.toFixed(3)),
        file: line.path.replace(`${ROOT}/`, ""),
      })),
    },
    null,
    2,
  )}\n`,
);

// The sheet a human reads from, regenerated so copy edits cannot drift.
const sheet = [
  "CONTINUUM — 120s LAUNCH FILM · VOICEOVER SCRIPT",
  "",
  `Target pace ~${WPM} wpm. ${source.pace?.why ?? ""}`,
  "",
  "Generating with Gemini TTS in AI Studio? Use assets/vo/GEMINI-TTS.md —",
  "it carries the per-line prompts, voice settings and export steps.",
  "",
  "Deliver takes to: assets/vo/final/lineNN.wav  (mp3/aiff/m4a also accepted)",
  "Then re-run: node scripts/make-vo.mjs",
  "",
  "Two fifths of this film carries no narration. The gaps are deliberate: the",
  "approval click at 1:34 and the Claude Desktop proof at 1:37-1:47 play almost",
  "dry. Do not fill them.",
  "",
  "-".repeat(72),
  "",
  ...rendered.flatMap((line) => [
    `[${String(line.n).padStart(2, "0")}]  ${framesToTimecode(Math.round(line.start * FPS))} → ${framesToTimecode(Math.round(line.end * FPS))}   (${line.slot.toFixed(1)}s)   ${line.segment}`,
    "",
    `      ${line.text}`,
    "",
    `      Direction: ${line.direction ?? "—"}`,
    "",
  ]),
  "-".repeat(72),
  `Narration slots: ${rendered.reduce((sum, l) => sum + l.slot, 0).toFixed(1)}s of ${TOTAL_SECONDS}s`,
  "",
].join("\n");
writeFileSync(join(ROOT, "assets/vo/vo-script.txt"), sheet);

console.log(`\n  → out/audio/vo.wav           ${finalDuration.toFixed(3)}s`);
console.log(`  → out/audio/vo-manifest.json ${takeCount}/${rendered.length} lines delivered`);
console.log(`  → assets/vo/vo-script.txt    recording sheet`);

if (Math.abs(finalDuration - TOTAL_SECONDS) > 0.01) {
  problems.push(`track is ${finalDuration.toFixed(3)}s, expected ${TOTAL_SECONDS}.000s`);
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`\n✓ narration track is exactly ${TOTAL_SECONDS}.000s, no line collisions`);
if (takeCount < rendered.length) {
  console.log(
    `  ${rendered.length - takeCount} line(s) still scratch TTS — PLAN §9 gate 6 blocks delivery until all ${rendered.length} are real takes.`,
  );
}
