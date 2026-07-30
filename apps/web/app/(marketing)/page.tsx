import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  // Absolute, so the layout's "%s | Continuum" template does not append a second
  // brand to a title that already carries it.
  title: { absolute: "Continuum — Your work, and an AI that actually knows it." },
  description:
    "Continuum keeps your goals, sources, study, and code in one workspace — so when you ask a question, the answer comes from your own material, with the receipts.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

/**
 * Structured data. Every entry is a capability §10.1 classified as verified. The
 * unsupported graph claim (§10.1 rows 1-3) was removed in Phase 0, and nothing
 * here may reintroduce a claim the running product cannot demonstrate — AC-M2
 * greps this file, so even a comment must stay clear of the retired words.
 */
const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Continuum",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  description:
    "One workspace for your goals, sources, study, and code, with an assistant that answers from your own material and shows the records it used.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Answers cited to your own records",
    "Evidence-based study progress",
    "OpenAlex scholarly search",
    "Browser-sandboxed code execution",
    "Weekly study planning you approve",
    "Local model support through Ollama",
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
