import { getLength } from "@remotion/paths";
import { interpolate } from "remotion";

import { palette } from "./brand";

/**
 * The shipped Continuum mark, ported 1:1 from
 * apps/web/components/brand-mark.tsx, with a `progress` handle for the reveal.
 *
 * Geometry is copied exactly rather than redrawn — at 1920x1080 the mark fills
 * a large part of frame, so any drift from the product mark is visible.
 */

/**
 * Ascending bars. Bar 4 deliberately floats above the shared 55 baseline.
 *
 * Exported because `Close` draws a pre-phase (the hook's dot splitting into
 * these bars) at identical coordinates before opacity-swapping into this
 * component — the swap is only invisible if both read the same geometry.
 */
export const bars = [
  { x: 12, y: 32, height: 23 },
  { x: 25, y: 20, height: 35 },
  { x: 38, y: 25, height: 30 },
  { x: 51, y: 12, height: 34 },
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

      <g style={{ transform: `scale(${tile})`, transformOrigin: "32px 32px" }}>
        <rect width="64" height="64" rx="16" fill={palette.accent} />

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
              fill={palette.markInk}
            />
          );
        })}

        <path
          d={connector}
          fill="none"
          stroke={palette.accent}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={connectorLength}
          strokeDashoffset={connectorLength * (1 - draw)}
        />

        <circle cx="30.5" cy="35" r={4.5 * node} fill={palette.accent} />
      </g>
    </svg>
  );
};
