import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";

import { mark, palette } from "./brand";
import { Bloom } from "./vfx";

/**
 * S1 · Bridge — 45 frames, rendered WITH ALPHA (PLAN §3.2, T3).
 *
 * Sits on V2 over the head of `cap_today`. It opens on the same paper the Hook
 * ends on, carrying the Hook's amber dot forward, then irises that dot open into
 * the mark's rounded-square silhouette to reveal the live product beneath.
 *
 * Nothing here may set a background colour: everything outside the paper ring
 * must stay transparent so Resolve composites it over the capture.
 */

const WIDTH = 1920;
const HEIGHT = 1080;
const DOT_SIZE = 12;
/** Comfortably past the frame diagonal (2202px) so the ring clears the edges. */
const OPEN_SIZE = 2600;
const IRIS_START = 5;
const IRIS_END = 45;

export const Bridge: React.FC = () => {
  const frame = useCurrentFrame();

  const open = interpolate(frame, [IRIS_START, IRIS_END], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const size = interpolate(open, [0, 1], [DOT_SIZE, OPEN_SIZE]);
  // The mark's corner radius is 16 on a 64 grid — a quarter of the side.
  const radius = size * 0.25;
  const x = (WIDTH - size) / 2;
  const y = (HEIGHT - size) / 2;

  // The dot hands off to the iris in the first few frames, then gets out of
  // the way before the hole grows past it.
  const dot = interpolate(frame, [4, 11], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // An amber edge trails the wipe and burns off before the ring clears frame.
  const glow = interpolate(frame, [IRIS_START, 12, 34, IRIS_END], [0, 0.9, 0.5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <defs>
          <mask id="bridge-iris">
            <rect width={WIDTH} height={HEIGHT} fill="white" />
            <rect x={x} y={y} width={size} height={size} rx={radius} fill="black" />
          </mask>
        </defs>

        <rect
          width={WIDTH}
          height={HEIGHT}
          fill={palette.canvas}
          mask="url(#bridge-iris)"
        />

        <rect
          x={x}
          y={y}
          width={size}
          height={size}
          rx={radius}
          fill="none"
          stroke={mark.trace}
          strokeWidth={5}
          opacity={glow}
        />

        {dot > 0 ? (
          <circle
            cx={WIDTH / 2}
            cy={HEIGHT / 2}
            r={DOT_SIZE / 2}
            fill={mark.trace}
            opacity={dot}
          />
        ) : null}
      </svg>

      {/* The Hook's dot carries a 340px bloom; without the same glow here the
          cut at film frame 420 drops it in one frame. It rides the dot out
          rather than the iris, so it is gone before the hole grows past it. */}
      {dot > 0 ? (
        <Bloom size={340} strength={0.85 * dot} color={mark.trace} />
      ) : null}
    </AbsoluteFill>
  );
};
