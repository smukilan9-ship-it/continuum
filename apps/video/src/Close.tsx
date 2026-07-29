import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import {
  BAR_RADIUS,
  BAR_WIDTH,
  BrandMark,
  bars,
  barProgress,
} from "./BrandMark";
import { copy, palette, typography } from "./brand";
import { Bloom, LightSweep, Vignette } from "./vfx";

/**
 * S4 · Close — 330 frames (PLAN §3.2).
 *
 * The rhyme that pays off the Hook: the lime dot every window collapsed into at
 * f414 comes back, splits into the mark's four bars, and builds into the
 * lockup. Chaos, compressed, becomes the brand.
 *
 * The pre-phase (dot → seeds → rising bars) is drawn here rather than inside
 * `BrandMark`, then opacity-swapped into the real component over two frames.
 * Both layers read `bars` / `barProgress` from `BrandMark`, and the swap lands
 * in the window where `BrandMark` draws tile + bars and nothing else
 * (progress 0.28–0.55), so the handoff is pixel-exact.
 */

const MARK_SIZE = 200;
const VIEW_BOX = 64;
/** viewBox units per screen pixel at MARK_SIZE. */
const UNIT = VIEW_BOX / MARK_SIZE;
const DOT_UNITS = 12 * UNIT;

const BUILD_START = 18;
const BUILD_END = 102;
/**
 * A one-frame hard cut, not a crossfade. Both layers draw identical bars here,
 * so dissolving them stacks two 50%-opacity copies of the same dark shape and
 * the bars visibly wash out to grey mid-fade. Cutting is genuinely invisible.
 */
const SWAP_START = 58;
const SWAP_END = 59;

/**
 * Offset from the finished lockup's mark position to frame centre, so the dot
 * can land dead centre — matching where the Hook left it — and the mark then
 * eases into its header position as the wordmark arrives.
 *
 * Measured off a render of frame 320 (the finished end slate): the tile's
 * bounding box sits at x 412–611, y 329–528, i.e. centre (511.5, 428.5).
 * Re-measure if MARK_SIZE, the wordmark size, or the sub-lines change.
 */
const LOCKUP_SHIFT_X = 448.5;
const LOCKUP_SHIFT_Y = 111.5;

/** Bar centres and baselines, in viewBox units. */
const seats = bars.map((bar) => ({
  cx: bar.x + BAR_WIDTH / 2,
  baseline: bar.y + bar.height,
}));

export const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const build = interpolate(frame, [BUILD_START, BUILD_END], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // f0–18: the dot falls in and breathes once, exactly as it left the Hook.
  const descend = interpolate(frame, [0, 16], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const dotY = interpolate(descend, [0, 1], [-180, 0]);
  const dotBreath = interpolate(frame, [12, 18, 24], [1, 1.28, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const dotAlive = interpolate(frame, [16, 22], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const preOpacity = interpolate(frame, [SWAP_START, SWAP_END], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const markOpacity = 1 - preOpacity;

  // The tile follows BrandMark's own curve so the two layers agree at the swap.
  const tile = interpolate(build, [0, 0.28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // f102–168: the mark slides from frame centre into the lockup position.
  const settle = interpolate(frame, [102, 168], [0, 1], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const wordmark = spring({
    frame: frame - 116,
    fps,
    config: { damping: 200 },
    durationInFrames: 34,
  });

  const kicker = interpolate(frame, [174, 216], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const promise = interpolate(frame, [225, 255], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const repo = interpolate(frame, [246, 276], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: palette.paper,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: typography.sans,
      }}
    >
      {/* Glow behind the dot as it falls and again as the node lands, so the
          mark resolves into light rather than simply appearing. */}
      <Bloom
        size={interpolate(frame, [0, 24, 102], [220, 260, 520], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
        strength={interpolate(frame, [0, 14, 60, 96, 130], [0, 0.6, 0.3, 0.75, 0.22], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
        // The mark sits at frame centre while it builds, then travels left and
        // up into the lockup — the glow rides with it.
        x={50 - (LOCKUP_SHIFT_X / 1920) * 100 * settle}
        y={50 - (LOCKUP_SHIFT_Y / 1080) * 100 * settle}
      />

      <div style={{ display: "grid", justifyItems: "center" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 40,
            transform: `translate(${LOCKUP_SHIFT_X * (1 - settle)}px, ${
              LOCKUP_SHIFT_Y * (1 - settle)
            }px)`,
          }}
        >
          <div style={{ position: "relative", width: MARK_SIZE, height: MARK_SIZE }}>
            {/* Pre-phase: the dot, its four seeds, the tile, and the rising
                bars — all in BrandMark's coordinate space. */}
            <svg
              viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
              width={MARK_SIZE}
              height={MARK_SIZE}
              style={{ position: "absolute", inset: 0, opacity: preOpacity }}
            >
              <g style={{ transform: `scale(${tile})`, transformOrigin: "32px 32px" }}>
                <rect width={VIEW_BOX} height={VIEW_BOX} rx={16} fill={palette.accent} />
              </g>

              {bars.map((bar, index) => {
                const grown = barProgress(build, index);
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

              {/* The split: four seeds leave the dot, land on the bar seats and
                  darken, handing off to each bar as it starts to rise. */}
              {seats.map((seat, index) => {
                const travel = interpolate(frame, [BUILD_START, BUILD_START + 18], [0, 1], {
                  easing: Easing.inOut(Easing.cubic),
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                // Seed 4's bar is the last to move, so its seed waits longest.
                const fadeAt = 40 + index * 5;
                const seedAlive = interpolate(frame, [fadeAt, fadeAt + 10], [1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                if (seedAlive <= 0 || frame < BUILD_START) return null;
                const cx = interpolate(travel, [0, 1], [32, seat.cx]);
                const cy = interpolate(travel, [0, 1], [32, seat.baseline - DOT_UNITS / 2]);
                return (
                  <circle
                    key={seat.cx}
                    cx={cx}
                    cy={cy}
                    r={DOT_UNITS / 2}
                    fill={travel > 0.6 ? palette.markInk : palette.accent}
                    opacity={seedAlive}
                  />
                );
              })}

              {dotAlive > 0 ? (
                <circle
                  cx={32}
                  cy={32 + dotY * UNIT}
                  r={(DOT_UNITS / 2) * dotBreath}
                  fill={palette.accent}
                  opacity={dotAlive}
                />
              ) : null}
            </svg>

            <div style={{ position: "absolute", inset: 0, opacity: markOpacity }}>
              <BrandMark progress={build} size={MARK_SIZE} title="Continuum" />
            </div>
          </div>

          <span
            style={{
              opacity: wordmark,
              transform: `translateX(${interpolate(wordmark, [0, 1], [-56, 0])}px)`,
              color: palette.ink,
              fontSize: 168,
              fontWeight: typography.displayWeight,
              letterSpacing: typography.displayTracking,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            {copy.wordmark}
          </span>
        </div>

        <p
          style={{
            opacity: kicker,
            margin: "56px 0 0",
            color: palette.muted,
            fontSize: 40,
            fontWeight: 400,
            letterSpacing: -0.4,
          }}
        >
          {copy.kicker}
        </p>

        <p
          style={{
            opacity: promise,
            margin: "34px 0 0",
            color: palette.ink,
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: -0.3,
          }}
        >
          {copy.promise}
        </p>

        <p
          style={{
            opacity: repo,
            margin: "18px 0 0",
            color: palette.subtle,
            fontSize: 22,
            fontFamily: 'ui-monospace, Menlo, Monaco, "SF Mono", monospace',
          }}
        >
          {copy.repo}
        </p>
      </div>

      {/* One pass of light across the finished lockup, then it settles. */}
      <LightSweep
        progress={interpolate(frame, [168, 232], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
        intensity={0.7}
      />

      <Vignette strength={0.4} />
    </AbsoluteFill>
  );
};
