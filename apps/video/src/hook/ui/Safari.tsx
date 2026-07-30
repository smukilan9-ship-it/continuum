import { random } from "remotion";

import { siteColors } from "../AppIcon";
import { BROWSER_TABS } from "../windows-data";
import { Line, fade } from "./primitives";

/**
 * Safari on a YouTube watch page (f150).
 *
 * Toolbar, nine tabs, address field, then the page itself: player, title,
 * channel row with a subscribe button, and a recommendations rail. The rail is
 * what makes it read as YouTube rather than "a video in a box".
 */

const CHROME = "#e9e9e7";
const RED = "#ff0000";

export const SafariUI: React.FC<{ local: number; seed: string }> = ({ local, seed }) => {
  const shown = fade(local, 3, 12);

  return (
    <div style={{ height: "100%", backgroundColor: "#ffffff", opacity: shown, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          backgroundColor: CHROME,
          padding: "6px 10px 0",
          display: "grid",
          gap: 6,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <svg width="13" height="11" viewBox="0 0 14 12">
            <rect x="0.7" y="0.7" width="12.6" height="10.6" rx="2" fill="none" stroke="#6e6e6b" strokeWidth="1.2" />
            <path d="M5.2 1v10" stroke="#6e6e6b" strokeWidth="1.2" />
          </svg>
          <svg width="20" height="10" viewBox="0 0 22 12">
            <path d="M5.5 2 2 6l3.5 4M16.5 2 20 6l-3.5 4" fill="none" stroke="#9a9a97" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 6,
              backgroundColor: "#dededb",
              fontSize: 10.5,
              color: "#4a4a47",
            }}
          >
            <svg width="8" height="10" viewBox="0 0 8 10">
              <rect x="0.6" y="4" width="6.8" height="5.4" rx="1.2" fill="#6e6e6b" />
              <path d="M2.3 4V2.6a1.7 1.7 0 0 1 3.4 0V4" fill="none" stroke="#6e6e6b" strokeWidth="1" />
            </svg>
            youtube.com
          </div>
          <svg width="12" height="12" viewBox="0 0 14 14">
            <rect x="1" y="1" width="12" height="12" rx="2.5" fill="none" stroke="#6e6e6b" strokeWidth="1.2" />
            <path d="M7 1v12M1 7h12" stroke="#6e6e6b" strokeWidth="1.2" />
          </svg>
        </div>

        <div style={{ display: "flex", gap: 2, overflow: "hidden" }}>
          {BROWSER_TABS.map((tab, index) => (
            <div
              key={tab}
              style={{
                flex: index === 0 ? "0 0 auto" : "1 1 0",
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 9px",
                borderRadius: "6px 6px 0 0",
                backgroundColor: index === 0 ? "#ffffff" : "transparent",
                fontSize: 10,
                color: index === 0 ? "#1d1d1b" : "#77776f",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  backgroundColor: siteColors[tab] ?? "#c9c9c6",
                  flexShrink: 0,
                }}
              />
              {index === 0 ? tab : tab.slice(0, 7)}
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 12, padding: "12px 14px" }}>
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 9, alignContent: "start" }}>
          <div
            style={{
              height: 150,
              borderRadius: 8,
              backgroundColor: "#0f0f0f",
              display: "grid",
              placeItems: "center",
              position: "relative",
            }}
          >
            <div
              style={{
                width: 46,
                height: 32,
                borderRadius: 8,
                backgroundColor: RED,
                display: "grid",
                placeItems: "center",
              }}
            >
              <div
                style={{
                  width: 0,
                  height: 0,
                  marginLeft: 3,
                  borderTop: "6px solid transparent",
                  borderBottom: "6px solid transparent",
                  borderLeft: "10px solid #ffffff",
                }}
              />
            </div>
            <div style={{ position: "absolute", left: 10, right: 10, bottom: 8, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.28)" }}>
              <div style={{ width: "34%", height: "100%", borderRadius: 2, backgroundColor: RED }} />
            </div>
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#0f0f0f", letterSpacing: -0.2 }}>
            SAT Circles & Parabolas in 21 Minutes
          </div>
          <div style={{ fontSize: 10, color: "#606060" }}>412K views · 2 years ago</div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 1 }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#c4302b" }} />
            <div style={{ display: "grid", gap: 2, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: "#0f0f0f" }}>SAT Math Academy</span>
              <span style={{ fontSize: 9, color: "#606060" }}>1.2M subscribers</span>
            </div>
            <div
              style={{
                padding: "5px 12px",
                borderRadius: 14,
                backgroundColor: "#0f0f0f",
                color: "#ffffff",
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              Subscribe
            </div>
          </div>
        </div>

        <div style={{ width: 170, flexShrink: 0, display: "grid", gap: 9, alignContent: "start" }}>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} style={{ display: "flex", gap: 7 }}>
              <div
                style={{
                  width: 62,
                  height: 36,
                  borderRadius: 5,
                  backgroundColor: "#d7d7d5",
                  flexShrink: 0,
                }}
              />
              <div style={{ display: "grid", gap: 4, flex: 1, minWidth: 0, paddingTop: 2 }}>
                <Line width={92 - random(`${seed}-rec-${index}`) * 22} height={5} color="#d0d0ce" />
                <Line width={58 + random(`${seed}-rec2-${index}`) * 20} height={5} color="#e2e2e0" />
                <Line width={40} height={4} color="#e8e8e6" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
