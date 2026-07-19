import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Continuum — Your academic memory, in motion",
  description: "An evidence-backed academic operating system that diagnoses, plans, remembers, and moves learning forward across every AI tool.",
  metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "Continuum — Never restart your academic context",
    description: "Diagnose. Teach. Verify. Remember. One academic memory across every AI tool.",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Continuum", description: "Your academic memory, in motion." },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={sans.variable}>{children}</body>
    </html>
  );
}
