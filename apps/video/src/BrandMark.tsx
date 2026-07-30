import { getLength } from "@remotion/paths";
import { interpolate } from "remotion";

import { mark } from "./brand";

/**
 * The shipped Continuum mark, ported 1:1 from
 * apps/web/components/brand-mark.tsx (byte-identical to apps/web/app/icon.svg),
 * with a `progress` handle for the reveal.
 *
 * Geometry AND colour are copied exactly rather than reinterpreted — at
 * 1920x1080 the mark fills a large part of frame, so any drift from the product
 * mark is visible. The v3 cut of this file drew a lime tile with dark bars,
 * which matched nothing on any screen the film cuts to.
 *
 * The figure is a rising series with a line traced through it: jade for the
 * field, amber for the traced line, which is the same pair of roles they carry
 * everywhere else in the product.
 */

/**
 * Ascending bars, white at four different opacities. Bar 4 deliberately floats
 * above the shared 55 baseline.
 *
 * Exported because `Close` draws a pre-phase (the hook's dot splitting into
 * these bars) at identical coordinates before opacity-swapping into this
 * component — the swap is only invisible if both read the same geometry and the
 * same opacities.
 */
export const bars = [
  { x: 12, y: 32, height: 23, opacity: 0.55 },
  { x: 25, y: 20, height: 35, opacity: 0.75 },
  { x: 38, y: 25, height: 30, opacity: 0.62 },
  { x: 51, y: 12, height: 34, opacity: 0.9 },
] as const;

const connector = "M16.5 42.5C23 42.5 24.5 35 30 35C35 35 36.5 31 42.5 27.5";
const connectorLength = getLength(connector);

export const BAR_WIDTH = 9;
export const BAR_RADIUS = 4.5;

/** Bars rise in sequence, each taking 55% of the window so they overlap. */
export function barProgress(progress: number, index: number) {
  const start = index * 0.15;
  return interpolate(progress, [start, start + 0.55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/**
 * The tile's jade gradient runs bottom-left to top-right (x1=0 y1=64 →
 * x2=64 y2=0). Rendered as a component so `Close` can draw the identical
 * gradient under its own id without the two colliding in one document.
 */
export const MarkGradient: React.FC<{ id: string }> = ({ id }) => (
  <linearGradient id={id} x1="0" y1="64" x2="64" y2="0">
    <stop offset="0%" stopColor={mark.gradient[0]} />
    <stop offset="52%" stopColor={mark.gradient[1]} />
    <stop offset="100%" stopColor={mark.gradient[2]} />
  </linearGradient>
);

export type BrandMarkProps = {
  /** 0 = unbuilt, 1 = the finished product mark. */
  progress?: number;
  size?: number;
  title?: string;
};

export const BrandMark: React.FC<BrandMarkProps> = ({
  progress = 1,
  size = 320,
  title,
}) => {
  // The tile settles first, then bars rise, then the connector draws through them.
  const tile = interpolate(progress, [0, 0.28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const draw = interpolate(progress, [0.55, 0.9], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const node = interpolate(progress, [0.82, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      style={{ overflow: "visible" }}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <MarkGradient id="brand-mark-field" />
      </defs>

      <g style={{ transform: `scale(${tile})`, transformOrigin: "32px 32px" }}>
        <rect width="64" height="64" rx="16" fill="url(#brand-mark-field)" />

        {bars.map((bar, index) => {
          const grown = barProgress(progress, index);
          const baseline = bar.y + bar.height;
          const height = bar.height * grown;
          return (
            <rect
              key={bar.x}
              x={bar.x}
              y={baseline - height}
              width={BAR_WIDTH}
              height={height}
              rx={BAR_RADIUS}
              fill={mark.bar}
              opacity={bar.opacity}
            />
          );
        })}

        {/* The traced line is the mark's only warm pixel, exactly as amber is
            used everywhere else in the product. */}
        <path
          d={connector}
          fill="none"
          stroke={mark.trace}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={connectorLength}
          strokeDashoffset={connectorLength * (1 - draw)}
        />

        <circle cx="30.5" cy="35" r={4.5 * node} fill={mark.trace} />
      </g>
    </svg>
  );
};
