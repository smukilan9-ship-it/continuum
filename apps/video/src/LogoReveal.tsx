import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { BrandMark } from "./BrandMark";
import { copy, palette, typography } from "./brand";

/**
 * Closing logo animation for the launch film.
 *
 * The lockup matches the product header (mark left, lowercase wordmark right),
 * on the same warm paper the app defaults to.
 */
export const LogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const build = interpolate(frame, [8, 62], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const wordmark = spring({
    frame: frame - 44,
    fps,
    config: { damping: 200 },
    durationInFrames: 32,
  });

  const tagline = interpolate(frame, [86, 112], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: palette.canvas,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: typography.sans,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <BrandMark progress={build} size={200} title="Continuum" />
        <span
          style={{
            opacity: wordmark,
            // Slides in from behind the mark, so the lockup resolves as one unit.
            transform: `translateX(${interpolate(wordmark, [0, 1], [-56, 0])}px)`,
            color: palette.ink,
            fontSize: 168,
            fontWeight: typography.displayWeight,
            letterSpacing: typography.displayTracking,
            lineHeight: 1,
          }}
        >
          {copy.wordmark}
        </span>
      </div>

      <p
        style={{
          opacity: tagline,
          marginTop: 56,
          color: palette.ink2,
          fontSize: 40,
          fontWeight: 400,
          letterSpacing: -0.4,
        }}
      >
        {copy.hero}
      </p>
    </AbsoluteFill>
  );
};
