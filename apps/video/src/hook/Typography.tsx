import { Easing, interpolate } from "remotion";

import { copy, palette, typography } from "../brand";

/**
 * The problem statement, verbatim from the product's own landing page
 * (`landing-page.tsx` — "Information is abundant. / Learning is fragmented.").
 *
 * Shared by the Hook (f288–414) and the standalone `ProblemLines` safety comp,
 * so the two can never drift apart in the edit.
 */
export const ProblemTypography: React.FC<{
  /** Frames since the first line begins its entrance. */
  local: number;
  /** Frames since the exit begins; omit while the lines are holding. */
  exitLocal?: number;
}> = ({ local, exitLocal }) => {
  const exit =
    exitLocal === undefined
      ? 0
      : interpolate(exitLocal, [0, 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        fontFamily: typography.sans,
        transform: `translateY(${exit * -20}px)`,
        opacity: 1 - exit,
      }}
    >
      {copy.problem.map((line, index) => {
        // 24-frame stagger between the two lines (f288 and f312 in the Hook).
        const start = index * 24;
        const entrance = interpolate(local, [start, start + 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        // Wipes up from behind its own baseline rather than fading in — the
        // type appears to be revealed by something moving, which is what
        // separates a title card from a slide.
        const reveal = interpolate(local, [start, start + 20], [0, 1], {
          easing: Easing.out(Easing.cubic),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <span
            key={line}
            style={{
              display: "block",
              overflow: "hidden",
              paddingBottom: "0.12em",
              clipPath: `inset(0 0 ${(1 - reveal) * 100}% 0)`,
            }}
          >
            <span
              style={{
                display: "block",
                opacity: entrance,
                transform: `translateY(${(1 - reveal) * 26}px)`,
                color: palette.ink,
                fontSize: 110,
                fontWeight: 600,
                letterSpacing: -3,
                lineHeight: 1.08,
              }}
            >
              {line}
            </span>
          </span>
        );
      })}
    </div>
  );
};
