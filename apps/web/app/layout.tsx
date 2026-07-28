import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Continuum — One Workspace. Infinite Learning.",
    template: "%s | Continuum",
  },
  description: "Continuum connects AI conversations, research, notes, code, projects, and mastery in one continuous learning workspace.",
  metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:3000"),
  applicationName: "Continuum",
  keywords: ["AI learning workspace", "academic research", "persistent memory", "OpenAlex", "Zotero", "knowledge graph", "adaptive learning"],
  authors: [{ name: "Continuum" }],
  creator: "Continuum",
  category: "education",
  openGraph: {
    title: "Continuum — One Workspace. Infinite Learning.",
    description: "The operating system for modern learning and research.",
    type: "website",
    siteName: "Continuum",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Continuum brings fragmented learning tools into one connected workspace." }],
  },
  twitter: { card: "summary_large_image", title: "Continuum — One Workspace. Infinite Learning.", description: "The operating system for modern learning and research.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{try{const p=localStorage.getItem("continuum-theme")||"system";const d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";document.documentElement.style.colorScheme=d?"dark":"light"}catch{}})()`,
          }}
        />
      </head>
      <body className={sans.variable}>{children}</body>
    </html>
  );
}
