/**
 * App icons for the hook's desktop.
 *
 * Recognition is the whole job: a judge should read the pile as *their own*
 * desktop within two seconds. Names in the title bars do most of that work,
 * and these marks carry the rest.
 *
 * They are simple geometric stand-ins in each product's brand colour, not
 * traced logos — enough to identify the app at a glance, drawn rather than
 * copied. Nominative identification is the point; imitation is not.
 */

export type AppId =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "safari"
  | "preview"
  | "notion"
  | "anki"
  | "terminal"
  | "calendar";

export const apps: Record<AppId, { name: string; color: string }> = {
  chatgpt: { name: "ChatGPT", color: "#10a37f" },
  claude: { name: "Claude", color: "#d97757" },
  gemini: { name: "Gemini", color: "#4285f4" },
  safari: { name: "Safari", color: "#1b8ce3" },
  preview: { name: "Preview", color: "#4a90d9" },
  notion: { name: "Notion", color: "#111111" },
  anki: { name: "Anki", color: "#2f6fb0" },
  terminal: { name: "Terminal", color: "#3c3f38" },
  calendar: { name: "Calendar", color: "#e5484d" },
};

const glyphs: Record<AppId, React.ReactNode> = {
  // Compass needle.
  safari: (
    <>
      <circle cx="11" cy="11" r="6.4" fill="none" stroke="#ffffff" strokeWidth="1.3" />
      <path d="M14.4 7.6 12 12 7.6 14.4 10 10Z" fill="#ffffff" />
    </>
  ),
  // Interlocking knot, reduced to a hexagon.
  chatgpt: (
    <path
      d="M11 4.6 16.6 7.8v6.4L11 17.4 5.4 14.2V7.8Z"
      fill="none"
      stroke="#ffffff"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  ),
  // Radial burst.
  claude: (
    <g stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round">
      <path d="M11 4.8v4.1M11 13.1v4.1M4.8 11h4.1M13.1 11h4.1" />
      <path d="M6.9 6.9 9.6 9.6M12.4 12.4l2.7 2.7M15.1 6.9 12.4 9.6M9.6 12.4l-2.7 2.7" />
    </g>
  ),
  // Four-point sparkle.
  gemini: (
    <path
      d="M11 3.8c0 4 3.2 7.2 7.2 7.2-4 0-7.2 3.2-7.2 7.2 0-4-3.2-7.2-7.2-7.2 4 0 7.2-3.2 7.2-7.2Z"
      fill="#ffffff"
    />
  ),
  // Document with a folded corner.
  preview: (
    <path
      d="M6.6 4.6h6.2l3.6 3.6v9.2H6.6Z M12.8 4.6v3.6h3.6"
      fill="none"
      stroke="#ffffff"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  ),
  notion: (
    <text
      x="11"
      y="15.4"
      textAnchor="middle"
      fill="#ffffff"
      fontSize="12"
      fontWeight="700"
      fontFamily="Georgia, serif"
    >
      N
    </text>
  ),
  anki: (
    <path
      d="M11 4.4 12.9 9h4.9l-3.9 3 1.5 4.8L11 13.9 6.6 16.8 8.1 12l-3.9-3h4.9Z"
      fill="#ffffff"
    />
  ),
  terminal: (
    <g stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M6 7.6 9.4 11 6 14.4" />
      <path d="M11.6 14.8h4.6" />
    </g>
  ),
  // Date tile with a torn-off header.
  calendar: (
    <>
      <rect x="5" y="6" width="12" height="11" rx="2" fill="#ffffff" />
      <rect x="5" y="6" width="12" height="3.4" rx="2" fill="#ffffff" opacity="0.55" />
      <rect x="7.4" y="11" width="7.2" height="1.5" rx="0.75" fill="#e5484d" />
      <rect x="7.4" y="13.6" width="4.4" height="1.5" rx="0.75" fill="#e5484d" />
    </>
  ),
};

export const AppIcon: React.FC<{ app: AppId; size?: number }> = ({ app, size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 22 22"
    style={{ flexShrink: 0, display: "block" }}
    aria-hidden="true"
  >
    <rect width="22" height="22" rx="5.5" fill={apps[app].color} />
    {glyphs[app]}
  </svg>
);

/** Tab favicons in the Safari window — brand-coloured dots, same reasoning. */
export const siteColors: Record<string, string> = {
  YouTube: "#ff0000",
  StackExchange: "#f48024",
  Chegg: "#ea6a0b",
  Quizlet: "#4255ff",
  arXiv: "#b31b1b",
  "Google Scholar": "#4285f4",
  Reddit: "#ff4500",
  Gmail: "#ea4335",
  Docs: "#1a73e8",
};
