"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The app's motion layer.
 *
 * GSAP rather than CSS keyframes for two reasons: a stagger over a list of
 * unknown length is one call instead of an nth-child ladder, and the timeline
 * can be killed on unmount, which matters on a client-routed shell where a
 * screen can disappear mid-animation.
 *
 * Every animation here is an entrance. Nothing loops, nothing moves on scroll
 * inside the app, and every one is skipped outright under
 * `prefers-reduced-motion` — the elements are simply left at their final state,
 * which is also what a no-JS render shows.
 */

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fades and lifts children in sequence — as a CSS animation, deliberately.
 *
 * This was GSAP, and it stranded a whole screen at a third of its opacity: the
 * effect started a tween, a data fetch re-rendered, the cleanup killed it
 * mid-flight, and the inline `opacity: 0.38` it had written stayed there. A JS
 * entrance owns the element's visibility, so every path that can interrupt it
 * is a path that can hide the page.
 *
 * A CSS animation cannot. It ends at `opacity: 1` by definition, it survives a
 * re-render because nothing is holding state, and with no JS at all the element
 * is simply visible. GSAP is still the right tool for the pointer sheen and the
 * counter below, because neither of those decides whether content is readable.
 */
export function Stagger({
  children,
  className,
}: {
  children: ReactNode;
  /** Retained for call-site compatibility; the CSS drives the sequence. */
  selector?: string;
  delay?: number;
  distance?: number;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}

/**
 * A pointer-tracked sheen for a hero surface. The gradient follows the cursor
 * through two custom properties, so the card reacts without React re-rendering
 * on every mouse move.
 */
export function Spotlight({ children, className }: { children: ReactNode; className?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = host.current;
    if (!node || reduced() || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = node.getBoundingClientRect();
        node.style.setProperty("--spot-x", `${((event.clientX - box.left) / box.width) * 100}%`);
        node.style.setProperty("--spot-y", `${((event.clientY - box.top) / box.height) * 100}%`);
      });
    };
    const onLeave = () => { node.style.removeProperty("--spot-x"); node.style.removeProperty("--spot-y"); };
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <div ref={host} className={className ? `spotlight ${className}` : "spotlight"}>{children}</div>;
}

/** Counts a number up to its value once, on mount. */
export function CountUp({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const host = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    if (reduced()) { node.textContent = `${Math.round(value)}${suffix}`; return; }
    let cancelled = false;
    let tween: { kill: () => void } | undefined;
    void import("gsap").then(({ gsap }) => {
      if (cancelled || !host.current) return;
      const counter = { n: 0 };
      tween = gsap.to(counter, {
        n: value,
        duration: 0.9,
        ease: "power2.out",
        onUpdate: () => { if (host.current) host.current.textContent = `${Math.round(counter.n)}${suffix}`; },
      });
    });
    return () => { cancelled = true; tween?.kill(); };
  }, [value, suffix]);

  // Rendered with the final value so no-JS and the server output are correct.
  return <span ref={host} className={className}>{`${Math.round(value)}${suffix}`}</span>;
}
