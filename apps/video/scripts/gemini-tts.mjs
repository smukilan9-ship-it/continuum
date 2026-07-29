#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "./timeline.mjs";

/**
 * Generates the narration with Gemini TTS (PLAN §3.5).
 *
 * Writes `assets/vo/final/lineNN.wav`, which is exactly where `make-vo.mjs`
 * looks for real takes — so generating a line here upgrades that slot in the
 * assembled track with no other change.
 *
 * Free-tier TTS quota is small and per-key, so the whole run is built around
 * exhaustion rather than treating it as an error: ten keys are rotated
 * round-robin, a key that returns 429 is benched for a cooldown instead of
 * being retried, and the run only gives up once every key is simultaneously
 * benched. Lines already on disk are skipped, so re-running resumes.
 *
 *   node scripts/gemini-tts.mjs                 # missing lines only
 *   node scripts/gemini-tts.mjs --force         # regenerate everything
 *   node scripts/gemini-tts.mjs --only 5,7,8    # specific lines
 *   node scripts/gemini-tts.mjs --voice Algieba
 *   node scripts/gemini-tts.mjs --model gemini-2.5-pro-preview-tts --suffix -pro
 */

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

/** Newest generation; 2.5-pro is the fallback if a line refuses to render. */
const MODEL = flag("model", "gemini-3.1-flash-tts-preview");
const FALLBACK_MODEL = "gemini-2.5-pro-preview-tts";
const VOICE = flag("voice", "Charon");
const SUFFIX = flag("suffix", "");
/**
 * Well below 1.0. Ten clips must sound like one read, and higher temperature
 * lets the emotional register drift line to line — which is exactly what made
 * the first pass swing from neutral to mournful.
 */
const TEMPERATURE = Number(flag("temperature", "0.55"));
const ONLY = flag("only") ? new Set(flag("only").split(",").map(Number)) : null;

const SAMPLE_RATE = 24000;
const KEY_COOLDOWN_MS = 65_000;
const MAX_ATTEMPTS = 24;

// ------------------------------------------------------------------ keys

function loadKeys() {
  const envPath = join(ROOT, "../../.env.local");
  const env = readFileSync(envPath, "utf8");
  const keys = [];
  for (const line of env.split("\n")) {
    const match = line.match(/^(GEMINI_API_KEY(?:_\d+)?)=(.*)$/);
    if (match && match[2].trim()) {
      keys.push({ name: match[1], key: match[2].trim(), benchedUntil: 0 });
    }
  }
  if (!keys.length) throw new Error("No GEMINI_API_KEY* values found in .env.local");
  return keys;
}

const keys = loadKeys();
let cursor = 0;

/** Next key that is not benched, or null if every key is cooling down. */
function nextKey() {
  const now = Date.now();
  for (let i = 0; i < keys.length; i += 1) {
    const candidate = keys[(cursor + i) % keys.length];
    if (candidate.benchedUntil <= now) {
      cursor = (cursor + i + 1) % keys.length;
      return candidate;
    }
  }
  return null;
}

function soonestFree() {
  return Math.min(...keys.map((k) => k.benchedUntil)) - Date.now();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ------------------------------------------------------------------ audio

/** Gemini returns headerless L16 PCM; players and ffmpeg need the RIFF wrapper. */
function pcmToWav(pcm, sampleRate = SAMPLE_RATE, channels = 1, bits = 16) {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bits) / 8;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE((channels * bits) / 8, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// ------------------------------------------------------------------ request

async function synthesize(line, model) {
  /**
   * Gemini TTS expects `<style instruction>: <text>` — the colon is what marks
   * the boundary between direction and content. Without it the model treats
   * the whole prompt as material and improvises: the first pass here fed it
   * `direction.\ntext` and line 10 came back at 38s for 14 words, because it
   * read the stage direction aloud and then kept going.
   *
   * Quoting the text is the second guard, straight from Google's own examples.
   */
  const house = (source.houseStyle ?? "").trim().replace(/[.\s]+$/, "");
  const nuance = line.direction.trim().replace(/[.\s]+$/, "");
  // House register first, per-line nuance second — ten separate generations
  // have to sound like one performance.
  const style = house ? `${house}. For this line, ${nuance}` : nuance;
  const prompt = `${style}: "${line.text}"`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let entry = nextKey();
    if (!entry) {
      const wait = Math.max(soonestFree(), 1000);
      process.stdout.write(`\n     all ${keys.length} keys cooling down, waiting ${Math.ceil(wait / 1000)}s… `);
      await sleep(wait);
      entry = nextKey();
      if (!entry) continue;
    }

    let response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": entry.key, "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              temperature: TEMPERATURE,
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
              },
            },
          }),
        },
      );
    } catch (error) {
      process.stdout.write("net ");
      await sleep(1500 * attempt);
      continue;
    }

    if (response.status === 429 || response.status === 503) {
      // Quota, not failure. Bench the key and move on immediately.
      entry.benchedUntil = Date.now() + KEY_COOLDOWN_MS;
      process.stdout.write(`${entry.name.replace("GEMINI_API_KEY", "k")}⏳ `);
      continue;
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok || payload?.error) {
      const message = payload?.error?.message ?? `HTTP ${response.status}`;
      if (/quota|rate|exhaust/i.test(message)) {
        entry.benchedUntil = Date.now() + KEY_COOLDOWN_MS;
        process.stdout.write("⏳ ");
        continue;
      }
      throw new Error(`${model}: ${message.slice(0, 300)}`);
    }

    const part = payload?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part) {
      const reason = payload?.candidates?.[0]?.finishReason ?? "no audio in response";
      process.stdout.write(`(${reason}) `);
      await sleep(1200);
      continue;
    }

    return {
      pcm: Buffer.from(part.inlineData.data, "base64"),
      keyUsed: entry.name,
      attempts: attempt,
    };
  }

  throw new Error(`gave up after ${MAX_ATTEMPTS} attempts`);
}

// ------------------------------------------------------------------ run

const source = JSON.parse(readFileSync(join(ROOT, "assets/vo/vo-lines.json"), "utf8"));
const WPM = source.pace?.wpm ?? 135;
const outDir = join(ROOT, "assets/vo/final");
mkdirSync(outDir, { recursive: true });

console.log(`Gemini TTS — ${MODEL}`);
console.log(`voice ${VOICE} · temperature ${TEMPERATURE} · ${keys.length} keys in rotation\n`);

const results = [];
for (const line of source.lines) {
  if (ONLY && !ONLY.has(line.n)) continue;
  const name = `line${String(line.n).padStart(2, "0")}${SUFFIX}.wav`;
  const path = join(outDir, name);

  if (existsSync(path) && !has("force")) {
    console.log(`  ${String(line.n).padStart(2)}  ${name}  already on disk — skipping (--force to redo)`);
    continue;
  }

  const maxSilence = line.maxSilence ?? 0.3;
  const slot = line.end - line.start;
  const words = line.text.trim().split(/\s+/).length;
  const expected = (words / WPM) * 60;

  process.stdout.write(`  ${String(line.n).padStart(2)}  generating… `);

  let out;
  try {
    out = await synthesize(line, MODEL);
  } catch (error) {
    process.stdout.write(`\n      ${MODEL} failed (${error.message}) — trying ${FALLBACK_MODEL}… `);
    out = await synthesize(line, FALLBACK_MODEL);
  }

  // Keep the untouched generation next to the trimmed one — if a trim ever
  // sounds clipped, the original is right there to compare against.
  mkdirSync(join(outDir, "raw"), { recursive: true });
  const rawPath = join(outDir, "raw", name);
  writeFileSync(rawPath, pcmToWav(out.pcm));
  const rawSeconds = out.pcm.length / 2 / SAMPLE_RATE;

  /**
   * Cap internal silence. Gemini's pause lengths are unpredictable — a prompt
   * that mentions a pause once produced six-second gaps — and the spacing
   * between lines belongs to the timeline, not the take. 0.3s preserves
   * sentence breaks and kills everything longer.
   */
  execFileSync("ffmpeg", [
    "-y", "-v", "error",
    "-i", rawPath,
    "-af",
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06:" +
      `stop_periods=-1:stop_threshold=-45dB:stop_silence=${maxSilence}:detection=rms`,
    path,
  ]);

  const seconds = Number(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
      { encoding: "utf8" },
    ).trim().split(",")[0],
  );
  const trimmed = rawSeconds - seconds;

  /**
   * A take far longer than the copy warrants usually means the model read the
   * stage direction aloud.
   *
   * Lines that deliberately breathe — "Nothing. Explained. Twice." — carry a
   * raised `maxSilence`, and their beats are part of the performance rather
   * than a defect. Allow for them so the warning stays meaningful.
   */
  const beats = (line.text.match(/[.!?]/g) ?? []).length;
  const intentionalPause = maxSilence > 0.3 ? beats * maxSilence : 0;
  const suspicious = seconds > expected * 1.7 + intentionalPause;
  const fits = seconds <= slot;

  results.push({ n: line.n, seconds, slot, expected, suspicious, fits, name });
  console.log(
    `${seconds.toFixed(2)}s / ${slot.toFixed(1)}s slot  ${fits ? "✓" : "⚠ over"}` +
      (trimmed > 0.15 ? `  (−${trimmed.toFixed(1)}s silence)` : "") +
      `${suspicious ? "  ⚠ still long for the copy — listen before accepting" : ""}` +
      `  [${out.keyUsed.replace("GEMINI_API_KEY", "key")}${out.attempts > 1 ? `, ${out.attempts} tries` : ""}]`,
  );
}

if (!results.length) {
  console.log("\nNothing to generate.");
  process.exit(0);
}

console.log("");
const over = results.filter((r) => !r.fits);
const odd = results.filter((r) => r.suspicious);
console.log(`✓ ${results.length} line(s) written to assets/vo/final/`);
if (over.length) {
  console.log(`⚠ ${over.length} over slot: ${over.map((r) => r.n).join(", ")} — see GEMINI-TTS.md §4`);
}
if (odd.length) {
  console.log(`⚠ ${odd.length} suspiciously long: ${odd.map((r) => r.n).join(", ")} — listen before accepting`);
}
console.log("\nNext:  node scripts/make-vo.mjs");
