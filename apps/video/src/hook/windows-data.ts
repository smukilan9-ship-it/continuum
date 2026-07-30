import type { AppId } from "./AppIcon";

/**
 * The hook's desktop, as data (PLAN §3.2 S0 beat map).
 *
 * These are the *named real apps* a Class 12 student actually has open while
 * cramming for the SAT — Safari, ChatGPT, Claude, Gemini, Preview, Notion,
 * Anki, Terminal, Calendar. Recognition is what makes the fragmentation
 * argument land: a judge should see their own desktop, not an abstraction of
 * one.
 *
 * The persona is Mukilan, the same student the seeded demo account belongs to,
 * so the desktop in the hook and the workspace in the captures are one person's
 * week rather than two unrelated fictions.
 *
 * None of them may resemble Continuum's UI. The hook is the world *before* the
 * product, and a judge who mistakes a hook window for the product loses the
 * whole argument. Naming them after other tools makes that confusion harder,
 * not easier. (PLAN §3.0 principle 2, §8 risk row.)
 *
 * Claude appears here deliberately, as a blank slate being hand-fed context.
 * At 1:37 the same app answers from Continuum's memory over MCP without being
 * told anything — the hook is what makes that payoff mean something.
 *
 * Arrival frames are absolute within the 420-frame composition.
 *
 * LAYOUT RULE: no window may cover the title bar of one that arrived earlier.
 * The title bars are what identify the apps now, so burying them costs the
 * segment its whole point. Positions below are chosen so all nine stay legible
 * at f260 (peak density), with enough margin to absorb the ±3° rotations.
 */

export type WindowKind =
  | "chat"
  | "pdf"
  | "notes"
  | "context"
  | "browser"
  | "flashcards"
  | "terminal"
  | "calendar";

export type WindowSpec = {
  id: string;
  kind: WindowKind;
  app: AppId;
  title: string;
  /** Shown right of the app name in the title bar, dimmer. */
  subtitle?: string;
  /** Absolute frame the window springs in on. */
  arriveAt: number;
  /** Top-left in composition pixels. Windows may overhang the frame edges. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Resting rotation in degrees (−3…+3 per the beat map). */
  rotate: number;
  /** Stacking order; also the collapse stagger order. */
  z: number;
};

/** The one line the student types before the pile-up starts. */
export const OPENING_QUESTION =
  "Can you explain arc length vs sector area? SAT on Oct 3.";

/**
 * The thesis of the hook: the human is the sync layer. This exact block is
 * pasted into two different chat windows (f120 and f213) — the repetition is
 * the argument, so the copy must be identical in both.
 *
 * The weakness it names is load-bearing beyond this segment. It is the same one
 * the review queue catches at 0:20, the explain-back grader corrects at 0:32,
 * the Assistant cites at 0:45, and Claude names over MCP — unprompted — at
 * 1:34. That chain is the film's spine (PLAN §4.2), and it only reads if the
 * words here match the seeded `misc_demo_sat_geo` the captures will show.
 */
export const CONTEXT_PASTE =
  "Context (again): Class 12, CBSE. SAT on Oct 3. Weak areas: arc length vs sector area, circles in the coordinate plane. Working from my error log + Bluebook mock 4. Please don't make me repeat this.";

export const BROWSER_TABS = [
  "SAT Circles & Parabolas in 21 min",
  "Khan Academy",
  "College Board",
  "Quizlet",
  "r/SAT",
  "Desmos",
  "Reddit",
  "Gmail",
  "Docs",
] as const;

export const TERMINAL_LINES = [
  { text: "$ python practice.py", tone: "prompt" as const },
  { text: "Traceback (most recent call last):", tone: "error" as const },
  { text: '  File "practice.py", line 42, in <module>', tone: "dim" as const },
  { text: "    area = sector_area(radius, theta)", tone: "dim" as const },
  { text: "ValueError: sector area formula not defined", tone: "error" as const },
];

export const windows: WindowSpec[] = [
  {
    id: "chat-1",
    kind: "chat",
    app: "chatgpt",
    title: "ChatGPT",
    subtitle: "New chat",
    arriveAt: 0,
    x: 600,
    y: 140,
    width: 760,
    height: 460,
    rotate: 0.0,
    z: 1,
  },
  {
    id: "pdf",
    kind: "pdf",
    app: "preview",
    title: "bluebook_mock4_review.pdf",
    subtitle: "Page 12 of 48",
    arriveAt: 66,
    x: 64,
    y: 48,
    width: 510,
    height: 580,
    rotate: -2.4,
    z: 2,
  },
  {
    id: "notes",
    kind: "notes",
    app: "notion",
    title: "Notion",
    subtitle: "sat_error_log_FINAL_v3",
    arriveAt: 96,
    x: 1346,
    y: 64,
    width: 490,
    height: 380,
    rotate: 2.1,
    z: 3,
  },
  {
    // First hand-fed context block. The same app answers from Continuum's
    // memory at 1:37 — this window is what makes that land.
    id: "chat-2",
    kind: "context",
    app: "claude",
    title: "Claude",
    subtitle: "New chat",
    arriveAt: 120,
    x: 1010,
    y: 430,
    width: 800,
    height: 500,
    rotate: 1.4,
    z: 4,
  },
  {
    id: "browser",
    kind: "browser",
    app: "safari",
    title: "SAT Circles & Parabolas in 21 min",
    subtitle: "9 tabs",
    arriveAt: 150,
    x: 180,
    y: 650,
    width: 800,
    height: 420,
    rotate: -1.6,
    z: 5,
  },
  {
    id: "flashcards",
    kind: "flashcards",
    app: "anki",
    title: "Anki",
    subtitle: "SAT · Advanced Geometry",
    arriveAt: 174,
    x: 1448,
    y: 650,
    width: 380,
    height: 300,
    rotate: 2.8,
    z: 6,
  },
  {
    id: "terminal",
    kind: "terminal",
    app: "terminal",
    title: "practice.py — bash — 80×24",
    arriveAt: 195,
    x: 700,
    y: 790,
    width: 660,
    height: 280,
    rotate: -0.8,
    z: 7,
  },
  {
    // Second hand-fed context block, identical text, different vendor. The
    // repetition across apps is the thesis: the human is the sync layer.
    id: "chat-3",
    kind: "context",
    app: "gemini",
    title: "Gemini",
    subtitle: "New chat",
    arriveAt: 213,
    x: 90,
    y: 320,
    width: 680,
    height: 290,
    rotate: -2.9,
    z: 8,
  },
  {
    id: "calendar",
    kind: "calendar",
    app: "calendar",
    title: "Calendar",
    subtitle: "October 2026",
    arriveAt: 228,
    x: 1180,
    y: 880,
    width: 600,
    height: 200,
    rotate: 1.9,
    z: 9,
  },
];

/**
 * f240–288: scaled duplicates cascade in behind the real stack so the pile
 * reads as endless rather than countable. Derived from the specs above with
 * seeded jitter (see `Hook.tsx`) — only the count and layering live here.
 *
 * Raised from 9 to 14 once the nine real windows were spaced out to keep their
 * title bars legible: that spacing left readable gaps of bare desktop, and the
 * gaps read as a tidy mosaic instead of an overflow.
 */
export const DUPLICATE_COUNT = 14;
