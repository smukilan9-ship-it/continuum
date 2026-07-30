import { fontFamily } from "./fonts";

/**
 * Brand tokens for the launch film.
 *
 * Mirrored from the shipped product so the Remotion segments and the real UI
 * footage grade to the same values on the Resolve timeline:
 *   palette  -> apps/web/app/globals.css (`:root`)
 *   mark     -> apps/web/components/brand-mark.tsx (= app/icon.svg, byte-identical)
 *   typeface -> apps/web/app/layout.tsx (Inter as `--font-sans`)
 *   copy     -> apps/web/components/landing/landing-page.tsx
 *
 * ROLE DISCIPLINE, taken from the product's own stylesheet: **jade carries
 * action, amber carries momentum.** A jade element is something you press; an
 * amber element is something moving. Keeping the two separate is what stops a
 * frame shouting in one colour — and it is why the mark has exactly one warm
 * pixel in it.
 *
 * The film's default surface is `canvas` — a cool off-white with green in it,
 * not the warm paper this file held until v4. Deep bands use `brandDeep`.
 */
export const palette = {
  canvas: "#f7faf8",
  surface: "#ffffff",
  surfaceRaised: "#f2f7f5",
  surfaceSunken: "#e9f0ed",

  ink: "#0b1f1a",
  ink2: "#415a54",
  ink3: "#64807a",

  brand: "#0e8a6e",
  brandStrong: "#0a6b55",
  brandHover: "#12a081",
  brandDeep: "#07332b",
  brandSoft: "#e4f5ef",
  brandLine: "#b6e3d4",

  amber: "#e08704",
  amberLift: "#f5a623",
  amberStrong: "#b86c02",
  amberSoft: "#fdf1dc",

  line: "#dfe8e4",
  lineStrong: "#c3d2cd",

  /** Marks drawn on a saturated jade field. */
  fieldMark: "#7fe6c4",
  inkInverse: "#e8f4f0",
  inkInverse2: "#a9c8bf",
  surfaceInverse: "#07332b",

  /**
   * Where the hook's canvas lands once the desktop has gone cold (PLAN §5.4).
   * The `cool` ramp returns to 0 over the collapse, so the hook hands off to the
   * bridge on exactly `canvas` — verified by sampling pixel (120,120) across
   * the cut. Never let these two drift.
   */
  canvasCold: "#e6eaee",
} as const;

/**
 * The mark's own colours, which are NOT the UI palette.
 *
 * The tile is a three-stop jade gradient running bottom-left to top-right, the
 * bars are white at four different opacities, and the traced line is `#ffb020`
 * — a warmer amber than `palette.amber`, because it sits on saturated jade
 * rather than on canvas. Copied exactly from the product; at 1920x1080 the mark
 * fills a large part of frame and any drift from the shipped SVG is visible.
 */
export const mark = {
  gradient: ["#046b57", "#05a37c", "#0abc90"] as const,
  bar: "#ffffff",
  trace: "#ffb020",
} as const;

export const shadow = {
  /** Window cards in the hook. */
  card: "0 18px 50px rgba(11, 31, 26, 0.10)",
  /** Same geometry, deepened as the hook accelerates. */
  cardDeep: "0 26px 70px rgba(11, 31, 26, 0.22)",
} as const;

export const typography = {
  sans: `"${fontFamily}", system-ui, -apple-system, sans-serif`,
  /**
   * Inter sets tighter than DM Sans at display size; the -2.5 this held for the
   * DM Sans cut collides the glyphs at 110px.
   */
  displayTracking: -1.6,
  displayWeight: 600,
} as const;

/** Label chips must stay readable over arbitrary captured footage. */
export const chip = {
  background: "rgba(255, 255, 255, 0.92)",
  radius: 10,
  padding: 14,
} as const;

/**
 * Verbatim product copy. Do not paraphrase these on screen.
 *
 * `hero` and `proof` are the landing page's own H1 and proof line, so the end
 * slate says what the site says. `problem` is the one line the film keeps that
 * the product no longer runs — the user chose to hold it because the hook is
 * built around landing those two sentences on frame, and line 16 resolves them.
 */
export const copy = {
  wordmark: "continuum",
  problem: ["Information is abundant.", "Learning is fragmented."],
  /** The landing page's current problem statement, spoken as line 1. */
  thread: "Every tool holds a piece. None of them holds the thread.",
  hero: "Your work, and an AI that actually knows it.",
  proof: "Works with Claude, Zotero, Obsidian.",
  repo: "github.com/smukilan9-ship-it/continuum",
} as const;
