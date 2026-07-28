import Link from "next/link";
import { ArrowRight, Check, Github, Play, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  FragmentationMerge,
  HeroProductMockup,
  Reveal,
  WorkflowShowcase,
} from "@/components/landing/landing-motion";
import "./landing.css";

const features = [
  {
    id: "assistant",
    number: "01",
    title: "Assistant",
    eyebrow: "A collaborator that already knows the work",
    description: "Ask a better question without rebuilding the context first.",
    points: ["Persistent memory", "Context-aware conversations", "Attachments", "Reasoning", "Project awareness"],
  },
  {
    id: "research",
    number: "02",
    title: "Research",
    eyebrow: "Move from search results to defensible claims",
    description: "Discover, compare, cite, and preserve the evidence behind every decision.",
    points: ["OpenAlex integration", "Citation graphs", "Paper discovery", "Related work", "Automatic references"],
  },
  {
    id: "learn",
    number: "03",
    title: "Learn",
    eyebrow: "A path shaped by evidence, not engagement",
    description: "Continuum adapts only when your work demonstrates a real change in understanding.",
    points: ["Adaptive learning paths", "Mastery tracking", "Concept maps", "Practice questions", "Weakness detection"],
  },
  {
    id: "projects",
    number: "04",
    title: "Projects",
    eyebrow: "The outcome holds the context together",
    description: "Every conversation. Every document. Every decision. Every idea. Still connected when you return.",
    points: ["Linked milestones", "Decision history", "Research context", "Durable checkpoints", "Project memory"],
  },
  {
    id: "code",
    number: "05",
    title: "Code",
    eyebrow: "Build beside the evidence",
    description: "Move from a paper or explanation to a working experiment without changing mental workspaces.",
    points: ["Run Python", "Generate and debug", "Multiple model routing", "Integrated workspace", "Source-aware help"],
  },
  {
    id: "knowledge",
    number: "06",
    title: "Knowledge Graph",
    eyebrow: "Your work becomes a connected network",
    description: "Every note, chat, source, concept, and project becomes part of one navigable academic memory.",
    points: ["Typed relationships", "Source provenance", "Concept branches", "Cross-project recall", "Relevant retrieval"],
  },
] as const;

const comparisonRows = [
  ["Multiple AI chats", "Unified assistant"],
  ["Scattered PDFs", "Connected knowledge"],
  ["Lost context", "Persistent memory"],
  ["Manual research", "AI-assisted discovery"],
  ["Random studying", "Personalized mastery"],
] as const;

const journey = ["Curiosity", "Research", "Understanding", "Practice", "Creation", "Mastery"] as const;

const footerColumns = [
  {
    title: "Product",
    links: [["Features", "#features"], ["Research", "#research"], ["Learn", "#learn"], ["Projects", "#projects"], ["Assistant", "#assistant"]],
  },
  {
    title: "Company",
    links: [["Pricing", "#final-cta"], ["Privacy", "/privacy"], ["Terms", "/terms"], ["Contact", "https://github.com/smukilan9-ship-it/continuum/issues/new"]],
  },
  {
    title: "Build",
    links: [["Documentation", "https://github.com/smukilan9-ship-it/continuum#readme"], ["GitHub", "https://github.com/smukilan9-ship-it/continuum"], ["MCP", "/integrations"]],
  },
] as const;

function FeatureMark({ index }: { index: number }) {
  return (
    <span className={`landing-feature-mark landing-feature-mark-${index + 1}`} aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}

export function LandingPage() {
  return (
    <div className="landing-shell">
      <a className="landing-skip-link" href="#main-content">Skip to content</a>

      <header className="landing-header">
        <div className="landing-header-inner">
          <Link className="landing-logo" href="/" aria-label="Continuum home">
            <BrandMark title="Continuum" />
            <span>continuum</span>
          </Link>

          <nav className="landing-desktop-nav" aria-label="Main navigation">
            <a href="#features">Features</a>
            <a href="#workflow">How it works</a>
            <a href="#security">Security</a>
            <a href="https://github.com/smukilan9-ship-it/continuum#readme">Docs</a>
          </nav>

          <div className="landing-header-actions">
            <ThemeToggle />
            <Link className="landing-sign-in" href="/login?returnTo=%2Ftoday">Sign in</Link>
            <Link className="landing-button landing-button-small landing-button-primary" href="/login?mode=register&returnTo=%2Ftoday">
              Start free <ArrowRight size={15} />
            </Link>
          </div>

          <details className="landing-mobile-menu">
            <summary aria-label="Open navigation"><span /><span /></summary>
            <nav aria-label="Mobile navigation">
              <a href="#features">Features</a>
              <a href="#workflow">How it works</a>
              <a href="#security">Security</a>
              <Link href="/login?returnTo=%2Ftoday">Sign in</Link>
              <Link className="landing-button landing-button-primary" href="/login?mode=register&returnTo=%2Ftoday">Start free</Link>
            </nav>
          </details>
        </div>
      </header>

      <main id="main-content">
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="landing-hero-copy">
            <p className="landing-kicker"><i /> One Workspace. Infinite Learning.</p>
            <h1 id="hero-title">Learning shouldn&apos;t be fragmented. <span>Continuum connects everything.</span></h1>
            <p className="landing-hero-lead">
              Instead of juggling AI chats, notes, research papers, code, and projects across dozens of apps, Continuum brings them together into one intelligent workspace that remembers everything and helps you move from curiosity to mastery.
            </p>
            <div className="landing-hero-actions">
              <Link className="landing-button landing-button-primary" href="/login?mode=register&returnTo=%2Ftoday">Start Free <ArrowRight size={17} /></Link>
              <a className="landing-button landing-button-secondary" href="#workflow"><Play size={15} fill="currentColor" /> Watch Demo</a>
            </div>
            <div className="landing-hero-proof">
              <span><Check size={14} /> No credit card required</span>
              <span>Works with Claude, GPT, Gemini, Ollama, and more.</span>
            </div>
          </div>
          <HeroProductMockup />
        </section>

        <section className="landing-trust" aria-label="Supported tools">
          <p>Works with the tools you already use.</p>
          <div className="landing-logo-cloud">
            {["OpenAlex", "Zotero", "Obsidian", "Claude", "OpenAI", "Gemini", "Groq", "Featherless", "Ollama"].map((tool) => (
              <span key={tool}>{tool}</span>
            ))}
          </div>
        </section>

        <section className="landing-section landing-fragmentation" aria-labelledby="fragmentation-title">
          <Reveal className="landing-section-heading landing-section-heading-split">
            <div>
              <p className="landing-overline">THE PROBLEM</p>
              <h2 id="fragmentation-title">Information is abundant.<br />Learning is fragmented.</h2>
            </div>
            <div>
              <p>Each tool sees a sliver of your work. You spend your best attention copying context, finding old sources, and reconstructing decisions.</p>
              <strong>One place where everything connects.</strong>
            </div>
          </Reveal>
          <FragmentationMerge />
        </section>

        <section className="landing-section landing-features" id="features" aria-labelledby="features-title">
          <Reveal className="landing-section-heading">
            <p className="landing-overline">ONE SYSTEM, SIX SURFACES</p>
            <h2 id="features-title">Every part of the work.<br />Moving as one.</h2>
            <p>Continuum does not replace the tools that already work. It gives them shared memory, shared evidence, and a shared direction.</p>
          </Reveal>

          <div className="landing-feature-grid">
            {features.map((feature, index) => (
              <Reveal key={feature.id} delay={(index % 2) * 0.08}>
                <article className="landing-feature-card" id={feature.id}>
                  <div className="landing-feature-top">
                    <FeatureMark index={index} />
                    <span>{feature.number}</span>
                  </div>
                  <p>{feature.eyebrow}</p>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <ul>
                    {feature.points.map((point) => <li key={point}><i />{point}</li>)}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="landing-section landing-journey" aria-labelledby="journey-title">
          <Reveal className="landing-section-heading landing-section-heading-centered">
            <p className="landing-overline">THE CONTINUOUS JOURNEY</p>
            <h2 id="journey-title">From the first question<br />to real mastery.</h2>
            <p>Continuum guides the next meaningful step, keeps the evidence, and makes progress visible without turning learning into a streak.</p>
          </Reveal>
          <ol className="landing-timeline">
            {journey.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
                {index < journey.length - 1 ? <i aria-hidden="true">→</i> : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section landing-workflow" id="workflow" aria-labelledby="workflow-title">
          <Reveal className="landing-section-heading landing-section-heading-split">
            <div>
              <p className="landing-overline">SEE THE WORKFLOW</p>
              <h2 id="workflow-title">One question.<br />A complete learning system.</h2>
            </div>
            <div>
              <p>Ask Continuum to teach you quantum annealing. It does more than answer: it discovers evidence, builds the path, tests understanding, and remembers the result.</p>
            </div>
          </Reveal>
          <WorkflowShowcase />
        </section>

        <section className="landing-section landing-comparison" aria-labelledby="comparison-title">
          <Reveal className="landing-section-heading">
            <p className="landing-overline">WHY CONTINUUM</p>
            <h2 id="comparison-title">Less context switching.<br />More compounding knowledge.</h2>
          </Reveal>
          <div className="landing-comparison-table" role="table" aria-label="Traditional workflow compared with Continuum">
            <div className="landing-comparison-head" role="row">
              <span role="columnheader">Traditional workflow</span>
              <span role="columnheader">Continuum</span>
            </div>
            {comparisonRows.map(([traditional, continuum], index) => (
              <div className="landing-comparison-row" role="row" key={traditional}>
                <span role="cell"><b>{String(index + 1).padStart(2, "0")}</b>{traditional}</span>
                <span role="cell"><Check size={16} />{continuum}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-quote" aria-label="Continuum commitment">
          <Reveal>
            <BrandMark title="Continuum" />
            <blockquote>“Continuum fights for student outcomes, not screen time.”</blockquote>
            <p>Built to move understanding forward—not keep you scrolling.</p>
          </Reveal>
        </section>

        <section className="landing-section landing-security" id="security" aria-labelledby="security-title">
          <Reveal className="landing-security-copy">
            <p className="landing-overline">PRIVATE BY DESIGN</p>
            <h2 id="security-title">Your data stays yours.</h2>
            <p>Academic memory is personal infrastructure. Continuum keeps permissions explicit, credentials out of the browser, and every connected tool under your control.</p>
            <ul>
              <li><ShieldCheck size={18} /><span><strong>Encrypted storage</strong> for durable workspace records and credentials.</span></li>
              <li><ShieldCheck size={18} /><span><strong>Private projects</strong> with scoped, revocable access.</span></li>
              <li><ShieldCheck size={18} /><span><strong>Local model support</strong> through Ollama when work should stay on-device.</span></li>
              <li><ShieldCheck size={18} /><span><strong>Flexible model access</strong> with optional personal keys and server-managed providers.</span></li>
              <li><ShieldCheck size={18} /><span><strong>Transparent permissions</strong> for every integration and assistant.</span></li>
            </ul>
          </Reveal>

          <Reveal className="landing-security-panel" delay={0.08}>
            <div className="landing-security-panel-head">
              <div><span>Workspace security</span><strong>Protected</strong></div>
              <i><ShieldCheck size={21} /></i>
            </div>
            <div className="landing-security-status">
              <span><i />Storage encryption<b>Active</b></span>
              <span><i />Private workspace<b>Only you</b></span>
              <span><i />Ollama local route<b>Available</b></span>
              <span><i />Provider keys<b>Server-side</b></span>
            </div>
            <div className="landing-security-scope">
              <span>Claude · MCP permissions</span>
              <div><b>Read memory</b><b>Search sources</b><b>Propose changes</b></div>
              <p><Check size={13} /> Writes require explicit approval</p>
            </div>
          </Reveal>
        </section>

        <section className="landing-final-cta" id="final-cta" aria-labelledby="final-title">
          <Reveal>
            <p className="landing-overline">START YOUR CONTINUUM</p>
            <h2 id="final-title">Build knowledge<br />that compounds.</h2>
            <p>Join the next generation of researchers, students, and lifelong learners.</p>
            <div>
              <Link className="landing-button landing-button-light" href="/login?mode=register&returnTo=%2Ftoday">Start Building <ArrowRight size={17} /></Link>
              <a className="landing-button landing-button-outline-light" href="https://github.com/smukilan9-ship-it/continuum#readme">View Documentation</a>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-main">
          <div className="landing-footer-brand">
            <Link className="landing-logo" href="/"><BrandMark title="Continuum" /><span>continuum</span></Link>
            <p>The operating system for modern learning and research.</p>
            <a href="https://github.com/smukilan9-ship-it/continuum" aria-label="Continuum on GitHub"><Github size={18} />GitHub</a>
          </div>
          {footerColumns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <strong>{column.title}</strong>
              {column.links.map(([label, href]) => <a key={label} href={href}>{label}</a>)}
            </nav>
          ))}
        </div>
        <div className="landing-footer-bottom">
          <span>© 2026 Continuum</span>
          <span>One Workspace. Infinite Learning.</span>
        </div>
      </footer>
    </div>
  );
}
