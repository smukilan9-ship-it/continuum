import { interpolate, random } from "remotion";

/**
 * Shared building blocks for the hook's app interfaces.
 *
 * The windows are recreations of real product UI — sidebars, model pickers,
 * composers, deck tables — because a judge recognises their own desktop far
 * faster than an abstraction of one. Everything is drawn in code: no
 * screenshots, no traced assets, and no real account data.
 */

/** The same handful of questions, asked again in every app. That is the joke. */
export const REPEATED_TOPICS = [
  "Arc length vs sector area",
  "Circles in the coordinate plane",
  "Parabola vertex form help",
  "Bluebook mock 4 — Q17",
  "Radians vs degrees",
  "Timed pacing strategy",
] as const;

export const fade = (local: number, at = 4, over = 12) =>
  interpolate(local, [at, at + over], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

/** A grey run of text. Never readable copy — the shape is the information. */
export const Line: React.FC<{
  width: number | string;
  height?: number;
  color?: string;
  opacity?: number;
  radius?: number;
}> = ({ width, height = 8, color = "#e3e3df", opacity = 1, radius }) => (
  <div
    style={{
      width: typeof width === "number" ? `${width}%` : width,
      height,
      borderRadius: radius ?? height / 2,
      backgroundColor: color,
      opacity,
      flexShrink: 0,
    }}
  />
);

/** Assistant answers stream in as ragged grey text. */
export const Paragraph: React.FC<{
  seed: string;
  lines?: number;
  local: number;
  from?: number;
  color?: string;
  gap?: number;
  height?: number;
}> = ({ seed, lines = 5, local, from = 0, color, gap = 9, height = 8 }) => (
  <div style={{ display: "grid", gap }}>
    {Array.from({ length: lines }, (_, index) => (
      <Line
        key={index}
        width={52 + random(`${seed}-${index}`) * 46}
        height={height}
        color={color}
        opacity={fade(local, from + index * 7, 10)}
      />
    ))}
  </div>
);

export const SidebarRow: React.FC<{
  label?: string;
  active?: boolean;
  muted?: string;
  color?: string;
  activeBg?: string;
  icon?: React.ReactNode;
  size?: number;
}> = ({ label, active, color = "#3c3c3a", activeBg = "rgba(0,0,0,0.06)", icon, size = 11 }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 7,
      padding: "5px 8px",
      borderRadius: 6,
      backgroundColor: active ? activeBg : "transparent",
      color,
      fontSize: size,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    }}
  >
    {icon}
    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
  </div>
);

export const SidebarHeading: React.FC<{ label: string; color?: string }> = ({
  label,
  color = "#9a9a95",
}) => (
  <div
    style={{
      padding: "10px 8px 4px",
      fontSize: 9.5,
      fontWeight: 600,
      letterSpacing: 0.4,
      color,
      textTransform: "uppercase",
    }}
  >
    {label}
  </div>
);

/** Circular avatar with an initial — every one of these apps has one. */
export const Avatar: React.FC<{ color?: string; letter?: string; size?: number }> = ({
  color = "#8a8f86",
  letter = "M",
  size = 18,
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: color,
      color: "#ffffff",
      fontSize: size * 0.5,
      fontWeight: 600,
      display: "grid",
      placeItems: "center",
      flexShrink: 0,
    }}
  >
    {letter}
  </div>
);

export const Chevron: React.FC<{ color?: string; size?: number }> = ({
  color = "#8e8e8a",
  size = 8,
}) => (
  <svg width={size} height={size * 0.6} viewBox="0 0 10 6" style={{ flexShrink: 0 }}>
    <path d="M1 1.5 5 5l4-3.5" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const PlusGlyph: React.FC<{ color?: string; size?: number }> = ({
  color = "#6b6b67",
  size = 12,
}) => (
  <svg width={size} height={size} viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
    <path d="M7 2v10M2 7h10" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const SendGlyph: React.FC<{ color?: string; size?: number }> = ({
  color = "#ffffff",
  size = 12,
}) => (
  <svg width={size} height={size} viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
    <path d="M7 11.5V3M3.2 6.6 7 2.8l3.8 3.8" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
