import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The master timeline (PLAN §3.1 and §7), as data.
 *
 * Everything downstream reads this: `render-all.mjs` asserts rendered segment
 * lengths against it, `build-cutlist.mjs` emits `cutlist.json` from it, and
 * `make-fcpxml.mjs` turns that into a Resolve conform. If the film's structure
 * changes, it changes here and propagates — no number is typed twice.
 */

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const TOTAL_FRAMES = 3600;

/** V1 — one gap-free chain from frame 0 to 3600. */
export const v1 = [
  { id: "S0-hook", src: "out/segments/hook.mov", recIn: 0, recOut: 420, kind: "remotion", comp: "Hook" },
  { id: "S1-today", src: "capture/cap_today.mov", recIn: 420, recOut: 630, kind: "capture" },
  { id: "S2a-learn", src: "capture/cap_learn.mov", recIn: 630, recOut: 1020, kind: "capture" },
  { id: "S2b-plan", src: "capture/cap_plan.mov", recIn: 1020, recOut: 1170, kind: "capture" },
  { id: "S2c-library", src: "capture/cap_library.mov", recIn: 1170, recOut: 1650, kind: "capture" },
  { id: "S2d-research", src: "capture/cap_research.mov", recIn: 1650, recOut: 1770, kind: "capture" },
  { id: "S2e-obsidian", src: "capture/cap_obsidian.mov", recIn: 1770, recOut: 2010, kind: "capture" },
  { id: "S2f-memory", src: "capture/cap_memory.mov", recIn: 2010, recOut: 2190, kind: "capture" },
  { id: "S2g-code", src: "capture/cap_code.mov", recIn: 2190, recOut: 2400, kind: "capture" },
  { id: "S2h-connections", src: "capture/cap_connections.mov", recIn: 2400, recOut: 2550, kind: "capture" },
  { id: "S3a-assistant", src: "capture/cap_assistant.mov", recIn: 2550, recOut: 2820, kind: "capture" },
  { id: "S3b-review", src: "capture/cap_review.mov", recIn: 2820, recOut: 2910, kind: "capture" },
  { id: "S3c-claude", src: "capture/cap_claude.mov", recIn: 2910, recOut: 3210, kind: "capture" },
  { id: "S3d-sync", src: "capture/cap_sync.mov", recIn: 3210, recOut: 3270, kind: "capture" },
  { id: "S4-close", src: "out/segments/close.mov", recIn: 3270, recOut: 3600, kind: "remotion", comp: "Close" },
];

/** V2 — the iris overlay; labels are appended from labels.json. */
export const v2Bridge = {
  id: "S1-bridge",
  src: "out/segments/bridge.mov",
  recIn: 420,
  recOut: 465,
  kind: "remotion",
  comp: "Bridge",
};

export const labels = JSON.parse(
  readFileSync(join(ROOT, "src/labels.json"), "utf8"),
);

/** Remotion segments that must exist, with their exact expected lengths. */
export const segments = [
  { comp: "Hook", file: "out/segments/hook.mov", frames: 420, alpha: false },
  { comp: "Bridge", file: "out/segments/bridge.mov", frames: 45, alpha: true },
  { comp: "Close", file: "out/segments/close.mov", frames: 330, alpha: false },
  // Safety cutaway — rendered but not placed on the timeline by default.
  { comp: "ProblemLines", file: "out/segments/problem-lines.mov", frames: 150, alpha: false },
];

/**
 * Three stems, kept separate on the timeline so each stays adjustable against
 * picture. `out/audio/mix.wav` is a stitched reference of the same three, for
 * judging the audio before footage exists — never conform from it.
 */
export const audio = [
  { id: "A1-vo", track: "A1", src: "out/audio/vo.wav", recIn: 0, recOut: TOTAL_FRAMES },
  { id: "A2-bgm", track: "A2", src: "assets/audio/bgm.wav", recIn: 0, recOut: TOTAL_FRAMES },
  { id: "A3-sfx", track: "A3", src: "assets/audio/sfx.wav", recIn: 0, recOut: TOTAL_FRAMES },
];

/** Throws if V1 does not tile [0, TOTAL_FRAMES) without gap or overlap. */
export function assertV1GapFree() {
  let cursor = 0;
  for (const clip of v1) {
    if (clip.recIn !== cursor) {
      throw new Error(
        `V1 gap/overlap at ${clip.id}: expected recIn ${cursor}, got ${clip.recIn}`,
      );
    }
    if (clip.recOut <= clip.recIn) {
      throw new Error(`V1 clip ${clip.id} has non-positive duration`);
    }
    cursor = clip.recOut;
  }
  if (cursor !== TOTAL_FRAMES) {
    throw new Error(`V1 ends at frame ${cursor}, expected ${TOTAL_FRAMES}`);
  }
}

/** Throws if any two labels overlap or run past the end of the film. */
export function assertLabelsSane() {
  const sorted = [...labels].sort((a, b) => a.recIn - b.recIn);
  let previousEnd = 0;
  for (const label of sorted) {
    const end = label.recIn + label.durationInFrames;
    if (label.recIn < previousEnd) {
      throw new Error(`Label ${label.id} starts at ${label.recIn}, overlapping the previous label`);
    }
    if (end > TOTAL_FRAMES) {
      throw new Error(`Label ${label.id} ends at ${end}, past the end of the film`);
    }
    previousEnd = end;
  }
}

export function framesToTimecode(frames) {
  const hours = Math.floor(frames / (FPS * 3600));
  const minutes = Math.floor(frames / (FPS * 60)) % 60;
  const seconds = Math.floor(frames / FPS) % 60;
  const rest = frames % FPS;
  return [hours, minutes, seconds, rest]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}
