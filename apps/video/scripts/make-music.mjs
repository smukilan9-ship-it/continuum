#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "./timeline.mjs";
import { SR, adsr, buffer, normalize, note, pluck, toWav, tone, noise } from "./audio-synth.mjs";

/**
 * The score — 120 seconds, generated (PLAN §3.6).
 *
 * Five interchangeable styles, all written to the same hit map so any of them
 * drops onto the timeline unchanged. What varies is instrumentation and
 * rhythm, not structure: every one thins where the film needs air and strips
 * to almost nothing under the MCP proof at 1:34–1:47, which is the most
 * important mix move in the piece.
 *
 *   node scripts/make-music.mjs                  # the selected style
 *   node scripts/make-music.mjs --style pulse
 *   node scripts/make-music.mjs --all            # render every style + auditions
 */

const DURATION = 120;
const BPM = 100;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

const args = process.argv.slice(2);
const flagValue = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

/**
 * Section gains across the film. Interpolated, so the score breathes between
 * markers rather than stepping. The 94→107 trough is load-bearing.
 */
const ARC = [
  { t: 0, pad: 0.12, pulse: 0.0, lead: 0.0 },
  { t: 8, pad: 0.34, pulse: 0.35, lead: 0.0 },
  { t: 12.6, pad: 0.55, pulse: 0.5, lead: 0.0 },
  { t: 14, pad: 0.3, pulse: 0.0, lead: 0.5 },
  { t: 21, pad: 0.5, pulse: 0.45, lead: 0.7 },
  { t: 39, pad: 0.62, pulse: 0.5, lead: 0.85 },
  { t: 59, pad: 0.72, pulse: 0.45, lead: 1.0 },
  { t: 67, pad: 0.66, pulse: 0.45, lead: 0.85 },
  { t: 80, pad: 0.5, pulse: 0.35, lead: 0.6 },
  { t: 92, pad: 0.24, pulse: 0.22, lead: 0.2 },
  { t: 94, pad: 0.1, pulse: 0.18, lead: 0.0 },
  { t: 106, pad: 0.1, pulse: 0.18, lead: 0.0 },
  { t: 108, pad: 0.42, pulse: 0.3, lead: 0.5 },
  { t: 111, pad: 0.7, pulse: 0.0, lead: 0.9 },
  { t: 114, pad: 0.6, pulse: 0.0, lead: 0.5 },
  { t: 120, pad: 0.0, pulse: 0.0, lead: 0.0 },
];

function level(t, key) {
  for (let i = 0; i < ARC.length - 1; i += 1) {
    const a = ARC[i];
    const b = ARC[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / (b.t - a.t);
      return a[key] + (b[key] - a[key]) * k;
    }
  }
  return 0;
}

/** Am7 → Fmaj7 → Cmaj7 → G6. Warm, diatonic, never quite resolving. */
const PROGRESSION = [
  ["A3", "C4", "E4", "G4"],
  ["F3", "A3", "C4", "E4"],
  ["C3", "E4", "G4", "B4"],
  ["G3", "B3", "D4", "E4"],
];
const CHORD_LENGTH = BAR * 2;

const chordAt = (index) => PROGRESSION[index % PROGRESSION.length];

/** Approximates a sawtooth — bright and string-like once stacked. */
const SAW = [1, 0.5, 0.333, 0.25, 0.2, 0.167, 0.143];
/** Bell-ish: sparse, slightly inharmonic-feeling upper partials. */
const BELL = [1, 0.0, 0.42, 0.0, 0.18, 0.0, 0.09];

// ─────────────────────────────────────────────────────────────── styles ────

const STYLES = {
  /** A · warm ambient. Drone, pad, sparse mallets. The current default. */
  paper: {
    label: "Paper — warm ambient",
    blurb: "Drone, soft pad, sparse pentatonic mallets. Calm and unhurried.",
    build(bus) {
      for (const name of ["C2", "G2"]) {
        tone(bus, {
          freq: note(name), start: 0, duration: DURATION, gain: 0.16, detune: 0.12,
          harmonics: [1, 0.16, 0.05],
          env: (t) => Math.max(0, Math.min(t / 3, 1) * Math.min((DURATION - t) / 6, 1)) *
            (0.45 + 0.55 * level(t, "pad")),
        });
      }
      for (let i = 0; i * CHORD_LENGTH < DURATION; i += 1) {
        const start = i * CHORD_LENGTH;
        chordAt(i).forEach((name, voice) => {
          tone(bus, {
            freq: note(name), start, duration: CHORD_LENGTH + 2.2,
            gain: 0.1 * (voice === 0 ? 1.1 : 0.72),
            detune: 0.22 + voice * 0.08, pan: (voice - 1.5) * 0.32,
            harmonics: [1, 0.2, 0.07, 0.03],
            env: (t, d) => adsr(t, d, { a: 1.6, d: 1.2, s: 0.72, r: 2.0 }) * level(start + t, "pad"),
          });
        });
      }
      for (let b = 0; b * BEAT < DURATION; b += 1) {
        const start = b * BEAT;
        const g = level(start, "pulse");
        if (g < 0.03) continue;
        tone(bus, { freq: note("C5"), start, duration: 0.34, gain: 0.05 * g,
          harmonics: [1, 0.12], env: (t) => pluck(t, 0.055) });
      }
      const PENT = ["C5", "D5", "E5", "G5", "A5", "C6"];
      const FIG = [0, 2, 4, 3, 1, 4, 2, 5];
      let step = 0;
      for (let bar = 0; bar * BAR < DURATION; bar += 1) {
        if (level(bar * BAR, "lead") < 0.05) continue;
        for (const off of [0, BEAT * 2.5]) {
          const start = bar * BAR + off;
          const g = level(start, "lead");
          if (g < 0.05) continue;
          const name = PENT[FIG[step % FIG.length]];
          step += 1;
          tone(bus, { freq: note(name), start, duration: 2.4, gain: 0.075 * g,
            pan: ((step % 3) - 1) * 0.28, harmonics: [1, 0.3, 0.12, 0.05],
            env: (t) => pluck(t, 0.55) });
        }
      }
    },
  },

  /** B · minimal momentum. Eighth-note pulse, sub bass, no melody at all. */
  pulse: {
    label: "Pulse — minimal, forward-moving",
    blurb: "Eighth-note heartbeat, sub bass, filtered ticks. No melody — pure momentum.",
    build(bus) {
      for (let e = 0; e * (BEAT / 2) < DURATION; e += 1) {
        const start = e * (BEAT / 2);
        const g = Math.max(level(start, "pulse"), level(start, "pad") * 0.5);
        if (g < 0.04) continue;
        const downbeat = e % 2 === 0;
        // Sub thump on the beat, airy tick on the off — the whole groove.
        tone(bus, {
          freq: note(downbeat ? "A1" : "A2"), start, duration: 0.3,
          gain: (downbeat ? 0.3 : 0.08) * g, harmonics: [1, 0.3, 0.1],
          env: (t) => pluck(t, downbeat ? 0.09 : 0.04),
        });
        if (!downbeat) {
          noise(bus, { start, duration: 0.06, gain: 0.055 * g, seed: 900 + e,
            lowpass: 0.6, highpass: 0.8, pan: (e % 4) / 4 - 0.375,
            env: (t) => pluck(t, 0.012) });
        }
      }
      // One slow-moving held chord instead of a progression — tension, not colour.
      for (let i = 0; i * CHORD_LENGTH < DURATION; i += 1) {
        const start = i * CHORD_LENGTH;
        chordAt(i).slice(0, 2).forEach((name, voice) => {
          tone(bus, {
            freq: note(name), start, duration: CHORD_LENGTH + 1.6,
            gain: 0.085, detune: 0.5 + voice * 0.2, pan: voice ? 0.4 : -0.4,
            harmonics: SAW.map((h, k) => h * (k < 3 ? 1 : 0.35)),
            env: (t, d) => adsr(t, d, { a: 2.2, d: 1.5, s: 0.6, r: 2.2 }) * level(start + t, "pad") * 0.8,
          });
        });
      }
    },
  },

  /** C · crystalline. High bells, wide, no low end at all. */
  glass: {
    label: "Glass — crystalline and precise",
    blurb: "High bell tones, wide stereo, long decays, almost no bass. Cool and premium.",
    build(bus) {
      for (let i = 0; i * CHORD_LENGTH < DURATION; i += 1) {
        const start = i * CHORD_LENGTH;
        chordAt(i).forEach((name, voice) => {
          // Voiced an octave up — the piece floats rather than sits.
          tone(bus, {
            freq: note(name) * 2, start: start + voice * 0.28,
            duration: CHORD_LENGTH, gain: 0.055, detune: 0.4,
            pan: (voice - 1.5) * 0.55, harmonics: BELL,
            env: (t) => pluck(t, 1.9) * level(start + t, "pad"),
          });
        });
      }
      const SHIMMER = ["E6", "G6", "A6", "C7", "D7"];
      let step = 0;
      for (let bar = 0; bar * BAR < DURATION; bar += 1) {
        const g = level(bar * BAR, "lead");
        if (g < 0.06) continue;
        for (const off of [0, BEAT * 1.5, BEAT * 3]) {
          const start = bar * BAR + off;
          step += 1;
          if (step % 2 === 0) continue;
          tone(bus, {
            freq: note(SHIMMER[step % SHIMMER.length]), start, duration: 3.2,
            gain: 0.03 * g, pan: ((step % 5) / 5 - 0.4) * 1.6,
            harmonics: BELL, env: (t) => pluck(t, 1.1),
          });
        }
      }
      // A single low anchor so it is not weightless.
      tone(bus, { freq: note("A2"), start: 0, duration: DURATION, gain: 0.05,
        detune: 0.15, harmonics: [1, 0.1],
        env: (t) => Math.max(0, Math.min(t / 5, 1) * Math.min((DURATION - t) / 6, 1)) * level(t, "pad") });
    },
  },

  /** D · orchestral warmth. Sustained strings, no percussion whatsoever. */
  strings: {
    label: "Strings — warm, swelling, no percussion",
    blurb: "Sustained string-like swells, no rhythm at all. The most emotional option.",
    build(bus) {
      for (let i = 0; i * CHORD_LENGTH < DURATION; i += 1) {
        const start = i * CHORD_LENGTH;
        chordAt(i).forEach((name, voice) => {
          // Three detuned copies per note — a section, not a synth.
          for (const spread of [-0.9, 0, 0.9]) {
            tone(bus, {
              freq: note(name), start, duration: CHORD_LENGTH + 2.6,
              gain: 0.038 * (voice === 0 ? 1.2 : 0.85),
              detune: 0.3 + Math.abs(spread) * 0.5,
              pan: spread * 0.5 + (voice - 1.5) * 0.15,
              harmonics: SAW,
              env: (t, d) => adsr(t, d, { a: 2.4, d: 1.8, s: 0.78, r: 2.8 }) * level(start + t, "pad"),
            });
          }
        });
      }
      // Cello-register counter-line, one note a bar.
      const LOW = ["A2", "F2", "C3", "G2"];
      for (let bar = 0; bar * BAR < DURATION; bar += 1) {
        const start = bar * BAR;
        const g = level(start, "lead");
        if (g < 0.06) continue;
        tone(bus, {
          freq: note(LOW[bar % LOW.length]), start, duration: BAR + 1.4,
          gain: 0.07 * g, detune: 0.35, harmonics: SAW,
          env: (t, d) => adsr(t, d, { a: 1.1, d: 1.0, s: 0.6, r: 1.6 }),
        });
      }
    },
  },

  /** E · driven. Sixteenth arpeggio, moving bass, most energy. */
  motion: {
    label: "Motion — arpeggiated, most energy",
    blurb: "Running sixteenth-note arpeggio over a moving bass. The most 'product launch' option.",
    build(bus) {
      const SIXTEENTH = BEAT / 4;
      for (let s = 0; s * SIXTEENTH < DURATION; s += 1) {
        const start = s * SIXTEENTH;
        const g = level(start, "lead");
        if (g < 0.06) continue;
        const chord = chordAt(Math.floor(start / CHORD_LENGTH));
        // Up-down through the chord so the figure never sits still.
        const pattern = [0, 1, 2, 3, 2, 1];
        const name = chord[pattern[s % pattern.length]];
        tone(bus, {
          freq: note(name) * 2, start, duration: 0.5,
          gain: 0.032 * g, pan: ((s % 6) / 6 - 0.42) * 1.2,
          harmonics: [1, 0.28, 0.1],
          env: (t) => pluck(t, 0.1),
        });
      }
      for (let b = 0; b * BEAT < DURATION; b += 1) {
        const start = b * BEAT;
        const g = Math.max(level(start, "pulse"), level(start, "pad") * 0.6);
        if (g < 0.04) continue;
        const chord = chordAt(Math.floor(start / CHORD_LENGTH));
        tone(bus, {
          freq: note(chord[0]) / 2, start, duration: 0.55,
          gain: 0.22 * g, harmonics: [1, 0.35, 0.12],
          env: (t) => pluck(t, 0.13),
        });
      }
      for (let i = 0; i * CHORD_LENGTH < DURATION; i += 1) {
        const start = i * CHORD_LENGTH;
        chordAt(i).forEach((name, voice) => {
          tone(bus, {
            freq: note(name), start, duration: CHORD_LENGTH + 1.4,
            gain: 0.055, detune: 0.3, pan: (voice - 1.5) * 0.3,
            harmonics: [1, 0.24, 0.08, 0.03],
            env: (t, d) => adsr(t, d, { a: 1.2, d: 1.0, s: 0.7, r: 1.8 }) * level(start + t, "pad") * 0.85,
          });
        });
      }
    },
  },
};

/** The theme landing as the mark completes — shared by every style. */
function resolve(bus, harmonics) {
  for (const [name, delay, gain] of [
    ["C4", 0, 0.13], ["E4", 0.06, 0.1], ["G4", 0.12, 0.1], ["C5", 0.18, 0.09],
  ]) {
    tone(bus, {
      freq: note(name), start: 111.4 + delay, duration: 8.6, gain,
      detune: 0.2, harmonics,
      env: (t, d) => adsr(t, d, { a: 0.5, d: 2.0, s: 0.45, r: 5.0 }),
    });
  }
}

function render(styleName) {
  const style = STYLES[styleName];
  if (!style) {
    console.error(`Unknown style "${styleName}". Options: ${Object.keys(STYLES).join(", ")}`);
    process.exit(1);
  }
  const bus = buffer(DURATION);
  style.build(bus);
  resolve(bus, styleName === "glass" ? BELL : styleName === "strings" ? SAW : [1, 0.24, 0.08]);
  normalize(bus, -19);
  return bus;
}

function stats(bus) {
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < bus.n; i += 1) {
    peak = Math.max(peak, Math.abs(bus.left[i]), Math.abs(bus.right[i]));
    sum += bus.left[i] ** 2 + bus.right[i] ** 2;
  }
  return { peak: 20 * Math.log10(peak), rms: 20 * Math.log10(Math.sqrt(sum / (bus.n * 2))) };
}

mkdirSync(join(ROOT, "assets/audio"), { recursive: true });

if (args.includes("--all")) {
  mkdirSync(join(ROOT, "out/preview/music"), { recursive: true });
  for (const name of Object.keys(STYLES)) {
    const bus = render(name);
    writeFileSync(join(ROOT, `out/preview/music/${name}.wav`), toWav(bus));
    const s = stats(bus);
    console.log(`✓ ${name.padEnd(8)} ${STYLES[name].label}`);
    console.log(`  peak ${s.peak.toFixed(1)} dBFS · rms ${s.rms.toFixed(1)} dBFS`);
  }
  console.log("\nAuditions: out/preview/music/*.wav");
  console.log("Pick one, then: node scripts/make-music.mjs --style <name>");
} else {
  const name = flagValue("style") ?? "paper";
  const bus = render(name);
  writeFileSync(join(ROOT, "assets/audio/bgm.wav"), toWav(bus));
  const s = stats(bus);
  console.log(`✓ assets/audio/bgm.wav  ${DURATION}.000s stereo ${SR}Hz  ·  style: ${name}`);
  console.log(`  ${STYLES[name].blurb}`);
  console.log(`  peak ${s.peak.toFixed(1)} dBFS · rms ${s.rms.toFixed(1)} dBFS`);
  console.log(`  ${BPM} BPM · Am7–Fmaj7–Cmaj7–G6 · strips to near-silence 1:34–1:47`);
}
