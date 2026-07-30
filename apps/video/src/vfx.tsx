import { AbsoluteFill, interpolate } from "remotion";

import { palette } from "./brand";

/**
 * Shared finishing effects.
 *
 * The house rule: every effect here is *felt, not seen*. If a viewer can point
 * at the bloom or name the vignette, it is turned up too far. Peak values are
 * deliberately low — this is the polish that separates a launch film from a
 * screen recording, and it works precisely because nobody notices it.
 */

/** Barely-there darkening at the corners. Sits under everything. */
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 1 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background:
        "radial-gradient(ellipse 78% 74% at 50% 46%, rgba(0,0,0,0) 52%, rgba(16,21,17,0.16) 100%)",
      opacity: strength,
    }}
  />
);

/**
 * A wide, soft band of light travelling diagonally across frame.
 *
 * Apple uses this on hero product shots — it reads as a light source moving
 * past rather than as an overlay, which is why the band is enormous and the
 * opacity tiny.
 */
export const LightSweep: React.FC<{ progress: number; intensity?: number }> = ({
  progress,
  intensity = 0.5,
}) => {
  if (progress <= 0 || progress >= 1) return null;
  // Travels from well off one corner to well off the other.
  const x = interpolate(progress, [0, 1], [-140, 140]);
  const fade = interpolate(progress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: "-60%",
          transform: `translateX(${x}%) rotate(18deg)`,
          background:
            "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 46%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0.55) 54%, rgba(255,255,255,0) 100%)",
          opacity: 0.16 * intensity * fade,
          filter: "blur(28px)",
        }}
      />
    </AbsoluteFill>
  );
};

/** Radial glow behind a point — the lime dot, the mark as it lands. */
export const Bloom: React.FC<{
  size: number;
  strength: number;
  color?: string;
  x?: number;
  y?: number;
}> = ({ size, strength, color = palette.accent, x = 50, y = 50 }) => {
  if (strength <= 0) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: `${x}%`,
          top: `${y}%`,
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${color} 0%, rgba(217,255,47,0) 68%)`,
          opacity: 0.5 * strength,
          filter: `blur(${size * 0.16}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * Depth-of-field and parallax for a window in the hook's pile.
 *
 * Windows nearer the camera scale a little more under the push and sit a hair
 * softer; the focal plane sits mid-stack. This is what stops nine flat
 * rectangles reading as a collage — the pile gains real depth for the cost of
 * one multiply per window.
 */
export function depthOf(z: number, layers: number) {
  // 0 = furthest back, 1 = nearest the lens.
  const normalized = layers <= 1 ? 0.5 : z / layers;
  return {
    /** Extra scale applied on top of the camera push. */
    parallax: 1 + (normalized - 0.5) * 0.055,
    /** Defocus, strongest at the extremes of the stack. */
    defocus: Math.abs(normalized - 0.55) * 2.1,
  };
}

/**
 * Directional smear for something moving fast toward a point.
 *
 * A real motion-blur pass is far too expensive per frame; a blur whose radius
 * tracks velocity sells the same thing at a fraction of the cost, and at 30fps
 * on a 36-frame collapse nobody is inspecting the kernel.
 */
export function motionBlur(velocity: number, max = 7) {
  const amount = Math.min(Math.abs(velocity) * max, max);
  return amount < 0.25 ? undefined : `blur(${amount.toFixed(2)}px)`;
}
