import { AbsoluteFill, interpolate, random } from "remotion";

import { palette } from "../brand";
import { windows } from "./windows-data";

/**
 * Five interchangeable looks for the hook.
 *
 * Structure, timing and copy are identical across all of them — only the
 * finishing changes. That keeps the choice purely a taste decision: whichever
 * wins drops in without touching a single frame number.
 */

export type HookStyle = "depth" | "grid" | "signal" | "glass" | "ink";

export const HOOK_STYLES: Record<HookStyle, { label: string; blurb: string }> = {
  depth: {
    label: "Depth — photographic",
    blurb: "Parallax stack, defocus, motion blur, light sweep, bloom. Feels shot rather than drawn.",
  },
  grid: {
    label: "Grid — Swiss / editorial",
    blurb: "Visible baseline grid, registration marks, everything crisp. Precise and engineered.",
  },
  signal: {
    label: "Signal — the thesis, drawn",
    blurb: "Lime lines physically connect the identical context blocks. Makes 'you are the sync layer' literal.",
  },
  glass: {
    label: "Glass — frosted panes",
    blurb: "Translucent windows, frosted layering, edge light. Vision Pro / Sonoma.",
  },
  ink: {
    label: "Ink — printed matter",
    blurb: "Heavy paper grain, warm cast, soft edges. Feels like a printed page rather than a screen.",
  },
};

/** Per-style knobs the window layer reads. */
export function styleParams(style: HookStyle) {
  return {
    defocus: style === "grid" ? 0 : style === "ink" ? 0.5 : 1,
    parallax: style === "grid" ? 0.35 : 1,
    windowOpacity: style === "glass" ? 0.82 : 1,
    border:
      style === "grid"
        ? `1px solid ${palette.ink}`
        : style === "glass"
          ? "1px solid rgba(255,255,255,0.85)"
          : undefined,
    glow: style === "glass" ? "0 0 0 1px rgba(255,255,255,0.5), 0 24px 60px rgba(16,21,17,0.18)" : undefined,
  };
}

/** Swiss: a visible column grid plus corner registration marks. */
export const GridOverlay: React.FC<{ opacity: number }> = ({ opacity }) => (
  <AbsoluteFill style={{ pointerEvents: "none", opacity: opacity * 0.5 }}>
    <svg width="1920" height="1080">
      {Array.from({ length: 13 }, (_, i) => (
        <line
          key={`c${i}`}
          x1={64 + i * 149}
          y1={0}
          x2={64 + i * 149}
          y2={1080}
          stroke={palette.border}
          strokeWidth="1"
        />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <line
          key={`r${i}`}
          x1={0}
          y1={60 + i * 140}
          x2={1920}
          y2={60 + i * 140}
          stroke={palette.border}
          strokeWidth="1"
        />
      ))}
      {windows.map((w) => (
        <g key={w.id} stroke={palette.emerald} strokeWidth="1.2" opacity="0.75">
          <path d={`M${w.x - 12} ${w.y} H${w.x + 12} M${w.x} ${w.y - 12} V${w.y + 12}`} />
          <path
            d={`M${w.x + w.width - 12} ${w.y + w.height} H${w.x + w.width + 12} M${w.x + w.width} ${w.y + w.height - 12} V${w.y + w.height + 12}`}
          />
        </g>
      ))}
    </svg>
  </AbsoluteFill>
);

/**
 * Signal: draws the argument.
 *
 * A lime path runs from the first chat to each window that received the same
 * pasted context, with a node at every landing. It turns "the human is the
 * sync layer" from a thing the viewer infers into a thing they see.
 */
export const SignalLines: React.FC<{ frame: number; opacity: number }> = ({ frame, opacity }) => {
  const source = windows.find((w) => w.id === "chat-1")!;
  const targets = windows.filter((w) => w.kind === "context");
  const from = { x: source.x + source.width / 2, y: source.y + source.height / 2 };

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity }}>
      <svg width="1920" height="1080">
        {targets.map((target) => {
          const to = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
          // Draws as the window arrives, then holds.
          const draw = interpolate(frame, [target.arriveAt, target.arriveAt + 26], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          if (draw <= 0) return null;
          const midX = (from.x + to.x) / 2;
          const bow = (random(`${target.id}-bow`) - 0.5) * 220;
          const path = `M${from.x} ${from.y} Q${midX + bow} ${(from.y + to.y) / 2 - 140} ${to.x} ${to.y}`;
          const length = Math.hypot(to.x - from.x, to.y - from.y) * 1.3;
          return (
            <g key={target.id}>
              <path
                d={path}
                fill="none"
                stroke={palette.accent}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={length}
                strokeDashoffset={length * (1 - draw)}
                opacity={0.9}
              />
              <circle cx={to.x} cy={to.y} r={7 * draw} fill={palette.accent} />
            </g>
          );
        })}
        <circle cx={from.x} cy={from.y} r={7} fill={palette.accent} opacity={0.9} />
      </svg>
    </AbsoluteFill>
  );
};

/** Glass: a cool sheen over the stack so the panes read as layered material. */
export const GlassSheen: React.FC<{ opacity: number }> = ({ opacity }) => (
  <AbsoluteFill style={{ pointerEvents: "none", opacity: opacity * 0.55 }}>
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(148deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 34%, rgba(180,205,220,0.16) 68%, rgba(255,255,255,0.34) 100%)",
      }}
    />
  </AbsoluteFill>
);

/** Ink: dense paper tooth and a warm cast. */
export const InkGrain: React.FC<{ frame: number; opacity: number }> = ({ frame, opacity }) => (
  <>
    <AbsoluteFill style={{ pointerEvents: "none", opacity: opacity * 0.3, mixBlendMode: "multiply" }}>
      <svg width="100%" height="100%">
        <filter id="ink-tooth">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.62"
            numOctaves={3}
            seed={Math.floor(random(`ink-${frame}`) * 9973)}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#ink-tooth)" />
      </svg>
    </AbsoluteFill>
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        backgroundColor: "#e8dcc4",
        mixBlendMode: "multiply",
        opacity: opacity * 0.16,
      }}
    />
  </>
);
