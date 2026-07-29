import { Composition, Still } from "remotion";

import { Bridge } from "./Bridge";
import { Close } from "./Close";
import { Hook } from "./Hook";
import { Label, calculateLabelMetadata, type LabelProps } from "./Label";
import { LogoReveal } from "./LogoReveal";
import { ProblemLines } from "./ProblemLines";
import { labels } from "./labels-data";

/**
 * 1920x1080 @ 30fps is the master format for every Remotion segment, so the
 * renders drop straight onto the DaVinci Resolve timeline next to the OBS
 * takes. Durations here are load-bearing — `scripts/render-all.mjs` asserts
 * them against the master timeline (PLAN §3.1) and fails the build on drift.
 */

const format = { fps: 30, width: 1920, height: 1080 } as const;

export const Root: React.FC = () => {
  return (
    <>
      {/* S0 — 0:00–0:14 */}
      <Composition id="Hook" component={Hook} durationInFrames={420} {...format} />

      {/* S1 — 0:14–0:15.5, alpha overlay on the head of cap_today */}
      <Composition id="Bridge" component={Bridge} durationInFrames={45} {...format} />

      {/* S4 — 1:49–2:00 */}
      <Composition id="Close" component={Close} durationInFrames={330} {...format} />

      {/* Safety cutaway, not placed on the timeline by default */}
      <Composition
        id="ProblemLines"
        component={ProblemLines}
        durationInFrames={150}
        {...format}
      />

      {/* One alpha overlay per feature label; duration comes from labels-data */}
      <Composition
        id="Label"
        component={Label}
        durationInFrames={150}
        defaultProps={{ labelId: labels[0]!.id }}
        calculateMetadata={calculateLabelMetadata}
        {...format}
      />

      {/* Legacy standalone sting — superseded by Close, kept for stills/socials */}
      <Composition
        id="LogoReveal"
        component={LogoReveal}
        durationInFrames={180}
        {...format}
      />

      {/* Poster frame candidate for the thumbnail (PLAN §6 Deliver) */}
      <Still id="Poster" component={Close} {...format} />
    </>
  );
};
