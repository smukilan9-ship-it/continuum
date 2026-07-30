import { random } from "remotion";

import { Line, fade } from "./primitives";

/**
 * macOS Preview showing the mock-test review PDF (f66).
 *
 * Page-thumbnail rail on the left with page 3 selected, then the page itself:
 * section heading, body text, a display equation, a figure with a caption.
 * The equation block is what makes it read as a physics text rather than a
 * generic document.
 */
export const PreviewUI: React.FC<{ local: number; seed: string }> = ({ local, seed }) => {
  const shown = fade(local, 3, 12);

  return (
    <div style={{ height: "100%", display: "flex", backgroundColor: "#f2f2f0", opacity: shown }}>
      <aside
        style={{
          width: 74,
          flexShrink: 0,
          backgroundColor: "#e8e8e5",
          borderRight: "1px solid #dcdcd8",
          padding: "8px 0",
          display: "grid",
          gap: 7,
          justifyItems: "center",
          alignContent: "start",
        }}
      >
        {[2, 3, 4, 5].map((page) => (
          <div key={page} style={{ display: "grid", gap: 3, justifyItems: "center" }}>
            <div
              style={{
                width: 46,
                height: 60,
                backgroundColor: "#ffffff",
                border: page === 3 ? "2px solid #4a90d9" : "1px solid #d4d4d0",
                borderRadius: 2,
                padding: 5,
                display: "grid",
                gap: 2.5,
                alignContent: "start",
              }}
            >
              {Array.from({ length: 7 }, (_, index) => (
                <Line key={index} width={62 + random(`${seed}-t${page}-${index}`) * 36} height={2} color="#dcdcd8" />
              ))}
            </div>
            <span style={{ fontSize: 8, color: page === 3 ? "#2b2b29" : "#8a8a86" }}>{page}</span>
          </div>
        ))}
      </aside>

      <div style={{ flex: 1, minWidth: 0, padding: "12px 14px", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            backgroundColor: "#ffffff",
            border: "1px solid #dcdcd8",
            padding: "18px 20px",
            display: "grid",
            gap: 11,
            alignContent: "start",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1c1c1a", fontFamily: "Georgia, serif" }}>
            4.2 Arc Length and Sector Area
          </div>
          {Array.from({ length: 5 }, (_, index) => (
            <Line key={index} width={80 + random(`${seed}-p1-${index}`) * 20} height={5.5} color="#dcdcd8" />
          ))}

          <div
            style={{
              margin: "3px 0",
              padding: "12px 0",
              display: "grid",
              justifyItems: "center",
              gap: 6,
              borderTop: "1px solid #f0f0ec",
              borderBottom: "1px solid #f0f0ec",
            }}
          >
            <span style={{ fontSize: 14, fontFamily: "Georgia, serif", fontStyle: "italic", color: "#1c1c1a" }}>
              s = rθ        A = ½r²θ
            </span>
            <span style={{ fontSize: 8, color: "#9a9a96" }}>(4.7)</span>
          </div>

          {Array.from({ length: 4 }, (_, index) => (
            <Line key={index} width={78 + random(`${seed}-p2-${index}`) * 22} height={5.5} color="#dcdcd8" />
          ))}

          <div
            style={{
              marginTop: 2,
              height: 88,
              border: "1px solid #e4e4e0",
              backgroundColor: "#fbfbf9",
              display: "grid",
              placeItems: "center",
            }}
          >
            <svg width="130" height="60" viewBox="0 0 130 60">
              <path d="M10 50 Q 40 6 65 30 T 120 14" fill="none" stroke="#b9b9b4" strokeWidth="1.6" />
              <path d="M10 50h112M10 50V8" fill="none" stroke="#d2d2ce" strokeWidth="1.2" />
              <circle cx="65" cy="30" r="3" fill="#9a9a95" />
            </svg>
          </div>
          <span style={{ fontSize: 8.5, color: "#8a8a86", fontFamily: "Georgia, serif" }}>
            Figure 2.34 — Potential of a point charge near a grounded plane.
          </span>
        </div>
      </div>
    </div>
  );
};
