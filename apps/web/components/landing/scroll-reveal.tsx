"use client";

import { useEffect } from "react";

/**
 * The page's entire motion system (redesign.md §10.7).
 *
 * One observer for the whole document instead of a wrapper component per
 * element, and no animation library: GSAP existed only for the three sections
 * §10.5 deletes, so it is gone from the marketing bundle.
 *
 * Content is visible by default. The hiding rule in landing.css is gated on the
 * `mk-reveal` class this component adds, so with JS disabled — or before
 * hydration — every section renders in its final state. Under
 * `prefers-reduced-motion: reduce` the class is never added at all, which
 * satisfies AC-M8 without relying on a transition being cancelled.
 */
export function ScrollReveal() {
  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver !== "function") return;

    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!targets.length) return;

    root.classList.add("mk-reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -5% 0px" },
    );

    // Anything already on screen at mount reveals immediately rather than
    // waiting for a scroll that may never come on a short viewport.
    for (const target of targets) observer.observe(target);

    return () => {
      observer.disconnect();
      root.classList.remove("mk-reveal");
    };
  }, []);

  return null;
}
