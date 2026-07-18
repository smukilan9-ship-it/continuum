"use client";

import {
  Activity,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Command,
  FlaskConical,
  Goal,
  Link2,
  Menu,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ActivityScreen, GoalsScreen, IntegrationsScreen, LearnScreen, MemoryScreen, ResearchScreen, TodayScreen } from "@/components/screens";
import { demoUser, initialSchedule } from "@/lib/demo-data";
import { Tooltip } from "@/components/ui";

export type View = "today" | "goals" | "learn" | "research" | "memory" | "integrations" | "activity";
export type ScheduleItem = (typeof initialSchedule)[number];

const navItems: Array<{ id: View; label: string; icon: typeof CalendarDays }> = [
  { id: "today", label: "Today", icon: CalendarDays },
  { id: "goals", label: "Goals", icon: Goal },
  { id: "learn", label: "Learn", icon: BookOpen },
  { id: "research", label: "Research", icon: FlaskConical },
  { id: "memory", label: "Memory", icon: Sparkles },
  { id: "integrations", label: "Integrations", icon: Link2 },
  { id: "activity", label: "Activity", icon: Activity },
];

const titles: Record<View, string> = {
  today: "Today",
  goals: "Goals",
  learn: "Learn",
  research: "Research",
  memory: "Memory",
  integrations: "Integrations",
  activity: "Activity",
};

export function ContinuumApp() {
  const [view, setView] = useState<View>("today");
  const [mobileNav, setMobileNav] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleItem[]>(initialSchedule);
  const [learningComplete, setLearningComplete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const navigate = (next: View) => {
    setView(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const markLearningComplete = () => {
    setLearningComplete(true);
    setSchedule((items) => items.map((item) => item.id === "block_diagnostic_1" ? { ...item, status: "done" } : item));
    setToast("Checkpoint verified. Mastery and today’s plan are now in sync.");
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="sidebar-head">
          <button className="brand" onClick={() => navigate("today")} aria-label="Continuum home">
            <span className="brand-symbol"><span /><span /><span /></span>
            <span>continuum</span>
          </button>
          <button className="icon-button mobile-only" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={19} /></button>
        </div>
        <nav className="main-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => navigate(item.id)}>
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.id === "learn" && <i className="nav-dot" />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-spacer" />
        <button className="command-hint" onClick={() => setCommandOpen(true)}>
          <Command size={15} /><span>Ask Continuum</span><kbd>⌘ K</kbd>
        </button>
        <div className="profile-card">
          <div className="avatar">{demoUser.initials}</div>
          <div><strong>{demoUser.name}</strong><span>{demoUser.level}</span></div>
          <ChevronDown size={15} />
        </div>
      </aside>

      {mobileNav && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <span className="mobile-title">{titles[view]}</span>
          <button className="search-button" onClick={() => setCommandOpen(true)}><Search size={16} /><span>Search anything…</span><kbd>⌘ K</kbd></button>
          <div className="topbar-right">
            <Tooltip label="12-day verified progress streak"><div className="streak"><span>✦</span>{demoUser.streak} day streak</div></Tooltip>
            <div className="sync-state"><i /> All changes saved</div>
          </div>
        </header>

        <div className="content-wrap">
          {view === "today" && <TodayScreen schedule={schedule} setSchedule={setSchedule} onNavigate={navigate} showToast={setToast} learningComplete={learningComplete} />}
          {view === "goals" && <GoalsScreen onNavigate={navigate} showToast={setToast} />}
          {view === "learn" && <LearnScreen completed={learningComplete} onComplete={markLearningComplete} showToast={setToast} />}
          {view === "research" && <ResearchScreen showToast={setToast} />}
          {view === "memory" && <MemoryScreen showToast={setToast} />}
          {view === "integrations" && <IntegrationsScreen showToast={setToast} />}
          {view === "activity" && <ActivityScreen />}
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={19} /><span>{item.label}</span></button>;
        })}
      </nav>

      {commandOpen && <CommandPalette onClose={() => setCommandOpen(false)} onNavigate={navigate} />}
      {toast && <div className="toast" role="status"><span className="toast-icon">✓</span>{toast}<button onClick={() => setToast(null)} aria-label="Dismiss"><X size={15} /></button></div>}
    </div>
  );
}

function CommandPalette({ onClose, onNavigate }: { onClose: () => void; onNavigate: (view: View) => void }) {
  const [query, setQuery] = useState("");
  const actions = [
    { label: "Start the Physics diagnostic", hint: "Learn", view: "learn" as View },
    { label: "Show my highest-priority task", hint: "Today", view: "today" as View },
    { label: "Find evidence for grouped validation", hint: "Research", view: "research" as View },
    { label: "Inspect what Continuum remembers", hint: "Memory", view: "memory" as View },
    { label: "Explain model routing", hint: "Activity", view: "activity" as View },
  ].filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="command-overlay" onMouseDown={onClose}>
      <section className="command-panel" onMouseDown={(event) => event.stopPropagation()} aria-label="Continuum command menu">
        <div className="command-input"><Sparkles size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask about your goals, learning, or research…" /><kbd>esc</kbd></div>
        <div className="command-results">
          <p>Suggested actions</p>
          {actions.map((action) => <button key={action.label} onClick={() => { onNavigate(action.view); onClose(); }}><span>{action.label}</span><small>{action.hint}</small></button>)}
        </div>
        <footer><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span>Memory writes are off until confirmed</span></footer>
      </section>
    </div>
  );
}
