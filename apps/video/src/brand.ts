import { fontFamily } from "./fonts";

/**
 * Brand tokens for the launch film.
 *
 * Mirrored from the shipped product so the Remotion segments and the real UI
 * footage grade to the same values on the Resolve timeline:
 *   palette  -> apps/web/components/landing/landing.css (`.landing-shell`)
 *   mark     -> apps/web/components/brand-mark.tsx
 *   typeface -> apps/web/app/layout.tsx (DM Sans as `--font-sans`)
 *   copy     -> apps/web/components/landing/landing-page.tsx
 *
 * Continuum's default surface is warm paper, not black. Segments should live in
 * `paper`/`ink` and use `forest` for the deep bands, reserving `accent` for the
 * mark and single points of emphasis.
 */
export const palette = {
  paper: "#f7f6f0",
  surface: "#ffffff",
  surfaceSoft: "#efede3",
  surfaceDeep: "#e3eadf",
  ink: "#101511",
  muted: "#616a63",
  subtle: "#7c847e",
  forest: "#173d2e",
  forestStrong: "#0f2d22",
  emerald: "#467a61",
  emeraldSoft: "#dcebe2",
  accent: "#d9ff2f",
  border: "#dcded8",
  markInk: "#171812",
  /** Where the hook's paper lands once the desktop has gone cold (PLAN §3.2). */
  paperCold: "#e7e9ec",
} as const;

export const shadow = {
  /** Window cards in the hook. */
  card: "0 18px 50px rgba(16, 21, 17, 0.10)",
  /** Same geometry, deepened as the hook accelerates. */
  cardDeep: "0 26px 70px rgba(16, 21, 17, 0.22)",
} as const;

export const typography = {
  sans: `"${fontFamily}", system-ui, -apple-system, sans-serif`,
  displayTracking: -2.5,
  displayWeight: 600,
} as const;

/** Label chips must stay readable over arbitrary captured footage. */
export const chip = {
  background: "rgba(247, 246, 240, 0.92)",
  radius: 10,
  padding: 14,
} as const;

/** Verbatim product copy. Do not paraphrase these on screen. */
export const copy = {
  wordmark: "continuum",
  kicker: "One Workspace. Infinite Learning.",
  problem: ["Information is abundant.", "Learning is fragmented."],
  promise: "Build knowledge that compounds.",
  repo: "github.com/smukilan9-ship-it/continuum",
} as const;
