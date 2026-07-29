import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { palette, typography } from "./brand";
import { Vignette } from "./vfx";

/**
 * Stand-in for the Phase B captures, so the film can be watched end to end
 * before a frame of footage exists.
 *
 * It is not a mockup of the product — it names the segment and shows the
 * timecode, and nothing else. Anything more would invite judging shots that
 * have not been filmed yet, and would risk being mistaken for the real UI.
 *
 * Covers film frames 420 → 3270 (0:14 → 1:49).
 */

const OFFSET = 420;

const segments = [
  { at: 420, name: "Today", note: "next action, decided" },
  { at: 630, name: "Learn", note: "best resource → concept map → weakness caught" },
  { at: 1020, name: "Plan", note: "outcomes, deadlines, proof" },
  { at: 1170, name: "Library", name2: "★", note: "OpenAlex → citation graph → Zotero → PDF ingest" },
  { at: 1650, name: "Research", note: "claims tied to sources" },
  { at: 1770, name: "Obsidian Sync", name2: "★", note: "the note crosses the app boundary" },
  { at: 2010, name: "Memory", note: "retrieved by relevance" },
  { at: 2190, name: "Code", note: "run → traceback → source-aware fix" },
  { at: 2400, name: "Connections", note: "scoped MCP · NotebookLM · Ollama · YouTube" },
  { at: 2550, name: "Assistant", name2: "★", note: "proposes the session" },
  { at: 2820, name: "Review", note: "approve" },
  { at: 2910, name: "Claude Desktop", name2: "★", note: "answers over MCP, nothing pasted" },
  { at: 3210, name: "Synchronized", note: "the loop closes" },
];

function timecode(frame: number) {
  const total = Math.floor(frame / 30);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export const CaptureSlate: React.FC = () => {
  const frame = useCurrentFrame();
  const filmFrame = frame + OFFSET;

  let index = 0;
  for (let i = 0; i < segments.length; i += 1) {
    if (filmFrame >= segments[i]!.at) index = i;
  }
  const current = segments[index]!;
  const next = segments[index + 1];
  const localFrame = filmFrame - current.at;
  const segmentLength = (next ? next.at : 3270) - current.at;

  const entrance = interpolate(localFrame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const progress = localFrame / segmentLength;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: palette.paper,
        fontFamily: typography.sans,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "grid", justifyItems: "center", gap: 18, opacity: entrance }}>
        <span style={{ fontSize: 15, letterSpacing: 3, color: palette.subtle }}>
          CAPTURE PENDING · {timecode(current.at)}
        </span>
        <span
          style={{
            fontSize: 82,
            fontWeight: 600,
            letterSpacing: -2,
            color: palette.ink,
            display: "flex",
            alignItems: "baseline",
            gap: 16,
          }}
        >
          {current.name}
          {current.name2 ? (
            <span style={{ fontSize: 34, color: palette.accent }}>{current.name2}</span>
          ) : null}
        </span>
        <span style={{ fontSize: 24, color: palette.muted }}>{current.note}</span>
      </div>

      {/* Progress through the current segment — makes the pacing legible. */}
      <div
        style={{
          position: "absolute",
          left: "22%",
          right: "22%",
          bottom: "26%",
          height: 2,
          backgroundColor: palette.border,
        }}
      >
        <div
          style={{
            width: `${Math.min(progress, 1) * 100}%`,
            height: "100%",
            backgroundColor: palette.emerald,
          }}
        />
      </div>

      <Vignette strength={0.3} />
    </AbsoluteFill>
  );
};
