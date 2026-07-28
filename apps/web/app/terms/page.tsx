import Link from "next/link";
import { ArrowLeft, FileCheck2, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "Terms",
  description: "Terms for using Continuum.",
};

export default function TermsPage() {
  return (
    <main className="privacy-shell">
      <article className="privacy-content">
        <Link href="/"><ArrowLeft size={15} /> Back to Continuum</Link>
        <div className="privacy-title">
          <div><FileCheck2 size={24} /></div>
          <p className="eyebrow">TERMS OF USE</p>
          <h1>Use Continuum to move your own work forward.</h1>
          <p>These plain-language terms describe the current Continuum service. By creating an account, you agree to use the workspace lawfully and to protect the credentials connected to it.</p>
        </div>
        <section><h2>Your account</h2><p>You are responsible for your username, password, connected API keys, and activity performed through your account. Do not share access to private workspaces or attempt to access another person&apos;s records.</p></section>
        <section><h2>Your content</h2><p>You retain ownership of the notes, sources, prompts, code, and project material you add. You grant Continuum only the limited permission needed to store, retrieve, transform, and display that content for the features you request.</p></section>
        <section><h2>AI-generated work</h2><p>Model output can be incomplete or wrong. Verify important claims, citations, calculations, and code before relying on them. Continuum exposes sources and checkpoints to make verification easier, but it does not replace academic, legal, medical, or professional judgment.</p></section>
        <section><h2>Connected services</h2><p>OpenAlex, Zotero, model providers, and other integrations have their own terms. You must have permission to use the data and credentials you connect. You can revoke integrations from your workspace controls.</p></section>
        <section><h2>Service changes</h2><p>Continuum is actively developed. Features may change as reliability, security, and student outcomes improve. Material policy changes will be reflected on this page.</p></section>
        <div className="privacy-footer"><ShieldCheck size={17} /><span>Effective 28 July 2026 · Privacy-first academic infrastructure</span></div>
      </article>
    </main>
  );
}
