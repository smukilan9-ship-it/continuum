#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { ROOT, v1 } from "./timeline.mjs";
import { SR, adsr, buffer, noise, normalize, note, pluck, toWav, tone } from "./audio-synth.mjs";

/**
 * The sound-effects bed — 120 seconds, generated (PLAN §3.6).
 *
 * Two rules. Everything sits under the narration: the loudest element here is
 * still quieter than the quietest word. And nothing is placed over captured
 * footage that hasn't been shot yet — blind clicks would fight whatever the
 * real UI does. The only exceptions are the beats the plan calls out by name:
 * the approval click at 1:34 and the MCP tool calls at 1:40.
 */

const DURATION = 120;
const F = (frame) => frame / 30;
const bus = buffer(DURATION);

/** A UI tick: a filtered noise transient with a tiny pitched body. */
function click(at, { gain = 0.5, pitch = "A6", pan = 0, seed = 1, body = 0.02 } = {}) {
  noise(bus, {
    start: at,
    duration: 0.035,
    gain: 0.5 * gain,
    seed,
    lowpass: 0.55,
    highpass: 0.72,
    pan,
    env: (t) => pluck(t, 0.006),
  });
  tone(bus, {
    freq: note(pitch),
    start: at,
    duration: 0.12,
    gain: 0.16 * gain,
    pan,
    harmonics: [1, 0.25],
    env: (t) => pluck(t, body),
  });
}

/** Air moving — used for the paste, the collapse and the iris. */
function whoosh(at, duration, { gain = 0.5, rising = true, seed = 7, pan = 0 } = {}) {
  noise(bus, {
    start: at,
    duration,
    gain: 0.42 * gain,
    seed,
    // A fixed one-pole plus an envelope shaped like a sweep reads as a filter
    // sweep at this length, without the cost of a real time-varying filter.
    lowpass: rising ? 0.12 : 0.3,
    highpass: 0.35,
    pan,
    env: (t, d) => {
      const k = t / d;
      const shape = rising ? k ** 1.7 : (1 - k) ** 1.4;
      return Math.max(0, shape) * Math.sin(Math.PI * Math.min(1, k * 1.05));
    },
  });
}

/** A soft pitched swell — something arriving or resolving. */
function bloom(at, { gain = 0.5, root = "C5", duration = 1.6, pan = 0 } = {}) {
  for (const [name, level] of [[root, 1], ["G5", 0.5], ["E6", 0.28]]) {
    tone(bus, {
      freq: note(name),
      start: at,
      duration,
      gain: 0.075 * gain * level,
      detune: 0.3,
      pan,
      harmonics: [1, 0.18],
      env: (t, d) => adsr(t, d, { a: 0.12, d: 0.4, s: 0.35, r: 0.7 }),
    });
  }
}

// ── S0 Hook ─────────────────────────────────────────────────────────────────

// The question being typed, ~12 characters a second.
for (let i = 0; i < 26; i += 1) {
  click(F(6) + i * 0.075, { gain: 0.1, pitch: "D7", seed: 40 + i, pan: -0.15, body: 0.008 });
}

// Each window landing on the desk.
const arrivals = [0, 66, 96, 120, 150, 174, 195, 213, 228];
arrivals.forEach((frame, index) => {
  click(F(frame), {
    gain: 0.34 + index * 0.035,
    pitch: index % 2 ? "F6" : "A6",
    pan: (index % 3) - 1 > 0 ? 0.3 : -0.3,
    seed: 100 + index,
  });
});

// The context block being pasted — twice, identically. The second is the point.
whoosh(F(120), 0.42, { gain: 0.34, rising: false, seed: 11, pan: 0.25 });
whoosh(F(213), 0.42, { gain: 0.42, rising: false, seed: 12, pan: -0.3 });

// Acceleration: the pile becoming noise.
whoosh(F(240), 1.7, { gain: 0.5, rising: true, seed: 21 });
for (let i = 0; i < 10; i += 1) {
  click(F(244) + i * 0.13, { gain: 0.16, pitch: i % 2 ? "C7" : "G6", seed: 200 + i, pan: (i % 2 ? 1 : -1) * 0.4 });
}

// Collapse, then the dot landing.
whoosh(F(378), 1.25, { gain: 0.85, rising: false, seed: 31 });
tone(bus, {
  freq: note("C3"),
  start: F(378),
  duration: 1.3,
  gain: 0.1,
  harmonics: [1, 0.3, 0.1],
  env: (t, d) => adsr(t, d, { a: 0.02, d: 0.3, s: 0.4, r: 0.6 }),
});
bloom(F(414), { gain: 0.7, root: "C5", duration: 1.4 });

// ── S1 the iris opening onto the product ────────────────────────────────────
whoosh(F(420), 0.9, { gain: 0.45, rising: true, seed: 41 });
bloom(F(426), { gain: 0.5, root: "G5", duration: 1.8 });

// ── Section transitions ─────────────────────────────────────────────────────
// One barely-there tick on each cut. It gives the middle of the film a pulse
// without pretending to know what the captured UI is doing.
for (const clip of v1.slice(1)) {
  click(F(clip.recIn), { gain: 0.14, pitch: "E6", seed: 300 + clip.recIn, pan: 0.1 });
}

// ── S3b the approval ────────────────────────────────────────────────────────
// PLAN §3.2: "the approval click is the loudest thing in the mix here." The
// score has already stripped to near-silence, so this lands in the clear.
click(F(2838), { gain: 1.0, pitch: "B5", seed: 500, body: 0.05 });
bloom(F(2842), { gain: 0.45, root: "E5", duration: 1.1 });

// ── S3c MCP tool calls firing ───────────────────────────────────────────────
// load_learning_state ✓, then recommend_resource ✓.
click(F(3010), { gain: 0.42, pitch: "A5", seed: 600, pan: -0.2, body: 0.035 });
click(F(3048), { gain: 0.42, pitch: "C6", seed: 601, pan: 0.2, body: 0.035 });

// ── S4 the mark resolving ───────────────────────────────────────────────────
bloom(F(3366), { gain: 0.55, root: "C5", duration: 2.6 });

normalize(bus, -22);

mkdirSync(join(ROOT, "assets/audio"), { recursive: true });
writeFileSync(join(ROOT, "assets/audio/sfx.wav"), toWav(bus));

let peak = 0;
for (let i = 0; i < bus.n; i += 1) {
  peak = Math.max(peak, Math.abs(bus.left[i]), Math.abs(bus.right[i]));
}
console.log(`✓ assets/audio/sfx.wav  ${DURATION}.000s stereo ${SR}Hz`);
console.log(`  peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS`);
console.log(`  ${arrivals.length} window arrivals · 2 pastes · collapse · iris · approval click · 2 MCP calls`);
