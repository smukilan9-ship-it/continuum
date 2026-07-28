import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Continuum — One Workspace. Infinite Learning.",
  description: "Continuum connects AI conversations, research, notes, code, projects, and mastery in one continuous learning workspace.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Continuum",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  description: "An AI-powered workspace that transforms fragmented learning into one continuous journey from curiosity to mastery.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Persistent academic memory",
    "OpenAlex research discovery",
    "Adaptive learning paths",
    "Connected projects and code",
    "Knowledge graphs",
    "Local model support",
  ],
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <LandingPage />
    </>
  );
}
