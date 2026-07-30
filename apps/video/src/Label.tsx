import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";

import { chip, palette, typography } from "./brand";
import { getLabel } from "./labels-data";

/**
 * Feature label overlay — rendered WITH ALPHA, one clip per label (PLAN §3.4).
 *
 * Sits on V2 over captured footage. The paper chip is what keeps these readable
 * over an arbitrary screen recording; without it a light UI would swallow the
 * ink and the mute pass (§9 gate 2) would fail.
 *
 * In and out are baked into the clip, so Resolve just lays it at `recIn` — no
 * keyframing on the timeline.
 */

export type LabelProps = { labelId: string };

export const calculateLabelMetadata: CalculateMetadataFunction<LabelProps> = ({
  props,
}) => ({
  durationInFrames: getLabel(props.labelId).durationInFrames,
});

export const Label: React.FC<LabelProps> = ({ labelId }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const label = getLabel(labelId);

  const rule = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const text = interpolate(frame, [4, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const out = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ fontFamily: typography.sans }}>
      <div
        style={{
          position: "absolute",
          left: 64,
          bottom: 56,
          display: "flex",
          gap: 16,
          alignItems: "stretch",
          padding: chip.padding,
          paddingRight: chip.padding + 10,
          borderRadius: chip.radius,
          backgroundColor: chip.background,
          opacity: out,
        }}
      >
        <div
          style={{
            width: 3,
            borderRadius: 2,
            backgroundColor: palette.accent,
            transform: `scaleY(${rule})`,
            transformOrigin: "top center",
          }}
        />
        <div
          style={{
            display: "grid",
            gap: 4,
            opacity: text,
            transform: `translateY(${(1 - text) * 12}px)`,
          }}
        >
          <span
            style={{
              fontSize: 30,
              fontWeight: 600,
              color: palette.ink,
              letterSpacing: -0.5,
              lineHeight: 1.15,
            }}
          >
            {label.title}
          </span>
          <span
            style={{
              fontSize: 20,
              fontWeight: 400,
              color: palette.muted,
              letterSpacing: -0.2,
              lineHeight: 1.2,
            }}
          >
            {label.sub}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
