"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * Layout state for the fixed Build frame (redesign.md §14.3).
 *
 * §14.3 requires a fixed frame with **no page scroll** — the console scrolls
 * internally. The app shell around this screen is not ours to change
 * (`globals.css` owns `.main-area` / `.content-wrap`, whose top bar and padding
 * differ per breakpoint), so the frame measures the space it was actually given
 * instead of hardcoding a copy of those numbers that would drift.
 */

export const CONSOLE_MIN_HEIGHT = 120;
export const CONSOLE_DEFAULT_HEIGHT = 240;
const CONSOLE_MAX_FRACTION = 0.6;
const CONSOLE_HEIGHT_KEY = "continuum.build.console-height.v1";

/** Space below the frame kept clear so the frame never butts into the fold. */
const RESERVE = 24;

export type FrameMetrics = {
  /** Height the frame may occupy without making the document scroll. */
  height: number | undefined;
  /** Parent padding to pull back, so that padding does not create a scrollbar. */
  swallow: number;
};

/**
 * Measures the frame against the viewport and recomputes on resize.
 *
 * `compact` keeps the parent's bottom padding intact below 900px, where it is
 * what clears the fixed mobile navigation and the sticky Run bar; above it the
 * padding is pulled back so a 720px-tall viewport spends its height on the
 * editor and the console rather than on a gutter.
 */
export function useFixedFrame(ref: RefObject<HTMLElement | null>, compact: boolean): FrameMetrics {
  const [metrics, setMetrics] = useState<FrameMetrics>({ height: undefined, swallow: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const measure = () => {
      // Document-absolute top, so a scrolled page still measures correctly.
      const top = node.getBoundingClientRect().top + window.scrollY;
      const parent = node.parentElement;
      const gutter = parent ? Number.parseFloat(window.getComputedStyle(parent).paddingBottom) || 0 : 0;
      const swallow = compact ? 0 : Math.max(0, gutter - RESERVE);
      const available = window.innerHeight - top - (gutter - swallow);
      setMetrics({ height: Math.max(360, Math.round(available)), swallow: Math.round(swallow) });
    };

    measure();
    window.addEventListener("resize", measure);
    // The sidebar collapses and the top bar reflows without a window resize.
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : undefined;
    if (observer && node.parentElement) observer.observe(node.parentElement);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [ref, compact]);

  return metrics;
}

/**
 * The console height: default 240, min 120, max 60% of the frame, persisted
 * (§14.3). It lives in its own storage key rather than in `CodeSession` because
 * `use-code-session.ts` is explicitly out of scope for this phase — and its
 * `panelWidth` is clamped to 300–620, which cannot express a 120px floor.
 */
export function useConsoleHeight(frameHeight: number | undefined) {
  const [stored, setStored] = useState(CONSOLE_DEFAULT_HEIGHT);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(CONSOLE_HEIGHT_KEY));
      if (Number.isFinite(saved) && saved >= CONSOLE_MIN_HEIGHT) setStored(saved);
    } catch {
      /* storage unavailable — the default is a working console either way */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(CONSOLE_HEIGHT_KEY, String(stored));
    } catch {
      /* ignore */
    }
  }, [stored, restored]);

  const max = Math.max(CONSOLE_MIN_HEIGHT, Math.round((frameHeight ?? 720) * CONSOLE_MAX_FRACTION));
  const height = Math.min(max, Math.max(CONSOLE_MIN_HEIGHT, stored));

  const resize = useCallback((next: number) => {
    setStored(Math.max(CONSOLE_MIN_HEIGHT, Math.round(next)));
  }, []);

  return { height, max, resize };
}

/**
 * `matchMedia` as state. The first render matches the server (always `false`),
 * then the effect corrects it — so the file rail and the mobile tab layout can
 * be chosen in JS rather than by rendering both and hiding one, which would
 * duplicate every control in the accessibility tree.
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}
