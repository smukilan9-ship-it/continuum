import { loadFont } from "@remotion/google-fonts/DMSans";

/**
 * DM Sans is the product typeface (`apps/web/app/layout.tsx` loads it as
 * `--font-sans`). Loading it through `@remotion/google-fonts` bundles the woff2
 * with the render, so glyphs are byte-identical in Studio and in headless
 * renders — a system font stack would silently substitute and drift.
 *
 * Every composition must import `fontFamily` from here rather than hardcoding a
 * family name.
 */
const loaded = loadFont("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const fontFamily = loaded.fontFamily;

/** Await before rendering if a frame must never show a fallback glyph. */
export const waitForFonts = loaded.waitUntilDone;
