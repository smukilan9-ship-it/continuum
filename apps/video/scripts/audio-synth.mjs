/**
 * A tiny additive synthesiser, so the film's music and effects are generated
 * rather than licensed.
 *
 * Everything the score and the SFX bed need is here: sines, filtered noise,
 * envelopes and a stereo bus. Nothing is sampled, so there is no rights
 * question on a judged public upload, and every element can be re-tuned by
 * changing a number instead of re-clearing a track.
 */

export const SR = 48000;

export function buffer(seconds) {
  const n = Math.ceil(seconds * SR);
  return { left: new Float32Array(n), right: new Float32Array(n), n };
}

/** Attack / decay / sustain / release, in seconds. */
export function adsr(t, duration, { a = 0.01, d = 0.1, s = 0.7, r = 0.2 }) {
  if (t < 0) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < duration - r) return s;
  if (t < duration) return s * (1 - (t - (duration - r)) / r);
  return 0;
}

/** Exponential decay — mallets, clicks, anything struck. */
export function pluck(t, tau) {
  return t < 0 ? 0 : Math.exp(-t / tau);
}

/**
 * Adds a voice to the bus.
 *
 * `pan` is -1..1. Detuning the two channels by a fraction of a hertz rather
 * than hard-panning is what gives the pad width without making it sound like
 * two separate instruments.
 */
export function tone(bus, { freq, start, duration, gain, env, pan = 0, detune = 0, harmonics = [1] }) {
  const from = Math.max(0, Math.floor(start * SR));
  const to = Math.min(bus.n, Math.ceil((start + duration) * SR));
  const leftGain = gain * Math.min(1, 1 - pan) ;
  const rightGain = gain * Math.min(1, 1 + pan);

  for (let i = from; i < to; i += 1) {
    const t = i / SR - start;
    const e = env(t, duration);
    if (e <= 0) continue;
    let l = 0;
    let r = 0;
    for (let h = 0; h < harmonics.length; h += 1) {
      const amp = harmonics[h];
      if (!amp) continue;
      const f = freq * (h + 1);
      l += amp * Math.sin(2 * Math.PI * (f - detune) * t);
      r += amp * Math.sin(2 * Math.PI * (f + detune) * t);
    }
    bus.left[i] += l * e * leftGain;
    bus.right[i] += r * e * rightGain;
  }
}

/**
 * Band-limited noise burst — clicks, whooshes, paper-shuffle textures.
 *
 * The "filter" is a one-pole lowpass plus optional highpass difference, which
 * is crude but entirely adequate for sounds that last 30 milliseconds.
 */
export function noise(bus, { start, duration, gain, env, seed = 1, lowpass = 0.4, highpass = 0, pan = 0 }) {
  const from = Math.max(0, Math.floor(start * SR));
  const to = Math.min(bus.n, Math.ceil((start + duration) * SR));
  let state = 0;
  let prev = 0;
  // Deterministic PRNG — renders must be byte-reproducible.
  let x = seed * 1103515245 + 12345;
  const rand = () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return (x / 0x7fffffff) * 2 - 1;
  };
  const leftGain = gain * Math.min(1, 1 - pan);
  const rightGain = gain * Math.min(1, 1 + pan);

  for (let i = from; i < to; i += 1) {
    const t = i / SR - start;
    const e = env(t, duration);
    if (e <= 0) continue;
    state += (rand() - state) * lowpass;
    const value = highpass > 0 ? state - prev * highpass : state;
    prev = state;
    bus.left[i] += value * e * leftGain;
    bus.right[i] += value * e * rightGain;
  }
}

/** Peak-normalise to a target dBFS, then hard-guard against clipping. */
export function normalize(bus, targetDb) {
  const target = 10 ** (targetDb / 20);
  let peak = 0;
  for (let i = 0; i < bus.n; i += 1) {
    peak = Math.max(peak, Math.abs(bus.left[i]), Math.abs(bus.right[i]));
  }
  if (peak === 0) return bus;
  const scale = target / peak;
  for (let i = 0; i < bus.n; i += 1) {
    bus.left[i] = Math.max(-1, Math.min(1, bus.left[i] * scale));
    bus.right[i] = Math.max(-1, Math.min(1, bus.right[i] * scale));
  }
  return bus;
}

export function toWav(bus) {
  const bytes = bus.n * 4;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + bytes, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(bytes, 40);

  const pcm = Buffer.alloc(bytes);
  for (let i = 0; i < bus.n; i += 1) {
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, bus.left[i])) * 32767), i * 4);
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, bus.right[i])) * 32767), i * 4 + 2);
  }
  return Buffer.concat([header, pcm]);
}

/** Equal-tempered note names → Hz, so the score reads as music not numbers. */
const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function note(name) {
  const match = name.match(/^([A-G])(b|#)?(\d)$/);
  if (!match) throw new Error(`bad note: ${name}`);
  const [, letter, accidental, octave] = match;
  let semitone = SEMITONES[letter] + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
  semitone += (Number(octave) + 1) * 12;
  return 440 * 2 ** ((semitone - 69) / 12);
}
