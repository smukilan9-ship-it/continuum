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

/** Fades and lifts direct children in sequence. */
export function Stagger({
  children,
  selector = ":scope > *",
  delay = 0,
  distance = 14,
  className,
}: {
  children: ReactNode;
  /** What to animate. Defaults to the direct children. */
  selector?: string;
  delay?: number;
  distance?: number;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = host.current;
    if (!node || reduced()) return;
    let cancelled = false;
    let tween: { kill: () => void } | undefined;

    /**
     * Motion must never be able to hide content. `gsap.context().revert()`
     * restores the state it recorded, and if a re-render tears the effect down
     * mid-flight that state is the tween's own start — opacity 0 — which left
     * a whole screen faded out with no way back. So the elements are collected
     * once, animated with an explicit `fromTo`, and the inline styles are
     * cleared by hand on every exit path: complete, cancel, and unmount.
     */
    const targets = Array.from(node.querySelectorAll<HTMLElement>(selector));
    if (!targets.length) return;
    const clear = () => {
      for (const target of targets) {
        target.style.removeProperty("opacity");
        target.style.removeProperty("transform");
      }
    };

    void import("gsap").then(({ gsap }) => {
      if (cancelled) { clear(); return; }
      tween = gsap.fromTo(
        targets,
        { opacity: 0, y: distance },
        { opacity: 1, y: 0, duration: 0.5, delay, ease: "power2.out", stagger: 0.055, onComplete: clear },
      );
    });

    return () => { cancelled = true; tween?.kill(); clear(); };
  }, [selector, delay, distance]);

  return <div ref={host} className={className}>{children}</div>;
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
