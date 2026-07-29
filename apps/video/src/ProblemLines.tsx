import { AbsoluteFill, useCurrentFrame } from "remotion";

import { palette, typography } from "./brand";
import { ProblemTypography } from "./hook/Typography";

/**
 * Safety cutaway — 150 frames (PLAN §3.2 T6).
 *
 * The problem statement alone on paper, with no desktop behind it. If the Hook
 * needs trimming in the edit, this drops in as a clean beat without losing the
 * film's thesis. Shares `ProblemTypography` with the Hook so the two can never
 * drift apart.
 */
export const ProblemLines: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: palette.paper,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: typography.sans,
      }}
    >
      <ProblemTypography
        local={frame}
        exitLocal={frame >= 132 ? frame - 132 : undefined}
      />
    </AbsoluteFill>
  );
};
