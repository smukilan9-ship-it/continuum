import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
// After globals.css: the kit is the source of truth for the classes it owns,
// and per-screen selectors are migrated onto it rather than the reverse.
import "../components/ui/kit.css";

// §15.4. Serif is scoped to reading surfaces (lesson bodies, source passages,
// assistant answers) — it is the editorial signal, not a second UI face.
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap", weight: ["400", "500", "600"] });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif", display: "swap", weight: ["400", "600"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: {
    default: "Continuum — Your work, and an AI that actually knows it.",
    template: "%s | Continuum",
  },
  description: "Continuum keeps your goals, sources, study, and code in one workspace — so when you ask a question, the answer comes from your own material, with the receipts.",
  metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:3000"),
  applicationName: "Continuum",
  keywords: ["AI learning workspace", "academic research", "persistent memory", "OpenAlex", "Zotero", "Obsidian", "study planner"],
  authors: [{ name: "Continuum" }],
  creator: "Continuum",
  category: "education",
  openGraph: {
    title: "Continuum — Your work, and an AI that actually knows it.",
    description: "One workspace for your goals, sources, study, and code — with an assistant that shows you where every answer came from.",
    type: "website",
    siteName: "Continuum",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Continuum brings fragmented learning tools into one connected workspace." }],
  },
  twitter: { card: "summary_large_image", title: "Continuum — Your work, and an AI that actually knows it.", description: "One workspace for your goals, sources, study, and code — with an assistant that shows you where every answer came from.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
