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
 * Gemini — Material surfaces, blue-tinted sidebar, pill composer (f213).
 *
 * The second window to receive the identical context block. Two different
 * vendors, the same paragraph, typed by the same person: the human is doing
 * the syncing.
 */

const SIDEBAR = "#f0f4f9";
const INK = "#1f1f1f";
const BLUE = "#0b57d0";

export const GeminiUI: React.FC<{ local: number; seed: string; pulse?: boolean }> = ({
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
    <div style={{ display: "flex", height: "100%", backgroundColor: "#ffffff", color: INK }}>
      <aside
        style={{
          width: 174,
          flexShrink: 0,
          backgroundColor: SIDEBAR,
          padding: "10px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div style={{ padding: "2px 8px 8px" }}>
          <svg width="14" height="14" viewBox="0 0 22 22">
            <path
              d="M11 3.6c0 4.1 3.3 7.4 7.4 7.4-4.1 0-7.4 3.3-7.4 7.4 0-4.1-3.3-7.4-7.4-7.4 4.1 0 7.4-3.3 7.4-7.4Z"
              fill={BLUE}
            />
          </svg>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            alignSelf: "flex-start",
            padding: "6px 12px",
            borderRadius: 16,
            backgroundColor: "#dde3ea",
            fontSize: 11.5,
            color: "#3c4043",
          }}
        >
          <PlusGlyph size={11} color="#3c4043" />
          New chat
        </div>
        <SidebarHeading label="Recent" color="#5f6368" />
        {REPEATED_TOPICS.slice(0, 4).map((topic, index) => (
          <SidebarRow
            key={topic}
            label={topic}
            active={index === 0}
            color="#3c4043"
            size={11}
            activeBg="#d3e3fd"
          />
        ))}
        <div style={{ flex: 1 }} />
        <SidebarRow label="Settings & help" color="#5f6368" size={11} />
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px 4px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: "#5f6368" }}>Gemini</span>
            <span style={{ fontSize: 11, color: "#80868b" }}>2.5 Pro</span>
            <Chevron color="#80868b" />
          </div>
          <Avatar size={19} color={BLUE} />
        </header>

        <div style={{ flex: 1, minHeight: 0, padding: "4px 18px 0", display: "grid", gap: 12, alignContent: "start" }}>
          <div
            style={{
              position: "relative",
              justifySelf: "end",
              maxWidth: "94%",
              padding: "10px 14px",
              borderRadius: 16,
              backgroundColor: "#f0f4f9",
              opacity: pasted,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 16,
                background: "#d9ff2f",
                opacity: Math.max(0.32 * (1 - sweep), pulseAmount),
                clipPath: `inset(0 ${(1 - Math.min(sweep * 1.4, 1)) * 100}% 0 0)`,
              }}
            />
            <p style={{ position: "relative", margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
              {CONTEXT_PASTE}
            </p>
          </div>

          <div style={{ display: "flex", gap: 9, paddingRight: "10%" }}>
            <svg width="15" height="15" viewBox="0 0 22 22" style={{ flexShrink: 0, marginTop: 1 }}>
              <path
                d="M11 3.6c0 4.1 3.3 7.4 7.4 7.4-4.1 0-7.4 3.3-7.4 7.4 0-4.1-3.3-7.4-7.4-7.4 4.1 0 7.4-3.3 7.4-7.4Z"
                fill={BLUE}
              />
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Paragraph seed={`${seed}-gem`} lines={3} local={local} from={30} color="#e1e4e8" />
            </div>
          </div>
        </div>

        <div style={{ padding: "8px 18px 12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 14px",
              borderRadius: 24,
              backgroundColor: "#f0f4f9",
              opacity: fade(local, 8, 10),
            }}
          >
            <span style={{ flex: 1, fontSize: 12.5, color: "#80868b" }}>Ask Gemini</span>
            <PlusGlyph size={12} color="#5f6368" />
            <svg width="12" height="12" viewBox="0 0 14 14">
              <rect x="5" y="1.5" width="4" height="7" rx="2" fill="#5f6368" />
              <path d="M3 7a4 4 0 0 0 8 0M7 11v1.5" stroke="#5f6368" strokeWidth="1.3" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
