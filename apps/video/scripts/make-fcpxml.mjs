#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT, framesToTimecode } from "./timeline.mjs";

/**
 * Turns `cutlist.json` into three conform paths for DaVinci Resolve (PLAN §6),
 * in the order they should be tried:
 *
 *   1. out/conform/continuum-120.fcpxml  — full multi-track timeline
 *   2. resolve/build_timeline.py          — console script (separate file)
 *   3. out/conform/cutlist.md             — human record-TC table, ~20 min
 *
 * Three paths exist because the free version of Resolve cannot be driven
 * externally, and a conform that only works one way is a conform that fails on
 * the night before the deadline.
 *
 * Structure note: the spine is a single full-length gap and every clip hangs
 * off it as a connected clip on its own lane. Putting V1 in the spine instead
 * would force V2 overlays to be children of whichever V1 clip they overlap,
 * which breaks the moment an overlay spans a cut.
 */

const cutlist = JSON.parse(readFileSync(join(ROOT, "cutlist.json"), "utf8"));
const { fps, width, height, totalFrames, events } = cutlist;

mkdirSync(join(ROOT, "out/conform"), { recursive: true });

const LANES = { V1: 1, V2: 2, A1: -1, A2: -2, A3: -3 };

function frames(count) {
  // FCPXML wants rational time. 1001-free because we are true 30, not 29.97.
  return `${count}/${fps}s`;
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (char) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char],
  );
}

function fileUrl(relativePath) {
  const absolute = join(ROOT, relativePath);
  return `file://${absolute.split("/").map(encodeURIComponent).join("/")}`;
}

// ---------------------------------------------------------------- FCPXML

const assets = new Map();
for (const event of events) {
  if (assets.has(event.src)) continue;
  const clipFrames = event.recOut - event.recIn;
  // Declare enough source for the trim-in plus handles on both ends, so a clip
  // that starts 2s into its capture is still inside the declared asset.
  const assetFrames = clipFrames + event.srcIn + cutlist.captureHandleFrames;
  assets.set(event.src, {
    id: `r${assets.size + 1}`,
    src: event.src,
    name: event.name.replace(/\.[^.]+$/, ""),
    frames: assetFrames,
    isAudio: event.track.startsWith("A"),
  });
}

const resourceLines = [
  `    <format id="r0" name="FFVideoFormat1080p30" frameDuration="1/${fps}s" width="${width}" height="${height}" colorSpace="1-1-1 (Rec. 709)"/>`,
];
for (const asset of assets.values()) {
  const media = asset.isAudio
    ? `hasAudio="1" audioSources="1" audioChannels="2" audioRate="48000"`
    : `hasVideo="1" videoSources="1" format="r0"`;
  resourceLines.push(
    `    <asset id="${asset.id}" name="${escapeXml(asset.name)}" uid="${asset.id}" start="0s" duration="${frames(asset.frames)}" ${media}>`,
    `      <media-rep kind="original-media" src="${escapeXml(fileUrl(asset.src))}"/>`,
    `    </asset>`,
  );
}

const clipLines = [];
for (const event of events) {
  const asset = assets.get(event.src);
  const lane = LANES[event.track];
  const duration = event.recOut - event.recIn;
  const element = event.track.startsWith("A") ? "asset-clip" : "asset-clip";
  clipLines.push(
    `          <${element} ref="${asset.id}" lane="${lane}" offset="${frames(event.recIn)}" ` +
      `start="${frames(event.srcIn)}" duration="${frames(duration)}" ` +
      `name="${escapeXml(event.id)}"${event.track === "A1" ? ' audioRole="dialogue"' : event.track === "A2" ? ' audioRole="music"' : event.track === "A3" ? ' audioRole="effects"' : ""}/>`,
  );
}

const fcpxml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
${resourceLines.join("\n")}
  </resources>
  <library name="Continuum">
    <event name="Continuum Launch Film">
      <project name="${escapeXml(cutlist.project)}">
        <sequence format="r0" duration="${frames(totalFrames)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
            <gap name="Timeline" offset="0s" start="0s" duration="${frames(totalFrames)}">
${clipLines.join("\n")}
            </gap>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
writeFileSync(join(ROOT, "out/conform/continuum-120.fcpxml"), fcpxml);

// ------------------------------------------------------------------- EDL

const v1Events = events.filter((event) => event.track === "V1");
const edlLines = ["TITLE: CONTINUUM-120", "FCM: NON-DROP FRAME", ""];
v1Events.forEach((event, index) => {
  const duration = event.recOut - event.recIn;
  const reel = event.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase().padEnd(8);
  edlLines.push(
    `${String(index + 1).padStart(3, "0")}  ${reel} V     C        ` +
      `${framesToTimecode(event.srcIn)} ${framesToTimecode(event.srcIn + duration)} ` +
      `${framesToTimecode(event.recIn)} ${framesToTimecode(event.recOut)}`,
    `* FROM CLIP NAME: ${event.name}`,
    "",
  );
});
writeFileSync(join(ROOT, "out/conform/continuum-120.edl"), `${edlLines.join("\n")}\n`);

// -------------------------------------------------------- manual fallback

const byTrack = (track) => events.filter((event) => event.track === track);
const row = (event) =>
  `| ${event.id} | \`${event.src}\` | ${framesToTimecode(event.recIn)} | ${framesToTimecode(event.recOut)} | ${event.recOut - event.recIn} | ${framesToTimecode(event.srcIn)} | ${event.note ?? ""} |`;

const markdown = `# Continuum-120 — manual conform table

Fallback for when FCPXML import and the Resolve console script are both
unavailable. Project settings first: **1920×1080, ${fps} fps, Rec.709 (Scene)**,
"Use Mac display color profiles" **off**. Then lay each clip at its record
timecode.

Generated from \`cutlist.json\` — do not hand-edit.

## V1 — picture (gap-free, 0 → ${framesToTimecode(totalFrames)})

| id | source | rec in | rec out | frames | src in | note |
|---|---|---|---|---|---|---|
${byTrack("V1").map(row).join("\n")}

## V2 — alpha overlays

| id | source | rec in | rec out | frames | src in | note |
|---|---|---|---|---|---|---|
${byTrack("V2").map(row).join("\n")}

## A1 / A2 / A3 — audio

| id | source | rec in | rec out | frames | src in | note |
|---|---|---|---|---|---|---|
${[...byTrack("A1"), ...byTrack("A2"), ...byTrack("A3")].map(row).join("\n")}

## Offline sources

${
  events.filter((event) => event.offline).length === 0
    ? "None — every source is on disk."
    : events
        .filter((event) => event.offline)
        .map((event) => `- \`${event.src}\` (${event.id})`)
        .join("\n")
}
`;
writeFileSync(join(ROOT, "out/conform/cutlist.md"), markdown);

// ------------------------------------------------------------- assertions

const problems = [];
let cursor = 0;
for (const event of v1Events) {
  if (event.recIn !== cursor) problems.push(`V1 gap at ${event.id} (${cursor} → ${event.recIn})`);
  cursor = event.recOut;
}
if (cursor !== totalFrames) problems.push(`V1 ends at ${cursor}, expected ${totalFrames}`);

console.log(`✓ out/conform/continuum-120.fcpxml  ${events.length} clips, ${assets.size} assets`);
console.log(`✓ out/conform/continuum-120.edl     ${v1Events.length} V1 events`);
console.log(`✓ out/conform/cutlist.md            manual fallback table`);

if (problems.length) {
  console.error(`\n✗ ${problems.length} timeline problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
