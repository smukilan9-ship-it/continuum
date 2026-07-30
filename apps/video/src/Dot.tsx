import { AbsoluteFill } from "remotion";

import { mark } from "./brand";
import { Bloom } from "./vfx";

/**
 * The amber dot the whole film pivots on.
 *
 * The Hook crushes nine windows into it at f414, `Bridge` picks it up on its
 * own frame 0 and irises it open, and `Close` re-opens the same dot and splits
 * it into the mark's four bars. It is amber because it *is* the mark's node —
 * the terminus of the traced line, and the one warm pixel in the finished mark.
 *
 * It lives here because Hook and Bridge draw it on either side of a hard cut at
 * film frame 420, so any drift between the two is a visible pop. Two separate
 * implementations had already drifted three ways — a jade bloom behind an amber
 * dot, a settle keyframe one frame past the end of the composition, and a
 * `boxShadow` halo on one side only — for about 1,550 mismatched pixels at the
 * cut. One component, used by both, cannot drift again.
 *
 * `Close` deliberately does NOT use this: it draws its dot in the mark's 64-unit
 * viewBox so the seeds can travel in the same coordinate space as the bars.
 */

export const DOT_SIZE = 12;
const BLOOM_SIZE = 340;

export const Dot: React.FC<{
  /** 0 = absent, 1 = full size. Drives the halo and bloom together. */
  scale?: number;
  /** Extra multiplier for the settle breath. Leave at 1 to sit still. */
  breathe?: number;
  /** Fades the whole thing out without shrinking it. */
  opacity?: number;
}> = ({ scale = 1, breathe = 1, opacity = 1 }) => {
  if (scale <= 0 || opacity <= 0) return null;
  return (
    <>
      <Bloom size={BLOOM_SIZE} strength={scale * 0.85 * opacity} color={mark.trace} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: DOT_SIZE,
            height: DOT_SIZE,
            borderRadius: DOT_SIZE / 2,
            backgroundColor: mark.trace,
            transform: `scale(${scale * breathe})`,
            boxShadow: `0 0 ${18 * scale}px ${6 * scale}px rgba(255,176,32,0.55)`,
            opacity,
          }}
        />
      </AbsoluteFill>
    </>
  );
};
