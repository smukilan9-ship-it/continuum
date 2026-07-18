import Link from "next/link";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";

export default function PrivacyPage() {
  return (
    <main className="privacy-shell">
      <article className="privacy-content">
        <Link href="/"><ArrowLeft size={15} /> Back to Continuum</Link>
        <div className="privacy-title"><div><ShieldCheck size={24} /></div><p className="eyebrow">PRIVACY & TRUST</p><h1>Your academic context belongs to you.</h1><p>Continuum stores only the structured context needed to move your goals forward. It does not sell student data, show advertising, or expose provider credentials to the browser.</p></div>
        <section><h2>What we remember</h2><p>Confirmed goals, accepted decisions, completed work, assessment evidence, useful preferences, evidence-backed notes, and concise checkpoints. We do not save every conversational sentence.</p></section>
        <section><h2>Your controls</h2><p>You can inspect, correct, mark obsolete, delete, and export memories. You can disable memory writes for a session and revoke any connected host.</p></section>
        <section><h2>Connected assistants</h2><p>Claude, ChatGPT, and other MCP clients receive only the records allowed by their explicit scopes. Read access never implies write access. Calendar commits need a separate scope and confirmation.</p></section>
        <section><h2>Sources and AI providers</h2><p>Retrieved documents are treated as untrusted evidence, never instructions. Source-locked mode refuses unsupported claims. Server-side routing reveals which provider receives a task and keeps every key out of the browser.</p></section>
        <div className="privacy-footer"><LockKeyhole size={17} /><span>Minimal data · scoped access · encrypted transport · export and deletion controls</span></div>
      </article>
    </main>
  );
}
