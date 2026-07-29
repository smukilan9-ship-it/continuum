"use client";

import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  Code2,
  Database,
  FileText,
  FlaskConical,
  MessageCircle,
  Quote,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * Each workspace view renders its OWN body. The previous version swapped only a
 * headline above four fixed cards, so every tab looked identical and the hero
 * promised a product that was the same screen six times.
 */
export type HeroView = {
  id: string;
  label: string;
  icon: typeof CalendarDays;
  eyebrow: string;
  title: string;
  metric: string;
  body: ReactNode;
};

function TodayBody() {
  return (
    <div className="hv hv-today">
      <div className="hv-next">
        <span className="hv-tag">Next action</span>
        <strong>Timed drill — parabolas &amp; circles</strong>
        <p>Chosen because Module 2 geometry is the widest gap between your target and last mock.</p>
        <span className="hv-cta">Start 25-minute block <ArrowRight size={13} /></span>
      </div>
      <ol className="hv-schedule">
        <li><span>09:00</span><i className="done" /><div><strong>Review flagged SAT questions</strong><small>Completed · 18 min</small></div></li>
        <li className="now"><span>11:30</span><i /><div><strong>Geometry drill</strong><small>Now · 25 min</small></div></li>
        <li><span>14:00</span><i /><div><strong>SQL transactions practice</strong><small>Queued · 30 min</small></div></li>
        <li><span>16:30</span><i /><div><strong>OASIS registration write-up</strong><small>Queued · 45 min</small></div></li>
      </ol>
    </div>
  );
}

function AssistantBody() {
  return (
    <div className="hv hv-assistant">
      <div className="hv-msg hv-msg-user"><span>You</span><p>Explain tunneling without repeating the basics.</p></div>
      <div className="hv-msg hv-msg-ai">
        <span><Sparkles size={11} /> Continuum</span>
        <p>You already have the barrier model. The piece you were missing yesterday is that the transmission probability falls <em>exponentially</em> with barrier width — which is why annealing gaps matter more than gap depth.</p>
        <div className="hv-cites"><b>3 sources</b><i>Albash &amp; Lidar §2.1</i><i>your note · 24 Jul</i></div>
      </div>
      <div className="hv-scopes">
        <span className="on"><Check size={10} />Approved memory</span>
        <span className="on"><Check size={10} />Current learning</span>
        <span>Research library</span>
      </div>
    </div>
  );
}

function LearnBody() {
  const path = [
    { name: "Superposition", pct: 100, state: "Mastered" },
    { name: "Hamiltonians", pct: 88, state: "Mastered" },
    { name: "Adiabatic theorem", pct: 68, state: "In progress" },
    { name: "Energy gaps", pct: 24, state: "Next" },
    { name: "Annealing schedules", pct: 0, state: "Locked" },
  ];
  return (
    <div className="hv hv-learn">
      <div className="hv-mastery">
        {path.map((step) => (
          <div className="hv-step" key={step.name}>
            <div><strong>{step.name}</strong><small>{step.state}</small></div>
            <div className="hv-bar"><i style={{ width: `${step.pct}%` }} data-full={step.pct === 100} /></div>
            <b>{step.pct}%</b>
          </div>
        ))}
      </div>
      <p className="hv-note"><Check size={12} />Mastery moved only after your last verified practice set — not for time spent.</p>
    </div>
  );
}

function ResearchBody() {
  return (
    <div className="hv hv-research">
      <div className="hv-papers">
        <div className="hv-paper"><FileText size={13} /><div><strong>Quantum annealing in the transverse Ising model</strong><small>Kadowaki &amp; Nishimori · 1998</small></div><b>4.2k</b></div>
        <div className="hv-paper"><FileText size={13} /><div><strong>Adiabatic quantum computation</strong><small>Albash &amp; Lidar · 2018</small></div><b>1.8k</b></div>
        <div className="hv-paper"><FileText size={13} /><div><strong>Perspectives of quantum annealing</strong><small>Hauke et al. · 2020</small></div><b>930</b></div>
      </div>
      <div className="hv-claim">
        <span className="hv-tag">Your claim</span>
        <p><Quote size={11} />Gap scaling, not qubit count, bounds practical annealing speedup.</p>
        <div className="hv-claim-meta"><span className="ok"><Check size={10} />2 supporting</span><span className="warn">1 unresolved</span></div>
      </div>
    </div>
  );
}

function CodeBody() {
  return (
    <div className="hv hv-code">
      <div className="hv-editor">
        <div className="hv-editor-head"><i /><i /><i /><span>annealing_schedule.py</span></div>
        <pre>
          <code>
            <span className="ln">1</span><span><span className="kw">import</span> numpy <span className="kw">as</span> np{"\n"}</span>
            <span className="ln">2</span><span>{"\n"}</span>
            <span className="ln">3</span><span><span className="kw">def</span> <span className="fn">gap</span>(s, A, B):{"\n"}</span>
            <span className="ln">4</span><span>{"    "}<span className="kw">return</span> np.sqrt(A(s)**<span className="num">2</span> + B(s)**<span className="num">2</span>){"\n"}</span>
            <span className="ln">5</span><span>{"\n"}</span>
            <span className="ln">6</span><span><span className="fn">print</span>(<span className="str">f&quot;min gap: {"{"}gap(0.5, A, B):.4f{"}"}&quot;</span>){"\n"}</span>
          </code>
        </pre>
      </div>
      <div className="hv-console">
        <div className="hv-console-head"><TerminalSquare size={11} />Console<b>exit 0 · 11 ms</b></div>
        <p>min gap: 0.0182</p>
      </div>
    </div>
  );
}

function MemoryBody() {
  return (
    <div className="hv hv-memory">
      <div className="hv-records">
        <div className="hv-record"><span className="k k-dec">Decision</span><p>Registration stays similarity-only; no non-rigid warp before a cross-K test.</p><small>3 Jul</small></div>
        <div className="hv-record"><span className="k k-fact">Finding</span><p>Certification gate fails closed on ANHIR — every pass verdict has low error.</p><small>24 Jul</small></div>
        <div className="hv-record"><span className="k k-mis">Resolved</span><p>Queries don&apos;t persist without <code>commit()</code>.</p><small>26 Jul</small></div>
      </div>
      <div className="hv-mem-foot">
        <span><Database size={11} />342 records</span>
        <span className="hv-sync"><Check size={10} />Synced to Obsidian</span>
      </div>
    </div>
  );
}

export const heroViews: HeroView[] = [
  { id: "today", label: "Today", icon: CalendarDays, eyebrow: "Today", title: "Your next action, already decided.", metric: "3 due", body: <TodayBody /> },
  { id: "assistant", label: "Assistant", icon: MessageCircle, eyebrow: "Assistant", title: "The smallest slice of context that answers it.", metric: "12 memories", body: <AssistantBody /> },
  { id: "learn", label: "Learn", icon: BookOpen, eyebrow: "Learn", title: "A path that moves only on evidence.", metric: "68% mastery", body: <LearnBody /> },
  { id: "research", label: "Research", icon: FlaskConical, eyebrow: "Research", title: "Claims that keep their sources attached.", metric: "24 sources", body: <ResearchBody /> },
  { id: "code", label: "Code", icon: Code2, eyebrow: "Code", title: "Run the experiment beside the paper.", metric: "ran in 11ms", body: <CodeBody /> },
  { id: "memory", label: "Memory", icon: Database, eyebrow: "Memory", title: "Durable context, retrieved by relevance.", metric: "342 records", body: <MemoryBody /> },
];
