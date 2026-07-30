import { interpolate } from "remotion";

import { palette, shadow, typography } from "../brand";
import { AppIcon, type AppId } from "./AppIcon";
import { AnkiUI } from "./ui/Anki";
import { ChatGPTUI } from "./ui/ChatGPT";
import { ClaudeUI } from "./ui/Claude";
import { GeminiUI } from "./ui/Gemini";
import { NotionUI } from "./ui/Notion";
import { PreviewUI } from "./ui/Preview";
import { SafariUI } from "./ui/Safari";
import { Line, fade } from "./ui/primitives";
import { TERMINAL_LINES, type WindowKind } from "./windows-data";

/**
 * A single desktop window in the hook.
 *
 * Each body is a recreation of the real product interface — sidebar, model
 * picker, composer, deck table — drawn in code. Recognition is the job: a judge
 * should see their own desktop, not an abstraction of one, and they get about
 * two seconds to do it.
 *
 * Copy discipline is unchanged. Only three strings are meant to be read — the
 * opening question, the context paste, and the traceback. Everything else is
 * chrome, labels, or grey runs: the shape of overload, not its text.
 */

const TITLE_BAR_HEIGHT = 30;

type BodyProps = { local: number; seed: string; pulse?: boolean };

const TerminalBody: React.FC<BodyProps> = ({ local }) => (
  <div
    style={{
      height: "100%",
      padding: "14px 16px",
      display: "grid",
      gap: 7,
      alignContent: "start",
      fontFamily: 'ui-monospace, Menlo, Monaco, "SF Mono", monospace',
      fontSize: 14,
      lineHeight: 1.4,
    }}
  >
    {TERMINAL_LINES.map((line, index) => {
      const color =
        line.tone === "error" ? "#ff6b5e" : line.tone === "prompt" ? "#e8ebe6" : "#8d968c";
      return (
        <div
          key={line.text}
          style={{ color, opacity: fade(local, 6 + index * 5, 6), whiteSpace: "pre" }}
        >
          {line.text}
        </div>
      );
    })}
    <div style={{ display: "flex", gap: 6, opacity: fade(local, 34, 6) }}>
      <span style={{ color: "#e8ebe6" }}>$</span>
      <span
        style={{
          width: 8,
          height: 15,
          backgroundColor: "#e8ebe6",
          opacity: Math.floor(local / 12) % 2 === 0 ? 1 : 0,
        }}
      />
    </div>
  </div>
);

/** macOS Calendar, week view, with the exam sitting on Friday. */
const CalendarBody: React.FC<BodyProps> = ({ local }) => {
  const shown = fade(local, 3, 12);
  return (
    <div style={{ height: "100%", padding: "10px 12px", display: "grid", gap: 8, opacity: shown }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: palette.ink }}>October 2026</span>
        <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: "1px solid #dcdcd8" }}>
          {["Day", "Week", "Month"].map((view) => (
            <span
              key={view}
              style={{
                padding: "2px 8px",
                fontSize: 8.5,
                backgroundColor: view === "Week" ? "#e5484d" : "#ffffff",
                color: view === "Week" ? "#ffffff" : "#6b6b67",
              }}
            >
              {view}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {[
          { day: "MON", date: 12 },
          { day: "TUE", date: 13 },
          { day: "WED", date: 14 },
          { day: "THU", date: 15 },
          { day: "FRI", date: 16 },
        ].map((column) => (
          <div key={column.day} style={{ display: "grid", gap: 3, justifyItems: "center" }}>
            <span style={{ fontSize: 7.5, letterSpacing: 0.6, color: "#8d8d89" }}>{column.day}</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: column.date === 16 ? 700 : 400,
                color: column.date === 16 ? "#e5484d" : "#2b2b29",
              }}
            >
              {column.date}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, alignItems: "start" }}>
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            key={index}
            style={{
              height: 52,
              borderRadius: 5,
              border: "1px solid #ececea",
              padding: 4,
              display: "grid",
              gap: 3,
              alignContent: "start",
            }}
          >
            {index === 4 ? (
              <div
                style={{
                  padding: "3px 5px",
                  borderRadius: 3,
                  backgroundColor: "#e5484d",
                  color: "#ffffff",
                  fontSize: 7.5,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                EE-201 EXAM
              </div>
            ) : (
              <Line width={78} height={5} color="#e8e8e5" />
            )}
            {index === 2 ? <Line width={62} height={5} color="#cfe0f0" /> : null}
          </div>
        ))}
      </div>

      <span style={{ fontSize: 9.5, color: palette.muted }}>EE-201 EXAM — Fri 16 Oct, 9:00 AM</span>
    </div>
  );
};

const bodies: Record<WindowKind, React.FC<BodyProps & { app: AppId }>> = {
  chat: ({ local, seed }) => <ChatGPTUI local={local} seed={seed} />,
  pdf: ({ local, seed }) => <PreviewUI local={local} seed={seed} />,
  notes: ({ local, seed }) => <NotionUI local={local} seed={seed} />,
  // Both context windows receive the identical paste; only the vendor differs.
  context: ({ local, seed, pulse, app }) =>
    app === "gemini" ? (
      <GeminiUI local={local} seed={seed} pulse={pulse} />
    ) : (
      <ClaudeUI local={local} seed={seed} pulse={pulse} />
    ),
  browser: ({ local, seed }) => <SafariUI local={local} seed={seed} />,
  flashcards: ({ local }) => <AnkiUI local={local} />,
  terminal: TerminalBody,
  calendar: CalendarBody,
};

export const HookWindow: React.FC<{
  kind: WindowKind;
  app: AppId;
  title: string;
  subtitle?: string;
  local: number;
  width: number;
  height: number;
  seed: string;
  /** 0→1 as the desktop accelerates; deepens the shadow. */
  intensity: number;
  pulseContext?: boolean;
}> = ({ kind, app, title, subtitle, local, width, height, seed, intensity, pulseContext }) => {
  const dark = kind === "terminal";
  const Body = bodies[kind];

  return (
    <div
      style={{
        width,
        height,
        borderRadius: 11,
        overflow: "hidden",
        backgroundColor: dark ? palette.markInk : palette.surface,
        border: `1px solid ${dark ? "#2a2c26" : "#dcdcd8"}`,
        boxShadow: intensity > 0.5 ? shadow.cardDeep : shadow.card,
        fontFamily: typography.sans,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: TITLE_BAR_HEIGHT,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "0 11px",
          backgroundColor: dark ? "#1f211b" : "#ececeb",
          borderBottom: `1px solid ${dark ? "#2a2c26" : "#e0e0dd"}`,
        }}
      >
        <div style={{ display: "flex", gap: 5.5, flexShrink: 0 }}>
          {["#ec6a5e", "#f4bf4f", "#61c554"].map((color) => (
            <span
              key={color}
              style={{ width: 8.5, height: 8.5, borderRadius: 5, backgroundColor: color }}
            />
          ))}
        </div>
        <AppIcon app={app} size={15} />
        <span
          style={{
            display: "flex",
            gap: 7,
            minWidth: 0,
            fontSize: 11,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          <b
            style={{
              fontWeight: 600,
              color: dark ? "#c8cfc6" : "#2b2b29",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </b>
          {subtitle ? (
            <span
              style={{
                color: dark ? "#8d968c" : "#8a8a86",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {subtitle}
            </span>
          ) : null}
        </span>
      </div>

      {/* No padding here — every app body brings its own chrome. */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Body local={local} seed={seed} pulse={pulseContext} app={app} />
      </div>
    </div>
  );
};

/** Kept for the type re-export consumers rely on. */
export type { WindowKind };
