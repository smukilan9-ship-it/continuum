import {
  AbsoluteFill,
  Easing,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { mark, palette, typography } from "./brand";
import { ProblemTypography } from "./hook/Typography";
import { HookWindow } from "./hook/Window";
import { DUPLICATE_COUNT, windows, type WindowSpec } from "./hook/windows-data";
import { Dot } from "./Dot";
import { LightSweep, Vignette, depthOf, motionBlur } from "./vfx";
import {
  GlassSheen,
  GridOverlay,
  InkGrain,
  SignalLines,
  styleParams,
  type HookStyle,
} from "./hook/styles";

/**
 * S0 · Hook — 420 frames (PLAN §3.2).
 *
 * The argument: *you are the sync layer*. One calm question multiplies into a
 * desktop of tools that each see a sliver of the work, and the same context
 * paragraph gets pasted by hand into chat after chat. It cools, freezes on the
 * product's own problem statement, then collapses into a single lime dot that
 * the `Bridge` overlay picks up at film frame 420.
 *
 * All randomness runs through Remotion's seeded `random()` — `Math.random`
 * would desynchronise across render threads and break frame reproducibility.
 */

const FRAME_CENTER_X = 1920 / 2;
const FRAME_CENTER_Y = 1080 / 2;

const PUSH_END = 288;
const ACCEL_START = 240;
const FREEZE_START = 288;
const COLLAPSE_START = 378;
const COLLAPSE_DURATION = 28;
const DOT_START = 404;
const DOT_LANDED = 414;

/** Linear RGB-space-agnostic hex lerp — good enough for a 2-stop paper ramp. */
function lerpHex(from: string, to: string, t: number) {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(from) as [number, number, number];
  const [r2, g2, b2] = parse(to) as [number, number, number];
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`;
}

type PlacedWindow = WindowSpec & { scale: number; opacity: number; blur: number };

/**
 * f240–288: scaled duplicates cascade in behind the real stack so the pile
 * reads as endless rather than countable.
 */
const duplicates: PlacedWindow[] = Array.from({ length: DUPLICATE_COUNT }, (_, index) => {
  const base = windows[Math.floor(random(`dup-base-${index}`) * windows.length)]!;
  return {
    ...base,
    id: `dup-${index}`,
    arriveAt: ACCEL_START + Math.round(random(`dup-when-${index}`) * 42),
    x: -220 + random(`dup-x-${index}`) * 1960,
    y: -160 + random(`dup-y-${index}`) * 1180,
    rotate: -9 + random(`dup-rot-${index}`) * 18,
    z: 0,
    scale: 0.42 + random(`dup-scale-${index}`) * 0.34,
    opacity: 0.42 + random(`dup-op-${index}`) * 0.2,
    blur: 1.2 + random(`dup-blur-${index}`) * 2.2,
  };
});

const stack: PlacedWindow[] = [
  ...duplicates,
  ...windows.map((window) => ({ ...window, scale: 1, opacity: 1, blur: 0 })),
];

const MAX_Z = Math.max(...windows.map((window) => window.z));

const HookWindowLayer: React.FC<{
  spec: PlacedWindow;
  frame: number;
  fps: number;
  /** 0→1 across the camera push; drives how far the parallax opens up. */
  push: number;
  style: HookStyle;
}> = ({ spec, frame, fps, push, style }) => {
  const look = styleParams(style);
  const local = frame - spec.arriveAt;
  if (local < 0) return null;

  const entrance = spring({
    frame: local,
    fps,
    config: { damping: 200 },
    durationInFrames: 18,
  });

  // Every window falls toward frame centre and shrinks to nothing, staggered so
  // the pile implodes rather than snapping.
  const collapseStart = COLLAPSE_START + Math.round(random(`${spec.id}-stagger`) * 8);
  const collapseLinear = interpolate(
    frame,
    [collapseStart, collapseStart + COLLAPSE_DURATION],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const collapse = interpolate(
    frame,
    [collapseStart, collapseStart + COLLAPSE_DURATION],
    [0, 1],
    {
      // PLAN specifies quintic; over a 28-frame window that leaves the pile
      // visually frozen for ~20 frames and then snaps, which reads as a cut
      // rather than a collapse. Cubic keeps the acceleration and stays legible
      // through the middle of the move.
      easing: Easing.in(Easing.cubic),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  // d/dt of a cubic ease-in is 3t², so the smear builds exactly as the window
  // accelerates rather than being keyed by hand.
  const smear = motionBlur(3 * collapseLinear * collapseLinear * 0.5);

  const dx = FRAME_CENTER_X - (spec.x + (spec.width * spec.scale) / 2);
  const dy = FRAME_CENTER_Y - (spec.y + (spec.height * spec.scale) / 2);
  const spin = (random(`${spec.id}-spin`) - 0.5) * 44;

  const intensity = interpolate(frame, [200, 280], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Nearer windows open up faster under the push and sit fractionally softer;
  // the focal plane sits mid-stack. This is what stops nine flat rectangles
  // reading as a collage.
  const depth = depthOf(spec.z, MAX_Z);
  const parallax = 1 + (depth.parallax - 1) * push * look.parallax;
  const defocus = depth.defocus * push * 0.8 * look.defocus;

  const scale = spec.scale * parallax * (0.92 + 0.08 * entrance) * (1 - collapse);
  if (scale <= 0.001) return null;

  const softness = Math.max(spec.blur, defocus);
  const filters = [softness > 0.15 ? `blur(${softness.toFixed(2)}px)` : null, smear]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      style={{
        position: "absolute",
        left: spec.x,
        top: spec.y,
        zIndex: spec.z,
        opacity: spec.opacity * entrance * look.windowOpacity,
        filter: filters || undefined,
        boxShadow: look.glow,
        borderRadius: 11,
        transform: [
          `translate(${dx * collapse}px, ${dy * collapse + (1 - entrance) * 18}px)`,
          `rotate(${spec.rotate + spin * collapse}deg)`,
          `scale(${scale})`,
        ].join(" "),
        transformOrigin: "center center",
      }}
    >
      <HookWindow
        kind={spec.kind}
        app={spec.app}
        title={spec.title}
        subtitle={spec.subtitle}
        // Duplicates are decoration: freeze their content past its reveal so
        // they never draw the eye with motion of their own.
        local={spec.z === 0 ? 90 : local}
        width={spec.width}
        height={spec.height}
        seed={spec.id}
        intensity={intensity}
        pulseContext={spec.id === "chat-3"}
      />
    </div>
  );
};

export const Hook: React.FC<{ style?: HookStyle }> = ({ style = "depth" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Imperceptible push across the whole build (PLAN: 1.00→1.06 over f0–288).
  const pushProgress = interpolate(frame, [0, PUSH_END], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const push = 1 + pushProgress * 0.06;

  // Shake ramps in with the acceleration and dies at the freeze. Driven by
  // smooth 2D noise rather than per-frame randomness so it drifts like a real
  // handheld rig instead of vibrating.
  const shakeAmount =
    interpolate(frame, [ACCEL_START, FREEZE_START], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) *
    interpolate(frame, [FREEZE_START, FREEZE_START + 18], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const shakeX = (random(`shake-x-${Math.floor(frame / 2)}`) - 0.5) * 6 * shakeAmount;
  const shakeY = (random(`shake-y-${Math.floor(frame / 2)}`) - 0.5) * 6 * shakeAmount;

  // The desktop goes cold as it floods, then warms back to brand paper as the
  // pile implodes — the hook must hand off to `Bridge` on exactly
  // `palette.canvas`, or the cut at film frame 420 shows a colour pop.
  const cool = interpolate(
    frame,
    [ACCEL_START, FREEZE_START, COLLAPSE_START, DOT_LANDED],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Ramps out with the cold so the hook hands off on clean paper — Resolve
  // adds ~1.5% grain across the whole film in the grade (PLAN §6) and two
  // grain passes stacked on the handoff frame would read as a texture pop.
  const grain = interpolate(
    frame,
    [ACCEL_START, FREEZE_START, COLLAPSE_START, DOT_LANDED],
    [0, 0.06, 0.06, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // The freeze: the pile stops being legible and becomes texture behind the
  // problem statement.
  const defocus = interpolate(frame, [FREEZE_START, FREEZE_START + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const dotScale = interpolate(frame, [DOT_START, DOT_LANDED], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Breathes and settles back to exactly 12px, which is where `Bridge` picks
  // the dot up on its own frame 0.
  //
  // The settle keyframe is 419, not 420: a 420-frame composition renders frames
  // 0–419, so a keyframe at 420 is one frame past the last one that exists and
  // the dot handed off 5% oversized.
  const breathe = interpolate(frame, [DOT_LANDED, 417, 419], [1, 1.15, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: lerpHex(palette.canvas, palette.canvasCold, cool) }}>
      <AbsoluteFill
        style={{
          transform: `translate(${shakeX}px, ${shakeY}px) scale(${push})`,
          transformOrigin: "center center",
        }}
      >
        <AbsoluteFill
          style={{
            filter: defocus > 0 ? `blur(${defocus * 8}px) saturate(${100 - defocus * 30}%)` : undefined,
          }}
        >
          {stack.map((spec) => (
            <HookWindowLayer
              key={spec.id}
              spec={spec}
              frame={frame}
              fps={fps}
              push={pushProgress}
              style={style}
            />
          ))}
        </AbsoluteFill>
      </AbsoluteFill>

      {frame >= FREEZE_START ? (
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            fontFamily: typography.sans,
          }}
        >
          <ProblemTypography
            local={frame - FREEZE_START}
            exitLocal={frame >= COLLAPSE_START ? frame - COLLAPSE_START : undefined}
          />
        </AbsoluteFill>
      ) : null}

      {/* Film grain, ramping in with the cold. Seeded per frame so renders are
          byte-reproducible across threads. */}
      {grain > 0.001 ? (
        <AbsoluteFill style={{ opacity: grain, mixBlendMode: "multiply" }}>
          <svg width="100%" height="100%">
            <filter id="hook-grain">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.85"
                numOctaves={2}
                seed={Math.floor(random(`grain-${frame}`) * 9973)}
                stitchTiles="stitch"
              />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#hook-grain)" />
          </svg>
        </AbsoluteFill>
      ) : null}

      {style === "grid" ? <GridOverlay opacity={1 - defocus} /> : null}
      {style === "signal" ? <SignalLines frame={frame} opacity={1 - defocus} /> : null}
      {style === "glass" ? <GlassSheen opacity={1 - defocus * 0.6} /> : null}
      {style === "ink" ? <InkGrain frame={frame} opacity={1} /> : null}

      {/* One pass of light as the statement lands — the frame's only flourish,
          and it reads as a light source moving past rather than an overlay. */}
      {style === "depth" || style === "glass" ? (
        <LightSweep
          progress={interpolate(frame, [292, 356], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
          intensity={style === "glass" ? 1 : 0.85}
        />
      ) : null}

      {/* All that mass, compressed. `Bridge` picks this dot up on its own frame
          0 and `Close` re-opens it — hence the shared component. */}
      <Dot scale={dotScale} breathe={breathe} />

      {/* Deepens as the desktop goes cold, then ramps to nothing across the
          collapse — the third effect to do so, for the same reason as `cool`
          and `grain`: `Bridge` draws flat canvas with no vignette, so anything
          still darkening the corners at f419 pops off at the cut. Measured at
          up to 9/255 in the far corner before this ramp existed.

          It costs nothing to lose. By f414 the frame is an empty canvas with
          one dot on it, and a vignette on an empty white field is invisible. */}
      <Vignette
        strength={
          ((style === "grid" ? 0.15 : 0.35) + cool * 0.65) *
          interpolate(frame, [COLLAPSE_START, DOT_LANDED], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
    </AbsoluteFill>
  );
};
