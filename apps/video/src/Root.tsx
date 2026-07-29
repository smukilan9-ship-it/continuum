import { Composition, Still } from "remotion";

import { Bridge } from "./Bridge";
import { CaptureSlate } from "./CaptureSlate";
import { Close } from "./Close";
import { Hook } from "./Hook";
import { HOOK_STYLES, type HookStyle } from "./hook/styles";
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
      {/* S0 — 0:00–0:14. Look: "depth" (chosen 2026-07-29 over grid / signal /
          glass / ink — see src/hook/styles.tsx for the alternatives). */}
      <Composition
        id="Hook"
        component={Hook}
        durationInFrames={420}
        defaultProps={{ style: "depth" as const }}
        {...format}
      />

      {/* One per look, so all five can be compared frame-for-frame. Structure,
          timing and copy are identical — only the finishing differs. */}
      {(Object.keys(HOOK_STYLES) as HookStyle[]).map((style) => (
        <Composition
          key={style}
          id={`Hook-${style}`}
          component={Hook}
          durationInFrames={420}
          defaultProps={{ style }}
          {...format}
        />
      ))}

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

      {/* Stand-in for the Phase B captures, so the film can be watched end to
          end before any footage exists. Not part of the deliverable. */}
      <Composition
        id="CaptureSlate"
        component={CaptureSlate}
        durationInFrames={2850}
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
