#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  FPS,
  HEIGHT,
  ROOT,
  WIDTH,
  assertLabelsSane,
  assertV1GapFree,
  labels,
  segments,
} from "./timeline.mjs";

/**
 * Renders every synthetic asset in the film and proves each one is exactly the
 * length the master timeline expects.
 *
 * The assertion is the point. A segment that renders one frame short does not
 * announce itself — it silently shifts every downstream cut, and the drift is
 * only discovered in Resolve with the whole timeline already built. Fail here
 * instead, loudly, at ±0 frames.
 *
 *   node scripts/render-all.mjs            # everything
 *   node scripts/render-all.mjs --labels   # overlays only
 *   node scripts/render-all.mjs --check    # verify existing output, no render
 */

const args = new Set(process.argv.slice(2));
const labelsOnly = args.has("--labels");
const checkOnly = args.has("--check");

const REMOTION = join(ROOT, "node_modules/.bin/remotion");
const ENTRY = join(ROOT, "src/index.ts");

function run(command, commandArgs) {
  execFileSync(command, commandArgs, { cwd: ROOT, stdio: "inherit" });
}

function ensureDir(path) {
  mkdirSync(join(ROOT, path), { recursive: true });
}

/** Frame count straight from the container, not from what we asked for. */
function probeFrames(relativePath) {
  const output = execFileSync(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-count_frames",
      "-show_entries", "stream=nb_read_frames,pix_fmt,width,height",
      "-of", "json",
      join(ROOT, relativePath),
    ],
    { encoding: "utf8" },
  );
  const stream = JSON.parse(output).streams?.[0];
  if (!stream) throw new Error(`No video stream in ${relativePath}`);
  return {
    frames: Number(stream.nb_read_frames),
    pixFmt: stream.pix_fmt,
    width: stream.width,
    height: stream.height,
  };
}

function md5(relativePath) {
  return createHash("md5").update(readFileSync(join(ROOT, relativePath))).digest("hex");
}

/**
 * ProRes 4444 with a `yuva` pixel format is what actually carries alpha —
 * 422 HQ silently flattens it onto black, and the overlay looks fine in a
 * player right up until it composites as a grey box in Resolve.
 */
function renderArgs({ file, alpha, comp, props }) {
  const base = [
    "render", ENTRY, comp, file,
    "--codec=prores",
    "--log=error",
  ];
  if (alpha) {
    base.push("--prores-profile=4444", "--pixel-format=yuva444p10le", "--image-format=png");
  } else {
    base.push("--prores-profile=hq", "--pixel-format=yuv422p10le", "--image-format=jpeg");
  }
  if (props) base.push(`--props=${JSON.stringify(props)}`);
  return base;
}

const failures = [];
const manifest = [];

function verify(entry) {
  const probe = probeFrames(entry.file);
  const problems = [];
  if (probe.frames !== entry.frames) {
    problems.push(`expected ${entry.frames} frames, got ${probe.frames}`);
  }
  if (probe.width !== WIDTH || probe.height !== HEIGHT) {
    problems.push(`expected ${WIDTH}x${HEIGHT}, got ${probe.width}x${probe.height}`);
  }
  if (entry.alpha && !probe.pixFmt.startsWith("yuva")) {
    problems.push(`expected an alpha pixel format, got ${probe.pixFmt}`);
  }
  if (problems.length) {
    failures.push(`${entry.file}: ${problems.join("; ")}`);
  }
  manifest.push({
    file: entry.file,
    comp: entry.comp,
    frames: probe.frames,
    fps: FPS,
    seconds: Number((probe.frames / FPS).toFixed(3)),
    pixFmt: probe.pixFmt,
    alpha: Boolean(entry.alpha),
    md5: md5(entry.file),
  });
}

// Structural checks first — no point rendering into a broken timeline.
assertV1GapFree();
assertLabelsSane();

ensureDir("out/segments");
ensureDir("out/overlays");

const targets = [];
if (!labelsOnly) targets.push(...segments);
for (const label of labels) {
  targets.push({
    comp: "Label",
    file: `out/overlays/${label.id}.mov`,
    frames: label.durationInFrames,
    alpha: true,
    props: { labelId: label.id },
  });
}

for (const target of targets) {
  if (!checkOnly) {
    console.log(`→ ${target.comp}${target.props ? ` (${target.props.labelId})` : ""} → ${target.file}`);
    run(REMOTION, renderArgs(target));
  }
  if (!existsSync(join(ROOT, target.file))) {
    failures.push(`${target.file}: missing`);
    continue;
  }
  verify(target);
}

const totalFrames = manifest.reduce((sum, entry) => sum + entry.frames, 0);
writeFileSync(
  join(ROOT, "out/manifest.json"),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      fps: FPS,
      width: WIDTH,
      height: HEIGHT,
      totalSyntheticFrames: totalFrames,
      totalSyntheticSeconds: Number((totalFrames / FPS).toFixed(3)),
      assets: manifest,
    },
    null,
    2,
  )}\n`,
);

console.log("");
for (const entry of manifest) {
  console.log(
    `  ${entry.file.padEnd(30)} ${String(entry.frames).padStart(4)}f  ${String(entry.seconds).padStart(7)}s  ${entry.pixFmt}`,
  );
}
console.log(`\n  synthetic total: ${totalFrames}f (${(totalFrames / FPS).toFixed(3)}s)`);

if (failures.length) {
  console.error(`\n✗ ${failures.length} duration/format assertion(s) failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("\n✓ all durations and pixel formats match the master timeline");
