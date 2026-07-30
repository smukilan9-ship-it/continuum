import Link from "next/link";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import "@/components/auth/auth.css";

export default function PrivacyPage() {
  return (
    <main className="privacy-shell">
      <article className="privacy-content">
        <Link href="/"><ArrowLeft size={15} /> Back to Continuum</Link>
        <div className="privacy-title"><div><ShieldCheck size={24} /></div><p className="eyebrow">PRIVACY & TRUST</p><h1>Your academic context belongs to you.</h1><p>Continuum stores only the structured context needed to move your goals forward. It does not sell student data, show advertising, or expose provider credentials to the browser.</p></div>
        <section><h2>What we remember</h2><p>Confirmed goals, accepted decisions, completed work, assessment evidence, useful preferences, evidence-backed notes, and concise checkpoints. We do not save every conversational sentence.</p></section>
        <section><h2>Your controls</h2><p>You can search and export your durable memory, delete indexed sources, reject proposed changes, and revoke any connected host or vault token. Additional record-level correction and deletion controls are being built and are not claimed as available yet.</p></section>
        <section><h2>Connected assistants</h2><p>Claude and other compatible MCP clients receive only the records allowed by their explicit scopes. Read access never implies write access. Schedule commits need a separate confirmation step. ChatGPT MCP is not enabled in this deployment.</p></section>
        <section><h2>Sources and AI providers</h2><p>Retrieved documents are treated as untrusted evidence, never instructions. Source-locked mode refuses unsupported claims. Server-side routing reveals which provider receives a task and keeps every key out of the browser.</p></section>
        <div className="privacy-footer"><LockKeyhole size={17} /><span>Minimal prompts · scoped access · encrypted transport · visible controls</span></div>
      </article>
    </main>
  );
}
