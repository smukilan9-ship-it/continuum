import { random } from "remotion";

import { Line, SidebarRow, fade } from "./primitives";

/**
 * Notion — page tree in a warm grey sidebar, blocks in the body (f96).
 *
 * The `_FINAL_v3` filename and the sibling `_v2` page are doing narrative
 * work: this student has already re-made these notes twice.
 */
export const NotionUI: React.FC<{ local: number; seed: string }> = ({ local, seed }) => {
  const shown = fade(local, 3, 12);

  return (
    <div style={{ height: "100%", display: "flex", backgroundColor: "#ffffff", opacity: shown }}>
      <aside
        style={{
          width: 142,
          flexShrink: 0,
          backgroundColor: "#f7f7f5",
          borderRight: "1px solid #ededeb",
          padding: "9px 6px",
          display: "grid",
          gap: 1,
          alignContent: "start",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 7px 8px" }}>
          <div
            style={{
              width: 15,
              height: 15,
              borderRadius: 3,
              backgroundColor: "#111111",
              color: "#ffffff",
              fontSize: 9,
              fontWeight: 700,
              display: "grid",
              placeItems: "center",
              fontFamily: "Georgia, serif",
            }}
          >
            N
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#37352f" }}>EE Notes</span>
        </div>
        <SidebarRow label="Search" size={10.5} color="#6b6a65" />
        <SidebarRow label="Home" size={10.5} color="#6b6a65" />
        <SidebarRow label="Inbox" size={10.5} color="#6b6a65" />
        <div style={{ height: 7 }} />
        <SidebarRow label="📘  EE-201" size={10.5} color="#37352f" />
        <SidebarRow label="📝  exam_notes_FINAL_v3" size={10.5} color="#37352f" active activeBg="rgba(0,0,0,0.05)" />
        <SidebarRow label="📝  exam_notes_v2" size={10.5} color="#8b8a84" />
        <SidebarRow label="📅  Study plan" size={10.5} color="#37352f" />
        <SidebarRow label="🔗  Paper links" size={10.5} color="#37352f" />
      </aside>

      <div style={{ flex: 1, minWidth: 0, padding: "16px 20px", display: "grid", gap: 12, alignContent: "start" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#37352f", letterSpacing: -0.4 }}>
          exam_notes_FINAL_v3
        </div>

        {[0, 1, 2].map((bullet) => (
          <div key={bullet} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <span style={{ marginTop: 4, width: 5, height: 5, borderRadius: 3, backgroundColor: "#37352f", flexShrink: 0 }} />
            <div style={{ display: "grid", gap: 5, flex: 1, minWidth: 0 }}>
              <Line width={72 + random(`${seed}-n${bullet}`) * 26} height={7} color="#e6e6e3" />
              <Line width={38 + random(`${seed}-n2${bullet}`) * 26} height={7} color="#eeeeeb" />
            </div>
          </div>
        ))}

        <div
          style={{
            display: "flex",
            gap: 9,
            padding: "9px 11px",
            borderRadius: 4,
            backgroundColor: "#fbf3db",
          }}
        >
          <span style={{ fontSize: 11 }}>⚠️</span>
          <div style={{ display: "grid", gap: 5, flex: 1, minWidth: 0 }}>
            <Line width={84} height={6.5} color="#e8dcb8" />
            <Line width={52} height={6.5} color="#efe6c9" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: "#9b9a94" }}>▸</span>
          <Line width={46} height={7} color="#e6e6e3" />
        </div>
      </div>
    </div>
  );
};
