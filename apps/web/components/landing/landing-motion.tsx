"use client";

import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import {
  BookOpen,
  BrainCircuit,
  Check,
  Code2,
  FileText,
  FolderKanban,
  FlaskConical,
  MessageSquareText,
  Network,
  Search,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";

const productViews = [
  {
    id: "assistant",
    label: "Assistant",
    icon: MessageSquareText,
    eyebrow: "Context-aware assistant",
    title: "Ready to continue your quantum computing path.",
    detail: "Continuum retrieved your goal, the three papers you kept, and the concept you struggled with yesterday.",
    metric: "12 relevant memories",
    primary: "Explain tunneling without repeating the basics",
    secondary: "Grounded in your learning path",
  },
  {
    id: "research",
    label: "Research",
    icon: FlaskConical,
    eyebrow: "Research graph",
    title: "Six foundational papers, connected by evidence.",
    detail: "OpenAlex relationships, Zotero sources, and your project claims stay linked instead of disappearing into browser tabs.",
    metric: "24 cited sources",
    primary: "Quantum annealing for optimization",
    secondary: "4 related works found",
  },
  {
    id: "learn",
    label: "Learn",
    icon: BookOpen,
    eyebrow: "Adaptive learning",
    title: "Your next lesson targets the gap that matters.",
    detail: "Mastery evidence updates the path after every explanation, practice set, and verified checkpoint.",
    metric: "68% mastery",
    primary: "Adiabatic theorem → energy gaps",
    secondary: "Next review in 2 days",
  },
  {
    id: "projects",
    label: "Projects",
    icon: FolderKanban,
    eyebrow: "Project intelligence",
    title: "Every decision still knows why it was made.",
    detail: "Conversations, documents, tasks, research, and code remain attached to the outcome they are meant to change.",
    metric: "8 linked decisions",
    primary: "Quantum optimization literature review",
    secondary: "3 milestones on track",
  },
  {
    id: "code",
    label: "Code",
    icon: Code2,
    eyebrow: "Integrated code workspace",
    title: "Run the experiment with the research beside it.",
    detail: "Generate, execute, and debug Python while Continuum keeps the source paper and project hypothesis in view.",
    metric: "14 checks passed",
    primary: "annealing_schedule.py",
    secondary: "Local Ollama route active",
  },
  {
    id: "memory",
    label: "Memory",
    icon: BrainCircuit,
    eyebrow: "Durable memory",
    title: "The useful context survives every conversation.",
    detail: "Continuum remembers verified goals, evidence, decisions, and progress—not an endless replay of raw transcripts.",
    metric: "342 verified records",
    primary: "One academic memory",
    secondary: "Available across every tool",
  },
] as const;

type ProductViewId = (typeof productViews)[number]["id"];

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 26 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function HeroProductMockup() {
  const [activeId, setActiveId] = useState<ProductViewId>("assistant");
  const reduceMotion = useReducedMotion();
  const shellRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: shellRef, offset: ["start end", "end start"] });
  const backgroundY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [-18, 22]);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => {
      setActiveId((current) => {
        const index = productViews.findIndex((view) => view.id === current);
        return productViews[(index + 1) % productViews.length]!.id;
      });
    }, 3600);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  const activeView = productViews.find((view) => view.id === activeId)!;

  return (
    <div className="landing-product-stage" ref={shellRef}>
      <motion.div className="landing-stage-orbit landing-stage-orbit-one" style={{ y: backgroundY }} aria-hidden="true" />
      <motion.div className="landing-stage-orbit landing-stage-orbit-two" style={{ y: backgroundY }} aria-hidden="true" />
      <motion.div
        className="landing-product-window"
        animate={reduceMotion ? undefined : { y: [0, -5, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      >
        <aside className="landing-mock-sidebar">
          <div className="landing-mock-brand"><BrandMark title="Continuum" /><span>continuum</span></div>
          <nav aria-label="Product preview">
            {productViews.map((view) => {
              const Icon = view.icon;
              const active = activeId === view.id;
              return (
                <button
                  type="button"
                  key={view.id}
                  className={active ? "active" : ""}
                  aria-label={`Preview ${view.label}`}
                  aria-pressed={active}
                  onClick={() => setActiveId(view.id)}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{view.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="landing-mock-recent">
            <span>Recent</span>
            <p>Quantum annealing</p>
            <p>Research synthesis</p>
            <p>Python experiment</p>
          </div>
        </aside>

        <section className="landing-mock-main" aria-live="polite">
          <header>
            <div className="landing-mock-search"><Search size={14} /><span>Search your entire workspace</span><kbd>⌘ K</kbd></div>
            <span className="landing-mock-saved"><i /> Saved</span>
          </header>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeView.id}
              className="landing-mock-content"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -7 }}
              transition={{ duration: 0.28 }}
            >
              <div className="landing-mock-heading">
                <div>
                  <span>{activeView.eyebrow}</span>
                  <p className="landing-mock-title">{activeView.title}</p>
                </div>
                <strong>{activeView.metric}</strong>
              </div>

              <div className="landing-mock-grid">
                <article className="landing-mock-primary-card">
                  <span className="landing-mock-card-label">Next best action</span>
                  <p className="landing-mock-action-title">{activeView.primary}</p>
                  <p>{activeView.detail}</p>
                  <button type="button"><span>Continue</span><span aria-hidden="true">→</span></button>
                </article>

                <article className="landing-mock-context-card">
                  <span className="landing-mock-card-label">Connected context</span>
                  <div className="landing-context-row"><FileText size={14} /><span>Adiabatic quantum computation</span><b>PDF</b></div>
                  <div className="landing-context-row"><Network size={14} /><span>Concept graph</span><b>18</b></div>
                  <div className="landing-context-row"><MessageSquareText size={14} /><span>Last checkpoint</span><b>Now</b></div>
                  <p><Check size={13} /> {activeView.secondary}</p>
                </article>
              </div>

              <div className="landing-mock-lower">
                <div>
                  <span>Knowledge graph</span>
                  <div className="landing-mini-graph" role="img" aria-label="Animated knowledge graph">
                    <i className="node node-a" /><i className="node node-b" /><i className="node node-c" /><i className="node node-d" />
                    <span className="edge edge-a" /><span className="edge edge-b" /><span className="edge edge-c" />
                  </div>
                </div>
                <div className="landing-citation-stack">
                  <span>Citations</span>
                  <p><b>01</b> Kadowaki &amp; Nishimori</p>
                  <p><b>02</b> Albash &amp; Lidar</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </section>
      </motion.div>

      <div className="landing-product-tabs" aria-label="Previewed Continuum areas">
        {productViews.map((view) => (
          <button
            type="button"
            key={view.id}
            aria-label={`Preview ${view.label}`}
            aria-pressed={activeId === view.id}
            className={activeId === view.id ? "active" : ""}
            onClick={() => setActiveId(view.id)}
          >
            <span>{view.label}</span><i />
          </button>
        ))}
      </div>
    </div>
  );
}

const fragments = [
  { label: "ChatGPT", className: "fragment-a", x: 154, y: 106 },
  { label: "Claude", className: "fragment-b", x: 92, y: 74 },
  { label: "Research paper", className: "fragment-c", x: 122, y: 6 },
  { label: "Google Docs", className: "fragment-d", x: 94, y: -70 },
  { label: "Notes", className: "fragment-e", x: 154, y: -112 },
  { label: "Zotero", className: "fragment-f", x: -5, y: -128 },
  { label: "Browser", className: "fragment-g", x: -64, y: -54 },
  { label: "PDF", className: "fragment-h", x: -58, y: 48 },
] as const;

export function FragmentationMerge() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: "-25% 0px -25% 0px" });
  const reduceMotion = useReducedMotion();

  return (
    <div className="fragmentation-visual" ref={ref}>
      <div className="fragmentation-scatter" aria-label="Scattered learning tools">
        {fragments.map((fragment, index) => (
          <motion.div
            key={fragment.label}
            className={`fragment-card ${fragment.className}`}
            animate={reduceMotion || !inView ? { x: 0, y: 0, opacity: 1, scale: 1 } : {
              x: [0, fragment.x, fragment.x, 0],
              y: [0, fragment.y, fragment.y, 0],
              opacity: [1, 1, 0, 1],
              scale: [1, 0.82, 0.55, 1],
            }}
            transition={{ duration: 4.8, delay: index * 0.07, repeat: Infinity, repeatDelay: 1.6, ease: "easeInOut" }}
          >
            <i />
            <span>{fragment.label}</span>
          </motion.div>
        ))}
      </div>

      <div className="fragmentation-path" aria-hidden="true">
        <span />
        <motion.i
          animate={reduceMotion ? undefined : { x: [0, 115], opacity: [0, 1, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1.2 }}
        />
      </div>

      <motion.div
        className="fragmentation-result"
        animate={reduceMotion || !inView ? undefined : { scale: [1, 1.025, 1] }}
        transition={{ duration: 4, repeat: Infinity }}
      >
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
      </motion.div>
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
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => {
      setActiveStep((current) => (current + 1) % workflowSteps.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  const active = workflowSteps[activeStep]!;

  return (
    <div className="workflow-showcase">
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
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active.id}
            className="workflow-window-content"
            initial={reduceMotion ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, x: -12 }}
            transition={{ duration: 0.3 }}
          >
            <div className="workflow-window-label"><span>{String(activeStep + 1).padStart(2, "0")}</span>{active.label}</div>
            <h3>{active.title}</h3>
            <p>{active.meta}</p>
            <div className="workflow-activity">
              <span><i className="working-dot" />Continuum is connecting your context</span>
              <strong><Check size={14} />{active.status}</strong>
            </div>
            <div className="workflow-records">
              {workflowSteps.slice(0, activeStep + 1).map((step, index) => (
                <motion.div key={step.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.035 }}>
                  <Check size={12} /><span>{step.label}</span><b>{index === activeStep ? "Now" : "Linked"}</b>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
