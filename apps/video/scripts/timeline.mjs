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

/**
 * V1 — one gap-free chain from frame 0 to 3600.
 *
 * Three acts, each mapped to one of the four judging criteria (PLAN §1 and
 * §4.1). The ordering is an argument, not a tour: Act I earns educational
 * impact, Act II earns the AI/ML score, Act III earns technical execution, and
 * the hook and close carry the pitch.
 *
 * The five beats marked ★ in the plan are the ones that carry the film —
 * cap_explain, cap_inspector, cap_honesty, cap_obsidian_perms (its second half)
 * and cap_claude_review. Trims come out of their neighbours, never out of them.
 */
export const v1 = [
  { id: "S0-hook", src: "out/segments/hook.mov", recIn: 0, recOut: 420, kind: "remotion", comp: "Hook" },
  { id: "S1-home", src: "capture/cap_home.mov", recIn: 420, recOut: 600, kind: "capture" },

  // ACT I — "It teaches." Educational impact.
  { id: "A1a-queue", src: "capture/cap_study_queue.mov", recIn: 600, recOut: 780, kind: "capture" },
  { id: "A1b-check", src: "capture/cap_study_check.mov", recIn: 780, recOut: 960, kind: "capture" },
  { id: "A1c-explain", src: "capture/cap_explain.mov", recIn: 960, recOut: 1200, kind: "capture" },
  { id: "A1d-practice", src: "capture/cap_practice.mov", recIn: 1200, recOut: 1350, kind: "capture" },

  // ACT II — "It knows your work." Creative use of AI/ML.
  { id: "A2a-ask", src: "capture/cap_ask.mov", recIn: 1350, recOut: 1590, kind: "capture" },
  { id: "A2b-inspector", src: "capture/cap_inspector.mov", recIn: 1590, recOut: 1800, kind: "capture" },
  { id: "A2c-honesty", src: "capture/cap_honesty.mov", recIn: 1800, recOut: 1920, kind: "capture" },
  { id: "A2d-discover", src: "capture/cap_discover.mov", recIn: 1920, recOut: 2160, kind: "capture" },

  // ACT III — "It stays yours." Technical execution.
  { id: "A3a-plan", src: "capture/cap_plan.mov", recIn: 2160, recOut: 2340, kind: "capture" },
  { id: "A3b-build", src: "capture/cap_build.mov", recIn: 2340, recOut: 2520, kind: "capture" },
  { id: "A3cd-obsidian-perms", src: "capture/cap_obsidian_perms.mov", recIn: 2520, recOut: 2820, kind: "capture" },
  { id: "A3e-claude-review", src: "capture/cap_claude_review.mov", recIn: 2820, recOut: 3120, kind: "capture" },

  { id: "S3-code", src: "capture/cap_code.mov", recIn: 3120, recOut: 3210, kind: "capture" },
  { id: "S4-close", src: "out/segments/close.mov", recIn: 3210, recOut: 3600, kind: "remotion", comp: "Close" },
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
