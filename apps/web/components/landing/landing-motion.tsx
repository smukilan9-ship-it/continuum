"use client";

import {
  BookOpen,
  CalendarDays,
  Check,
  Code2,
  Database,
  FlaskConical,
  Goal,
  Library,
  MessageCircle,
  Search,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { heroViews } from "@/components/landing/hero-views";
import { gsap, prefersReducedMotion, useGsap } from "@/components/landing/use-gsap";

/** The real sidebar grouping — mirrors navGroups in continuum-app.tsx. */
const navGroups = [
  { label: "", items: [{ id: "today", label: "Today", icon: CalendarDays }] },
  {
    label: "Work",
    items: [
      { id: "assistant", label: "Assistant", icon: MessageCircle },
      { id: "goals", label: "Plan", icon: Goal },
      { id: "learn", label: "Learn", icon: BookOpen },
      { id: "code", label: "Code", icon: Code2 },
      { id: "research", label: "Research", icon: FlaskConical },
    ],
  },
  {
    label: "Sources",
    items: [
      { id: "library", label: "Library", icon: Library },
      { id: "memory", label: "Memory", icon: Database },
    ],
  },
] as const;

const previewableIds = new Set(heroViews.map((view) => view.id));
const ROTATE_MS = 4200;

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const scope = useGsap(({ gsap: g, reduced }) => {
    if (reduced) return;
    g.from(scope.current, {
      opacity: 0,
      y: 26,
      duration: 0.7,
      delay,
      ease: "power3.out",
      scrollTrigger: { trigger: scope.current, start: "top 88%", once: true },
    });
  }, [delay]);

  return <div className={className} ref={scope}>{children}</div>;
}

export function HeroProductMockup() {
  const [activeId, setActiveId] = useState(heroViews[0]!.id);
  const [paused, setPaused] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);

  // Auto-advance is the whole point of the hero — it must never need a click.
  // It keeps running under reduced motion (only the transition is dropped, not
  // the rotation) and does NOT pause on hover: the pointer resting anywhere
  // over the hero used to freeze it, which read as a broken, static mockup.
  // Only an explicit interaction (clicking a tab) pauses it, and only briefly.
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setActiveId((current) => {
        const index = heroViews.findIndex((view) => view.id === current);
        return heroViews[(index + 1) % heroViews.length]!.id;
      });
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [paused]);

  // A manual pick holds that panel for one extra beat, then rotation resumes.
  function pick(id: string) {
    setActiveId(id);
    setPaused(true);
    window.setTimeout(() => setPaused(false), ROTATE_MS * 1.6);
  }

  // Animate the panel body in whenever the view changes, and stagger its rows.
  useEffect(() => {
    const node = bodyRef.current;
    if (!node || prefersReducedMotion()) return;
    const context = gsap.context(() => {
      gsap.fromTo(node, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.42, ease: "power3.out" });
      const rows = node.querySelectorAll<HTMLElement>(":scope > * > *");
      if (rows.length) {
        gsap.fromTo(rows, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.36, stagger: 0.035, ease: "power2.out", delay: 0.06 });
      }
      const bars = node.querySelectorAll<HTMLElement>(".hv-bar i");
      bars.forEach((bar) => {
        const target = bar.style.width;
        gsap.fromTo(bar, { width: 0 }, { width: target, duration: 0.7, ease: "power2.out", delay: 0.18 });
      });
    }, node);
    return () => context.revert();
  }, [activeId]);

  // Tab progress bar, restarted on each view.
  useEffect(() => {
    const node = progressRef.current;
    if (!node || paused) return;
    const tween = gsap.fromTo(node, { scaleX: 0 }, { scaleX: 1, duration: ROTATE_MS / 1000, ease: "none" });
    return () => { tween.kill(); };
  }, [activeId, paused]);

  const stage = useGsap(({ gsap: g, reduced }) => {
    if (reduced) return;
    g.from(".landing-product-window", { opacity: 0, y: 28, scale: 0.985, duration: 0.9, ease: "power3.out" });
    g.to(".landing-stage-orbit-one", {
      yPercent: 14, ease: "none",
      scrollTrigger: { trigger: stage.current, start: "top bottom", end: "bottom top", scrub: 0.6 },
    });
    g.to(".landing-stage-orbit-two", {
      yPercent: -18, ease: "none",
      scrollTrigger: { trigger: stage.current, start: "top bottom", end: "bottom top", scrub: 0.6 },
    });
  }, []);

  const activeView = heroViews.find((view) => view.id === activeId)!;

  return (
    <div
      className="landing-product-stage"
      ref={stage}
    >
      <div className="landing-stage-orbit landing-stage-orbit-one" aria-hidden="true" />
      <div className="landing-stage-orbit landing-stage-orbit-two" aria-hidden="true" />

      <div className="landing-product-window">
        <aside className="landing-mock-sidebar">
          <div className="landing-mock-brand"><BrandMark title="Continuum" /><span>continuum</span></div>
          <nav aria-label="Product preview">
            {navGroups.map((group) => (
              <div className="landing-mock-nav-group" key={group.label || "primary"}>
                {group.label ? <span className="landing-mock-nav-label">{group.label}</span> : null}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeId === item.id;
                  return previewableIds.has(item.id) ? (
                    <button
                      type="button"
                      key={item.id}
                      className={active ? "active" : ""}
                      aria-label={`Preview ${item.label}`}
                      aria-pressed={active}
                      onClick={() => pick(item.id)}
                    >
                      <Icon size={15} aria-hidden="true" /><span>{item.label}</span>
                    </button>
                  ) : (
                    <span className="landing-mock-nav-static" key={item.id}>
                      <Icon size={15} aria-hidden="true" /><span>{item.label}</span>
                    </span>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        <section className="landing-mock-main" aria-live="polite">
          <header>
            <div className="landing-mock-search"><Search size={14} /><span>Search your entire workspace</span><kbd>⌘ K</kbd></div>
            <span className="landing-mock-saved"><i /> Saved</span>
          </header>

          <div className="landing-mock-content" ref={bodyRef} key={activeView.id}>
            <div className="landing-mock-heading">
              <div>
                <span>{activeView.eyebrow}</span>
                <p className="landing-mock-title">{activeView.title}</p>
              </div>
              <strong>{activeView.metric}</strong>
            </div>
            {activeView.body}
          </div>
        </section>
      </div>

      <div className="landing-product-tabs" aria-label="Previewed Continuum areas">
        {heroViews.map((view) => (
          <button
            type="button"
            key={view.id}
            aria-label={`Preview ${view.label}`}
            aria-pressed={activeId === view.id}
            className={activeId === view.id ? "active" : ""}
            onClick={() => pick(view.id)}
          >
            <span>{view.label}</span>
            <i>{activeId === view.id ? <span className="landing-tab-progress" ref={progressRef} /> : null}</i>
          </button>
        ))}
      </div>
    </div>
  );
}

const fragments = [
  { label: "ChatGPT", className: "fragment-a" },
  { label: "Claude", className: "fragment-b" },
  { label: "Research paper", className: "fragment-c" },
  { label: "Google Docs", className: "fragment-d" },
  { label: "Notes", className: "fragment-e" },
  { label: "Zotero", className: "fragment-f" },
  { label: "Browser", className: "fragment-g" },
  { label: "PDF", className: "fragment-h" },
] as const;

export function FragmentationMerge() {
  const scope = useGsap(({ gsap: g, reduced }) => {
    if (reduced) return;

    // Scattered cards drift toward the connected workspace, fade, and reset —
    // driven by one scrubbed-in timeline rather than eight independent loops.
    const timeline = g.timeline({
      repeat: -1,
      repeatDelay: 1.1,
      scrollTrigger: { trigger: scope.current, start: "top 82%", end: "bottom 20%", toggleActions: "play pause resume pause" },
    });

    timeline
      .to(".fragment-card", {
        x: (index: number) => [150, 96, 128, 100, 158, -6, -62, -56][index] ?? 0,
        y: (index: number) => [104, 76, 8, -68, -110, -126, -52, 46][index] ?? 0,
        scale: 0.62,
        opacity: 0,
        duration: 1.5,
        stagger: 0.05,
        ease: "power2.in",
      })
      .to(".fragmentation-result", { scale: 1.02, duration: 0.35, ease: "power2.out" }, "-=0.5")
      .to(".fragmentation-result", { scale: 1, duration: 0.5, ease: "power2.inOut" })
      .to(".fragment-card", { x: 0, y: 0, scale: 1, opacity: 1, duration: 0.75, stagger: 0.03, ease: "power2.out" }, "-=0.2");

    // Pulse travelling along the connector, fading in and out at the ends.
    g.timeline({ repeat: -1, repeatDelay: 1.1 })
      .fromTo(".fragmentation-path > i", { x: 0, opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.out" })
      .to(".fragmentation-path > i", { x: 108, duration: 1.4, ease: "power1.inOut" }, 0)
      .to(".fragmentation-path > i", { opacity: 0, duration: 0.3, ease: "power1.in" }, 1.1);
  }, []);

  return (
    <div className="fragmentation-visual" ref={scope}>
      <div className="fragmentation-scatter" aria-label="Scattered learning tools">
        {fragments.map((fragment) => (
          <div className={`fragment-card ${fragment.className}`} key={fragment.label}>
            <i /><span>{fragment.label}</span>
          </div>
        ))}
      </div>

      <div className="fragmentation-path" aria-hidden="true">
        <span />
        <i />
      </div>

      <div className="fragmentation-result">
        <div className="fragmentation-result-head"><BrandMark title="Continuum" /><div><span>CONTINUUM</span><strong>One connected workspace</strong></div></div>
        <div className="fragmentation-result-map">
          <i className="result-node result-node-main" />
          <i className="result-node result-node-one" />
          <i className="result-node result-node-two" />
          <i className="result-node result-node-three" />
          <i className="result-line result-line-one" />
          <i className="result-line result-line-two" />
          <i className="result-line result-line-three" />
        </div>
        <p>Goals, sources, conversations, notes, code, and progress stay attached to one another.</p>
      </div>
    </div>
  );
}

const workflowSteps = [
  { id: "ask", label: "Ask", title: "Teach me Quantum Annealing.", meta: "One question starts a connected workflow.", status: "Question understood" },
  { id: "search", label: "Search", title: "Searching the scholarly graph", meta: "OpenAlex returns foundational and recent work.", status: "68 papers evaluated" },
  { id: "source", label: "Source", title: "Importing trusted references", meta: "Selected papers arrive from Zotero with citations intact.", status: "6 sources preserved" },
  { id: "plan", label: "Plan", title: "Building your learning roadmap", meta: "Prerequisites become a branched path, not a generic syllabus.", status: "8 concepts sequenced" },
  { id: "practice", label: "Practice", title: "Generating retrieval practice", meta: "Questions target the concepts with the weakest evidence.", status: "12 questions ready" },
  { id: "mastery", label: "Mastery", title: "Updating what you actually know", meta: "Confidence changes only after verified activity.", status: "Mastery now 68%" },
  { id: "memory", label: "Remember", title: "Linking everything for next time", meta: "The checkpoint is available in every connected assistant.", status: "Context saved" },
] as const;

export function WorkflowShowcase() {
  const [activeStep, setActiveStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion() || paused) return;
    const timer = window.setInterval(() => setActiveStep((current) => (current + 1) % workflowSteps.length), 3000);
    return () => window.clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    const node = contentRef.current;
    if (!node || prefersReducedMotion()) return;
    const context = gsap.context(() => {
      gsap.fromTo(node, { opacity: 0, x: 16 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" });
      gsap.fromTo(node.querySelectorAll(".workflow-records > div"),
        { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.03, ease: "power2.out" });
    }, node);
    return () => context.revert();
  }, [activeStep]);

  const active = workflowSteps[activeStep]!;

  return (
    <div
      className="workflow-showcase"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="workflow-step-list" role="tablist" aria-label="Quantum annealing workflow">
        {workflowSteps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            role="tab"
            aria-selected={index === activeStep}
            className={index === activeStep ? "active" : ""}
            onClick={() => setActiveStep(index)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{step.label}</strong>
            <i />
          </button>
        ))}
      </div>

      <div className="workflow-window">
        <header><div><i /><i /><i /></div><span>Quantum Annealing · Learning project</span><b>Linked</b></header>
        <div className="workflow-window-content" ref={contentRef} key={active.id}>
          <div className="workflow-window-label"><span>{String(activeStep + 1).padStart(2, "0")}</span>{active.label}</div>
          <h3>{active.title}</h3>
          <p>{active.meta}</p>
          <div className="workflow-activity">
            <span><i className="working-dot" />Continuum is connecting your context</span>
            <strong><Check size={14} />{active.status}</strong>
          </div>
          <div className="workflow-records">
            {workflowSteps.slice(0, activeStep + 1).map((step, index) => (
              <div key={step.id}>
                <Check size={12} /><span>{step.label}</span><b>{index === activeStep ? "Now" : "Linked"}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
