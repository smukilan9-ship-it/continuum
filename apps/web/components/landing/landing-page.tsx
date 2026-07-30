import Link from "next/link";
import { BookMarked, Check, Github, Landmark, Library, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { DemoButton } from "@/components/landing/demo-button";
import { MobileNav } from "@/components/landing/mobile-nav";
import { ProductShot } from "@/components/landing/product-shot";
import { ScrollReveal } from "@/components/landing/scroll-reveal";
import { demoLoginEnabled } from "@/lib/env";
import "./landing.css";

/**
 * The marketing page, rebuilt against redesign.md §10.
 *
 * Seven sections, in the §10.2 order. Every claim on the page is one that §10.1
 * classified as verified; the deleted sections (fragmentation animation, six-card
 * feature grid, journey timeline, comparison table, quote, trust logo cloud) took
 * the unsupported claims and about 3,800 px with them.
 *
 * The product frames are real captures of the running app, not DOM mockups —
 * see `product-shot.tsx` for the current placeholder state.
 */

const NAV_LINKS = [
  ["How it works", "#proof"],
  ["What's inside", "#inside"],
  ["Connections", "#connections"],
  ["Control", "#control"],
] as const;

const PROOF_POINTS = [
  "No credit card",
  "Your workspace is private",
  "Works with Claude, Zotero, Obsidian",
] as const;

const PROBLEM_ITEMS = [
  { icon: Library, label: "Sources you can't find again" },
  { icon: Landmark, label: "Plans that drift" },
  { icon: BookMarked, label: "AI that forgets" },
] as const;

const STEPS = [
  {
    caption: "Ask in your own words",
    shot: "ask-cited",
    crop: "bottom",
    alt: "The Ask composer holding the question “What did I decide about cross-marker association?” with a context chip reading “Project: OASIS”.",
  },
  {
    caption: "Get an answer from your work",
    shot: "ask-cited",
    crop: "top",
    alt: "An answer in the Ask surface with two citation chips beneath it, each naming a record from the workspace.",
  },
  {
    caption: "Open exactly what it used",
    shot: "ask-inspector",
    crop: "right",
    alt: "The context inspector open beside an answer, showing the decision record and the source passage the answer was built from.",
  },
] as const;

const INSIDE_ROWS = [
  {
    id: "study",
    title: "Study that only counts real evidence",
    body: "A concept moves forward when you answer something you haven't seen before — not when you finish a video.",
    shot: "study-check",
    alt: "A study checkpoint asking an unseen question, with the concept's mastery breakdown beside it.",
  },
  {
    id: "research",
    title: "Research with the evidence attached",
    body: "Search 250M+ works through OpenAlex, save what matters to a project, and keep every claim tied to the passage that supports it.",
    shot: "goal-overview",
    alt: "A research goal showing its saved sources and the claims linked to the passages that support them.",
  },
  {
    id: "build",
    title: "Code beside your material",
    body: "Run Python, JavaScript, TypeScript, and SQL in the browser. Ask for help and the answer uses your actual error, not a guess.",
    shot: "build-run",
    alt: "The code editor with a Python program and its console output, run in the browser.",
  },
  {
    id: "plan",
    title: "A week you can actually finish",
    body: "Tell Continuum when you're free. It drafts a week from your real deadlines; you edit it before anything is saved.",
    shot: "plan-week",
    alt: "A drafted study week laid out across seven days, with each block still editable before it is saved.",
  },
] as const;

const CONNECTIONS = [
  { name: "Claude", body: "Ask Claude about your Continuum work through a secure connection you approve and can revoke.", status: "You approve each permission" },
  { name: "Zotero", body: "Bring your library in and use it as evidence.", status: "Needs your API key" },
  { name: "Obsidian", body: "Sync notes to a folder you choose. Continuum never touches the rest of your vault.", status: "Folder you pick" },
  { name: "OpenAlex", body: "Search the open scholarly graph. Works with no setup.", status: "Working — no setup needed" },
] as const;

const CONTROL_POINTS = [
  "Assistants read only what a question needs",
  "Anything that changes your work is a proposal you approve",
  "Run models locally with Ollama if you'd rather",
  "Download or delete everything, whenever",
] as const;

/**
 * The real OAuth consent list, rendered statically (§10.3, section 6). The
 * titles and descriptions are the exact strings `/oauth/authorize` shows when a
 * client asks for these scopes — it is a render of the screen, not a redrawing
 * of it, and nothing here is interactive.
 */
const CONSENT_ROWS = [
  { title: "Use relevant academic memory", body: "Read compact context that helps Claude continue your work.", write: false },
  { title: "See your saved study schedule", body: "Read upcoming study blocks and fixed commitments.", write: false },
  { title: "Draft schedule changes", body: "Create schedule suggestions for you to review.", write: true },
  { title: "Save approved schedule changes", body: "Save schedule changes only after confirmation.", write: true },
] as const;

const FOOTER_BUILD = [
  ["Documentation", "https://github.com/smukilan9-ship-it/continuum#readme"],
  ["GitHub", "https://github.com/smukilan9-ship-it/continuum"],
] as const;

export function LandingPage() {
  const demoAvailable = demoLoginEnabled();

  return (
    <div className="mk-page">
      <ScrollReveal />
      <a className="mk-skip" href="#main-content">Skip to content</a>

      <header className="mk-header">
        <div className="mk-header-inner">
          <Link className="mk-brand" href="/" aria-label="Continuum home">
            <BrandMark title="Continuum" />
            <span>continuum</span>
          </Link>

          <nav className="mk-header-nav" aria-label="Sections">
            {NAV_LINKS.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
          </nav>

          <div className="mk-header-actions">
            <ThemeToggle />
            <Link className="mk-signin" href="/login">Sign in</Link>
            {demoAvailable
              ? <DemoButton className="mk-btn mk-btn-primary mk-btn-sm" label="Try the demo" />
              : <Link className="mk-btn mk-btn-primary mk-btn-sm" href="/login?mode=register">Create your workspace</Link>}
          </div>

          <MobileNav links={NAV_LINKS} demoAvailable={demoAvailable} />
        </div>
      </header>

      <main id="main-content">
        {/* 1 — Hook */}
        <section className="mk-hero" aria-labelledby="hero-title">
          <div className="mk-hero-copy" data-reveal>
            <p className="mk-eyebrow">For students and researchers</p>
            <h1 id="hero-title">Your work, and an AI that actually knows it.</h1>
            <p className="mk-lead">
              Continuum keeps your goals, sources, study, and code in one workspace — so when you ask a question, the
              answer comes from your own material, with the receipts.
            </p>
            <div className="mk-cta-row">
              {demoAvailable ? <DemoButton className="mk-btn mk-btn-primary" /> : null}
              <Link className={demoAvailable ? "mk-btn mk-btn-secondary" : "mk-btn mk-btn-primary"} href="/login?mode=register">
                Create your workspace
              </Link>
            </div>
            <p className="mk-proof">
              <Check size={14} aria-hidden="true" />
              {PROOF_POINTS.map((point, index) => (
                <span key={point}>
                  {point}
                  {index < PROOF_POINTS.length - 1 ? <i aria-hidden="true">·</i> : null}
                </span>
              ))}
            </p>
          </div>

          <figure className="mk-hero-frame" data-reveal data-reveal-delay="1">
            <ProductShot
              name="ask-cited"
              crop="top"
              eager
              sizes="(max-width: 1000px) 100vw, 55vw"
              alt="Continuum's Ask surface: a question about a research project, a short answer, and three citation chips naming the source, decision, and concept the answer used."
            />
          </figure>
        </section>

        {/* 2 — Problem */}
        <section className="mk-section mk-problem" aria-labelledby="problem-title">
          <div className="mk-narrow" data-reveal>
            <h2 id="problem-title">Every tool holds a piece. None of them holds the thread.</h2>
            <p className="mk-lead">
              Your reading is in one app, your notes in another, your plan in a third, and your AI chat starts from zero
              every time. You spend your best attention rebuilding context you already had.
            </p>
            <ul className="mk-problem-items">
              {PROBLEM_ITEMS.map(({ icon: Icon, label }) => (
                <li key={label}><Icon size={16} aria-hidden="true" />{label}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* 3 — The core proof */}
        <section className="mk-section mk-proof-section" id="proof" aria-labelledby="proof-title">
          <div className="mk-section-head" data-reveal>
            <p className="mk-eyebrow">How it works</p>
            <h2 id="proof-title">Ask. Read the answer. Open what it used.</h2>
          </div>

          {/* The connector sits outside the list: an <ol> may only contain <li>. */}
          <div className="mk-steps-board" data-reveal>
            <span className="mk-steps-line" aria-hidden="true" />
            <ol className="mk-steps" role="list">
              {STEPS.map((step, index) => (
                <li key={step.caption} className="mk-step" style={{ ["--mk-stagger" as string]: index }}>
                  <p className="mk-step-caption"><b aria-hidden="true">{index + 1}</b>{step.caption}</p>
                  <figure className="mk-step-frame">
                    <ProductShot name={step.shot} crop={step.crop} sizes="(max-width: 1000px) 100vw, 33vw" alt={step.alt} />
                  </figure>
                </li>
              ))}
            </ol>
          </div>

          <p className="mk-steps-caption" data-reveal>
            Continuum retrieves only what your question needs, tells you what it used, and lets you open it. Nothing
            else from your workspace is sent.
          </p>
        </section>

        {/* 4 — What's inside */}
        <section className="mk-section mk-inside" id="inside" aria-labelledby="inside-title">
          <div className="mk-section-head" data-reveal>
            <p className="mk-eyebrow">What&apos;s inside</p>
            <h2 id="inside-title">Four surfaces, one memory.</h2>
          </div>

          <div className="mk-rows">
            {INSIDE_ROWS.map((row) => (
              <article className="mk-row" key={row.id} data-reveal aria-labelledby={`inside-${row.id}`}>
                <div className="mk-row-copy">
                  <h3 id={`inside-${row.id}`}>{row.title}</h3>
                  <p>{row.body}</p>
                </div>
                <figure className="mk-row-frame">
                  <ProductShot name={row.shot} crop="top" sizes="(max-width: 1000px) 100vw, 55vw" alt={row.alt} />
                </figure>
              </article>
            ))}
          </div>
        </section>

        {/* 5 — Connections */}
        <section className="mk-section mk-connections" id="connections" aria-labelledby="connections-title">
          <div className="mk-section-head" data-reveal>
            <p className="mk-eyebrow">Connections</p>
            <h2 id="connections-title">It works with what you already use.</h2>
          </div>

          <ul className="mk-conn-list" data-reveal>
            {CONNECTIONS.map((connection) => (
              <li className="mk-conn" key={connection.name}>
                <b>{connection.name}</b>
                <p>{connection.body}</p>
                <span>{connection.status}</span>
              </li>
            ))}
          </ul>
          <p className="mk-conn-note" data-reveal>More coming — we&apos;ll say so when they&apos;re real.</p>
        </section>

        {/* 6 — Control */}
        <section className="mk-section mk-control" id="control" aria-labelledby="control-title">
          <div className="mk-control-copy" data-reveal>
            <p className="mk-eyebrow">Control</p>
            <h2 id="control-title">You decide what it can touch.</h2>
            <ul className="mk-control-points">
              {CONTROL_POINTS.map((point) => (
                <li key={point}><ShieldCheck size={17} aria-hidden="true" />{point}</li>
              ))}
            </ul>
          </div>

          <figure className="mk-consent" data-reveal data-reveal-delay="1">
            <figcaption>
              <span>Continuum</span>
              <strong>Allow Claude to connect</strong>
            </figcaption>
            <ul>
              {CONSENT_ROWS.map((row) => (
                <li key={row.title}>
                  <div>
                    <b>{row.title}</b>
                    <p>{row.body}</p>
                  </div>
                  <span data-write={row.write ? "true" : undefined}>{row.write ? "Needs approval" : "Read only"}</span>
                </li>
              ))}
            </ul>
            <p className="mk-consent-foot"><Check size={13} aria-hidden="true" /> Writes require explicit approval</p>
          </figure>
        </section>

        {/* 7 — Start */}
        <section className="mk-section mk-start" id="start" aria-labelledby="start-title">
          <div className="mk-narrow mk-start-inner" data-reveal>
            <h2 id="start-title">See it with a real workspace.</h2>
            <p className="mk-lead">
              The demo is a complete student workspace — real sources, a real plan, real conversations. Nothing to set up.
            </p>
            <div className="mk-cta-row mk-cta-center">
              {demoAvailable ? <DemoButton className="mk-btn mk-btn-primary" label="Open the demo" /> : null}
              <Link className={demoAvailable ? "mk-btn mk-btn-secondary" : "mk-btn mk-btn-primary"} href="/login?mode=register">
                Create your workspace
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="mk-footer">
        <div className="mk-footer-main">
          <div className="mk-footer-brand">
            <Link className="mk-brand" href="/"><BrandMark title="Continuum" /><span>continuum</span></Link>
            <p>Your work, and an AI that actually knows it.</p>
          </div>

          <nav aria-label="Product">
            <strong>Product</strong>
            {demoAvailable ? <DemoButton className="mk-footer-demo" label="Demo" icon={false} /> : null}
            <Link href="/login?mode=register">Create account</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>

          <nav aria-label="Build">
            <strong>Build</strong>
            {FOOTER_BUILD.map(([label, href]) => <a key={label} href={href}>{label}</a>)}
            <Link href="/settings/connections">Claude connection</Link>
          </nav>

          <nav aria-label="Contact">
            <strong>Contact</strong>
            <a href="https://github.com/smukilan9-ship-it/continuum/issues/new">
              <Github size={15} aria-hidden="true" />GitHub issues
            </a>
          </nav>
        </div>
        <div className="mk-footer-bottom">
          <span>© 2026 Continuum</span>
          <span>Your work, and an AI that actually knows it.</span>
        </div>
      </footer>
    </div>
  );
}
