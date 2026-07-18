import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark"><Sparkles size={18} /> C</div>
        <p className="eyebrow">CONTINUUM</p>
        <h1>Your academic life,<br /><em>already in context.</em></h1>
        <p>Enter the judged demo workspace with a seeded learning goal, research project, evidence vault, and today plan.</p>
        <Link className="button button-primary button-large" href="/">Enter demo workspace <ArrowRight size={17} /></Link>
        <span className="privacy-note">Demo data only · No account or provider key required</span>
      </section>
    </main>
  );
}
