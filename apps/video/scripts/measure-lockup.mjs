import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ROOT } from "./timeline.mjs";

/**
 * Measures where the finished lockup actually puts the mark, and prints the
 * LOCKUP_SHIFT constants `Close.tsx` needs so the dot can land dead centre.
 *
 * These were eyeballed once and were wrong by 40px in X and by the whole
 * sub-line stack in Y. They have to be re-measured whenever MARK_SIZE, the
 * wordmark's typeface, or the end-slate copy changes — all three of which moved
 * in v4 (DM Sans -> Inter, new hero and proof lines).
 *
 * Method: render the settled end slate, find the tile by its jade, take the
 * bounding box, and report the offset from frame centre.
 */

const WIDTH = 1920;
const HEIGHT = 1080;
/** Frame 320: settle is long finished and every sub-line has arrived. */
const FRAME = 320;

/** The tile's gradient runs #046b57 -> #0abc90; match the whole ramp. */
function isTile(r, g, b) {
  return g > 80 && g < 200 && g > r + 40 && g > b + 30 && r < 120;
}

const dir = mkdtempSync(join(tmpdir(), "lockup-"));
try {
  const png = join(dir, "close.png");
  execFileSync(
    "npx",
    ["remotion", "still", "Close", png, `--frame=${FRAME}`, "--log=error"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );

  const raw = join(dir, "close.rgb");
  execFileSync("ffmpeg", ["-y", "-i", png, "-f", "rawvideo", "-pix_fmt", "rgb24", raw], {
    stdio: ["ignore", "ignore", "ignore"],
  });

  const pixels = readFileSync(raw);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const i = (y * WIDTH + x) * 3;
      if (!isTile(pixels[i], pixels[i + 1], pixels[i + 2])) continue;
      count += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (count < 5000) {
    throw new Error(
      `Found only ${count} tile pixels — the colour test no longer matches the mark.`,
    );
  }

  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  const shiftX = WIDTH / 2 - centreX;
  const shiftY = HEIGHT / 2 - centreY;

  console.log(`tile bbox   x ${minX}-${maxX}  y ${minY}-${maxY}  (${count} px)`);
  console.log(`tile centre (${centreX}, ${centreY})`);
  console.log("");
  console.log(`const LOCKUP_SHIFT_X = ${shiftX};`);
  console.log(`const LOCKUP_SHIFT_Y = ${shiftY};`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
