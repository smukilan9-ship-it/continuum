#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  FPS,
  HEIGHT,
  ROOT,
  TOTAL_FRAMES,
  WIDTH,
  assertLabelsSane,
  assertV1GapFree,
  audio,
  labels,
  v1,
  v2Bridge,
} from "./timeline.mjs";

/**
 * Emits `cutlist.json` — the machine-readable master timeline (PLAN §7).
 *
 * Everything that conforms the film reads this one file, so the edit can never
 * disagree with the plan by a frame. Captures are listed whether or not they
 * have been shot: the conform is built offline and relinked on capture day.
 */

/** Captures are shot with 2s handles either side (PLAN §5 file contract). */
const CAPTURE_HANDLE_FRAMES = 2 * FPS;

assertV1GapFree();
assertLabelsSane();

// Keep the conform buildable before the user has chosen music: a silent bed of
// exactly the right length means Resolve never opens with a missing A2.
const bgmPath = join(ROOT, "assets/audio/bgm.wav");
let bgmPlaceholder = false;
if (!existsSync(bgmPath)) {
  mkdirSync(join(ROOT, "assets/audio"), { recursive: true });
  execFileSync("ffmpeg", [
    "-y", "-v", "error",
    "-f", "lavfi",
    "-i", `anullsrc=r=48000:cl=mono`,
    "-t", String(TOTAL_FRAMES / FPS),
    "-c:a", "pcm_s24le",
    bgmPath,
  ]);
  bgmPlaceholder = true;
}

const events = [];

for (const clip of v1) {
  events.push({
    id: clip.id,
    track: "V1",
    src: clip.src,
    name: clip.src.split("/").pop(),
    recIn: clip.recIn,
    recOut: clip.recOut,
    // Remotion segments are cut to length; captures are trimmed in from handles.
    srcIn: clip.kind === "capture" ? CAPTURE_HANDLE_FRAMES : 0,
    kind: clip.kind,
    offline: clip.kind === "capture" && !existsSync(join(ROOT, clip.src)),
    note: clip.comp ? `Remotion composition "${clip.comp}"` : undefined,
  });
}

events.push({
  id: v2Bridge.id,
  track: "V2",
  src: v2Bridge.src,
  name: "bridge.mov",
  recIn: v2Bridge.recIn,
  recOut: v2Bridge.recOut,
  srcIn: 0,
  kind: "remotion",
  offline: false,
  note: "Alpha iris wipe over the head of cap_today",
});

for (const label of labels) {
  events.push({
    id: label.id,
    track: "V2",
    src: `out/overlays/${label.id}.mov`,
    name: `${label.id}.mov`,
    recIn: label.recIn,
    recOut: label.recIn + label.durationInFrames,
    srcIn: 0,
    kind: "overlay",
    offline: false,
    note: `${label.title} — ${label.sub}`,
  });
}

for (const track of audio) {
  events.push({
    id: track.id,
    track: track.track,
    src: track.src,
    name: track.src.split("/").pop(),
    recIn: track.recIn,
    recOut: track.recOut,
    srcIn: 0,
    kind: "audio",
    offline: !existsSync(join(ROOT, track.src)),
    note:
      track.track === "A1"
        ? "SCRATCH — replace with the recorded VO before delivery"
        : bgmPlaceholder
          ? "PLACEHOLDER SILENCE — replace with the licensed track"
          : "Licensed music bed",
  });
}

const cutlist = {
  $schema: "./cutlist.schema.md",
  generatedAt: new Date().toISOString(),
  project: "Continuum-120",
  fps: FPS,
  width: WIDTH,
  height: HEIGHT,
  totalFrames: TOTAL_FRAMES,
  captureHandleFrames: CAPTURE_HANDLE_FRAMES,
  events,
};

writeFileSync(join(ROOT, "cutlist.json"), `${JSON.stringify(cutlist, null, 2)}\n`);

const offline = events.filter((event) => event.offline);
console.log(`✓ cutlist.json — ${events.length} events, ${TOTAL_FRAMES} frames, V1 gap-free`);
console.log(
  `  V1 ${events.filter((e) => e.track === "V1").length} · ` +
    `V2 ${events.filter((e) => e.track === "V2").length} · ` +
    `A ${events.filter((e) => e.track.startsWith("A")).length}`,
);
if (bgmPlaceholder) console.log("  ⚠ assets/audio/bgm.wav generated as 120s silence (placeholder)");
if (offline.length) {
  console.log(`  ⚠ ${offline.length} source(s) not yet on disk — Resolve will relink:`);
  for (const event of offline) console.log(`      ${event.src}`);
}
