import Image from "next/image";

/**
 * A captured product screenshot, one file per theme.
 *
 * ── PLACEHOLDERS ─────────────────────────────────────────────────────────────
 * Everything currently under `apps/web/public/marketing/{light,dark}/` is a
 * NEUTRAL PLACEHOLDER at the final dimensions — a flat panel with the shot name
 * on it. It is deliberately *not* a drawing of the product: redesign.md §10.5
 * deletes the old hand-built `HeroProductMockup` because a mock is a subtle form
 * of overclaiming, and inventing a screenshot would be the same mistake in a
 * different file format.
 *
 * Replace them by running `node scripts/capture-marketing.mjs` against a dev
 * server (see that file's header). It writes the same paths at the same size, so
 * no code changes when the real captures land.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Theme handling: the app's theme comes from `localStorage` via the inline script
 * in the root layout, not from `prefers-color-scheme`, so `<picture media>` cannot
 * follow the header's theme toggle. Both variants are therefore in the DOM and the
 * inactive one is `display: none`. Both are `loading="lazy"`, which means the
 * hidden one is never fetched (it has no layout box, so it never intersects the
 * viewport) — one image over the wire, correct in every theme, and CLS stays at
 * zero because width/height are always explicit.
 */

/** Capture size from §10.5: 1440x900 at 2x. */
export const SHOT_WIDTH = 2880;
export const SHOT_HEIGHT = 1800;

export type ShotName =
  | "ask-cited"
  | "ask-inspector"
  | "goal-overview"
  | "study-check"
  | "build-run"
  | "plan-week";

export function ProductShot({
  name,
  alt,
  className,
  sizes,
  crop,
  eager,
}: {
  name: ShotName;
  alt: string;
  className?: string;
  sizes: string;
  /** Which part of the capture to show when the frame is cropped tighter than 16:10. */
  crop?: "top" | "center" | "bottom" | "right";
  /**
   * The hero frame, which is the LCP element, so it is preloaded.
   *
   * This used to stay `lazy` on the reasoning that `priority` implies
   * `loading="eager"` and would fetch the hidden off-theme copy too — "a second
   * full-size screenshot on the critical path costs more than the preload hint
   * buys". Measured on the throttled mobile profile §19.9 budgets, that is
   * wrong in both halves. The hint buys 1.1s: lazy loading made the browser
   * wait for layout before starting the LCP image, and largest-contentful-paint
   * sat at 3.0s against a 2.0s ceiling with `Load Delay 1107ms`. And the second
   * screenshot is not full-size — Next serves it through the image optimiser at
   * the width `sizes` asks for, which measured 24kB.
   */
  eager?: boolean;
}) {
  return (
    <span className={className ? `mk-shot ${className}` : "mk-shot"} data-crop={crop ?? "top"}>
      {(["light", "dark"] as const).map((theme) => (
        <Image
          key={theme}
          className={`mk-shot-img mk-shot-${theme}`}
          src={`/marketing/${theme}/${name}.png`}
          alt={theme === "light" ? alt : ""}
          aria-hidden={theme === "dark" ? true : undefined}
          width={SHOT_WIDTH}
          height={SHOT_HEIGHT}
          sizes={sizes}
          {...(eager ? { priority: true } : { loading: "lazy" as const })}
          decoding="async"
        />
      ))}
    </span>
  );
}
