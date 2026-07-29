"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

let registered = false;
function ensureRegistered() {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);
  registered = true;
}

/** SSR-safe layout effect — GSAP only ever runs in the browser. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Runs `setup` inside a gsap.context scoped to `scope`, so every tween and
 * ScrollTrigger created in it is reverted together on unmount. This is the only
 * place the landing page is allowed to create GSAP animations — it guarantees
 * cleanup and keeps React strict-mode double-invocation harmless.
 */
export function useGsap(
  setup: (ctx: { gsap: typeof gsap; reduced: boolean; self: gsap.Context }) => void,
  deps: unknown[] = [],
): RefObject<HTMLDivElement | null> {
  const scope = useRef<HTMLDivElement>(null);

  useIsomorphicLayoutEffect(() => {
    ensureRegistered();
    const reduced = prefersReducedMotion();
    const context = gsap.context((self) => setup({ gsap, reduced, self }), scope);
    return () => context.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return scope;
}

export { gsap, ScrollTrigger };
