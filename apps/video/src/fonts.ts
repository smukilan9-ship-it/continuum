import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadSerif } from "@remotion/google-fonts/SourceSerif4";

/**
 * The product's three faces, loaded exactly as `apps/web/app/layout.tsx` loads
 * them. Loading through `@remotion/google-fonts` bundles the woff2 with the
 * render, so glyphs are byte-identical in Studio and in headless renders — a
 * system font stack would silently substitute and drift.
 *
 * Every composition must import from here rather than hardcoding a family name.
 *
 * NOTE: this file loaded DM Sans until v4, on the strength of a comment
 * asserting DM Sans was the product typeface. It was not — `layout.tsx:11`
 * loads Inter. The two are close enough at body size that the error survived a
 * render check; it would only have shown up cut against real UI footage, which
 * is the exact comparison this file exists to survive.
 */

const inter = loadInter("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
});

/**
 * Scoped to reading surfaces only — the quoted passage in the inspector beat —
 * mirroring the product's rule that serif is the editorial signal, not a second
 * UI face. Do not set headings in it.
 */
const serif = loadSerif("normal", {
  weights: ["400", "600"],
  subsets: ["latin"],
});

/** Code, console output, and the closing source shot's overlay. */
const mono = loadMono("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
});

export const fontFamily = inter.fontFamily;
export const serifFamily = serif.fontFamily;
export const monoFamily = mono.fontFamily;

/** Await before rendering if a frame must never show a fallback glyph. */
export async function waitForFonts() {
  await Promise.all([
    inter.waitUntilDone(),
    serif.waitUntilDone(),
    mono.waitUntilDone(),
  ]);
}
