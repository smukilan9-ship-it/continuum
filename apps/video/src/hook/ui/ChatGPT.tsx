import { interpolate } from "remotion";

import { OPENING_QUESTION } from "../windows-data";
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
 * ChatGPT — the app the student opens first (PLAN §3.2 S0, f0).
 *
 * Grey sidebar, centred conversation column, user turn in a rounded bubble on
 * the right, assistant turn as bare text, pill composer pinned to the bottom.
 * Recreated in code rather than screenshotted: no third-party assets and no
 * real account data end up in the film.
 */

const TYPE_START = 6;
const TYPE_DURATION = 54;
const INK = "#0d0d0d";
const SIDEBAR = "#f9f9f9";

export const ChatGPTUI: React.FC<{ local: number; seed: string }> = ({ local, seed }) => {
  const typed = Math.round(
    interpolate(local, [TYPE_START, TYPE_START + TYPE_DURATION], [0, OPENING_QUESTION.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const caret = local < TYPE_START + TYPE_DURATION + 8 && Math.floor(local / 8) % 2 === 0;

  return (
    <div style={{ display: "flex", height: "100%", backgroundColor: "#ffffff", color: INK }}>
      <aside
        style={{
          width: 186,
          flexShrink: 0,
          backgroundColor: SIDEBAR,
          borderRight: "1px solid #ececec",
          padding: "10px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <SidebarRow
          label="New chat"
          icon={<PlusGlyph size={11} />}
          color="#0d0d0d"
          size={11.5}
        />
        <SidebarRow
          label="Search chats"
          size={11.5}
          color="#5d5d5b"
          icon={
            <svg width="11" height="11" viewBox="0 0 12 12">
              <circle cx="5" cy="5" r="3.6" fill="none" stroke="#5d5d5b" strokeWidth="1.3" />
              <path d="M7.8 7.8 10.5 10.5" stroke="#5d5d5b" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
        />
        <SidebarHeading label="Chats" />
        {REPEATED_TOPICS.slice(0, 5).map((topic, index) => (
          <SidebarRow key={topic} label={topic} active={index === 0} color="#3d3d3b" size={11} />
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px" }}>
          <Avatar size={17} color="#6c6c6a" />
          <span style={{ fontSize: 11, color: "#3d3d3b" }}>Free plan</span>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600 }}>
            ChatGPT <span style={{ color: "#8e8e8a", fontWeight: 400 }}>5</span>
            <Chevron />
          </div>
          <Avatar size={19} color="#10a37f" />
        </header>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            padding: "6px 26px 0",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              alignSelf: "flex-end",
              maxWidth: "82%",
              padding: "9px 14px",
              borderRadius: 18,
              backgroundColor: "#f4f4f4",
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            {OPENING_QUESTION.slice(0, typed)}
            <span style={{ opacity: caret ? 1 : 0 }}>|</span>
          </div>

          {/* The assistant avatar arrives with its first line — floating alone
              above an empty column reads as a rendering bug. */}
          <div style={{ display: "flex", gap: 10, paddingRight: "8%", opacity: fade(local, 62, 6) }}>
            <svg width="17" height="17" viewBox="0 0 22 22" style={{ flexShrink: 0, marginTop: 1 }}>
              <path
                d="M11 3.4 17.6 7.2v7.6L11 18.6 4.4 14.8V7.2Z"
                fill="none"
                stroke="#0d0d0d"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Paragraph seed={`${seed}-gpt`} lines={5} local={local} from={64} height={8} />
            </div>
          </div>
        </div>

        <div style={{ padding: "10px 26px 14px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 12px",
              borderRadius: 24,
              border: "1px solid #e3e3e0",
              backgroundColor: "#ffffff",
              opacity: fade(local, 8, 10),
            }}
          >
            <PlusGlyph size={13} color="#8e8e8a" />
            <span style={{ flex: 1, fontSize: 12.5, color: "#9b9b97" }}>Ask anything</span>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: "#0d0d0d",
                display: "grid",
                placeItems: "center",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 14 14">
                <path
                  d="M7 11V3.4M3.4 7 7 3.4 10.6 7"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
