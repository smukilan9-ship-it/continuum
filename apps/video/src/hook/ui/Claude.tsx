import { interpolate } from "remotion";

import { CONTEXT_PASTE } from "../windows-data";
import {
  Avatar,
  Chevron,
  Paragraph,
  PlusGlyph,
  REPEATED_TOPICS,
  SidebarHeading,
  SidebarRow,
  fade,
} from "./primitives";

/**
 * Claude — warm ivory canvas, beige sidebar, coral send button (f120).
 *
 * This window carries the film's thesis and its longest-range setup. The
 * context block is pasted in by hand here; at 1:37 the same app answers from
 * Continuum's memory over MCP with nothing pasted at all.
 *
 * The lime sweep across the paste is the only accent colour in the hook —
 * spent on the one idea the segment exists to plant.
 */

const CANVAS = "#faf9f5";
const SIDEBAR = "#f0eee6";
const INK = "#1f1e1c";
const CORAL = "#d97757";

export const ClaudeUI: React.FC<{ local: number; seed: string; pulse?: boolean }> = ({
  local,
  seed,
  pulse = false,
}) => {
  const pasted = fade(local, 6, 6);
  const sweep = interpolate(local, [10, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pulseAmount = pulse
    ? interpolate(local, [44, 54, 64], [0, 0.5, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <div style={{ display: "flex", height: "100%", backgroundColor: CANVAS, color: INK }}>
      <aside
        style={{
          width: 196,
          flexShrink: 0,
          backgroundColor: SIDEBAR,
          padding: "10px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 8px 10px" }}>
          <svg width="15" height="15" viewBox="0 0 22 22">
            <g stroke={CORAL} strokeWidth="1.9" strokeLinecap="round">
              <path d="M11 4.4v4.2M11 13.4v4.2M4.4 11h4.2M13.4 11h4.2" />
              <path d="M6.6 6.6 9.5 9.5M12.5 12.5l2.9 2.9M15.4 6.6 12.5 9.5M9.5 12.5l-2.9 2.9" />
            </g>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.2 }}>Claude</span>
        </div>
        <SidebarRow
          label="New chat"
          icon={<PlusGlyph size={11} color={CORAL} />}
          color={INK}
          size={11.5}
          activeBg="rgba(217,119,87,0.12)"
        />
        <SidebarRow label="Chats" size={11.5} color="#5c5a54" />
        <SidebarRow label="Projects" size={11.5} color="#5c5a54" />
        <SidebarHeading label="Recents" color="#8f8b81" />
        {REPEATED_TOPICS.slice(0, 4).map((topic, index) => (
          <SidebarRow
            key={topic}
            label={topic}
            active={index === 0}
            color="#44423d"
            size={11}
            activeBg="rgba(0,0,0,0.05)"
          />
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px" }}>
          <Avatar size={17} color={CORAL} />
          <span style={{ fontSize: 11, color: "#5c5a54" }}>Pro plan</span>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header style={{ display: "flex", justifyContent: "flex-end", padding: "10px 16px 4px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11.5,
              color: "#6b6862",
            }}
          >
            Claude Opus 4.5 <Chevron color="#6b6862" />
          </div>
        </header>

        <div style={{ flex: 1, minHeight: 0, padding: "4px 22px 0", display: "grid", gap: 14, alignContent: "start" }}>
          <div
            style={{
              position: "relative",
              padding: "12px 14px",
              borderRadius: 12,
              backgroundColor: "#f2f0e9",
              border: "1px solid #e6e2d6",
              opacity: pasted,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 12,
                background: "#f5a623",
                opacity: Math.max(0.32 * (1 - sweep), pulseAmount),
                clipPath: `inset(0 ${(1 - Math.min(sweep * 1.4, 1)) * 100}% 0 0)`,
              }}
            />
            <p
              style={{
                position: "relative",
                margin: 0,
                fontSize: 14,
                lineHeight: 1.5,
                letterSpacing: -0.1,
              }}
            >
              {CONTEXT_PASTE}
            </p>
          </div>

          <div style={{ paddingRight: "6%" }}>
            <Paragraph seed={`${seed}-claude`} lines={4} local={local} from={30} color="#dedbd1" />
          </div>
        </div>

        <div style={{ padding: "8px 22px 14px" }}>
          <div
            style={{
              borderRadius: 14,
              border: "1px solid #e0dccf",
              backgroundColor: "#ffffff",
              padding: "10px 12px 8px",
              display: "grid",
              gap: 10,
              opacity: fade(local, 8, 10),
            }}
          >
            <span style={{ fontSize: 12.5, color: "#a09c92" }}>Reply to Claude…</span>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <PlusGlyph size={12} color="#8f8b81" />
                <span style={{ fontSize: 10.5, color: "#8f8b81" }}>Claude Opus 4.5</span>
                <Chevron color="#8f8b81" size={7} />
              </div>
              <div
                style={{
                  width: 21,
                  height: 21,
                  borderRadius: 6,
                  backgroundColor: CORAL,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 14 14">
                  <path
                    d="M7 11V3.4M3.4 7 7 3.4 10.6 7"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
