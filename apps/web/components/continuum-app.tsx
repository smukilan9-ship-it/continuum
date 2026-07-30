"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { AuthUser } from "@continuum/db";
import {
  Activity,
  BookOpen,
  CalendarDays,
  Command,
  Code2,
  Database,
  FlaskConical,
  Library,
  Goal,
  Link2,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { AssistantProvider, useAssistantController } from "@/components/assistant/use-assistant";
import type { AssistantSession, PageContext } from "@/components/assistant/types";
import { BrandMark } from "@/components/brand-mark";
import { CommandPalette, type PaletteAction } from "@/components/shell/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { normalizeWorkspaceState, WorkspaceScreens, type WorkspaceState } from "@/components/workspace-screens";
import { canonicalView, workspaceMeta, workspacePath, type WorkspaceView } from "@/lib/workspace-routes";

export type View = WorkspaceView;

type NavItem = { id: WorkspaceView; label: string; icon: typeof CalendarDays };
type NavGroup = { label: string; items: NavItem[]; variant?: "primary" | "utility" };

/**
 * The sidebar lists the user's own goals, not Continuum's feature list.
 *
 * It used to be thirteen destinations grouped by storage ("Work", "Sources"),
 * so a goal's plan, material, study, and research lived in four unconnected
 * tabs and nothing on screen said which goal you were working on. The fixed
 * entries are now only the things that genuinely span goals; everything else
 * hangs off the goal itself.
 */
const navGroups: NavGroup[] = [
  {
    label: "",
    variant: "primary",
    items: [
      { id: "today", label: "Today", icon: CalendarDays },
      { id: "assistant", label: "Ask Continuum", icon: MessageCircle },
      { id: "goals", label: "Plan", icon: Goal },
    ],
  },
  {
    label: "Across your work",
    items: [
      { id: "learn", label: "Learn", icon: BookOpen },
      { id: "code", label: "Code", icon: Code2 },
      { id: "research", label: "Research", icon: FlaskConical },
      { id: "library", label: "Library", icon: Library },
      { id: "memory", label: "Context", icon: Database },
    ],
  },
  {
    label: "",
    variant: "utility",
    items: [
      { id: "activity", label: "Review", icon: Activity },
      { id: "integrations", label: "Connections", icon: Link2 },
      { id: "account", label: "Settings", icon: ShieldCheck },
    ],
  },
];

const mobileItems: NavItem[] = [
  { id: "today", label: "Today", icon: CalendarDays },
  { id: "assistant", label: "Assistant", icon: MessageCircle },
  { id: "learn", label: "Learn", icon: BookOpen },
  { id: "code", label: "Code", icon: Code2 },
];

const IntegrationsScreen = dynamic(() => import("@/components/integrations-screen").then((module) => module.IntegrationsScreen), { loading: () => <ScreenLoading /> });

function ScreenLoading() {
  return <div className="screen-loading" role="status" aria-label="Loading workspace"><span /><span /><span /></div>;
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

const SKIP_ONBOARDING_KEY = "continuum.onboarding.skipped.v1";
const TOUR_KEY = "continuum.tour.completed.v1";

/** The three things a new user needs to know before the app makes sense. */
const TOUR_STEPS = [
  { title: "Today is your next action", body: "One decided next step, with the reasoning behind it — not a blank page to plan from." },
  { title: "Plan is your week", body: "A deterministic draft you can move, resize, and edit before anything is saved." },
  { title: "⌘K finds anything, ⌘J asks about it", body: "Search every goal, source, paper, conversation, and concept — then ask Continuum without leaving the page." },
] as const;

/**
 * §8.5: the panel attaches the page it was opened from as a removable chip.
 * Derived from the route rather than from each screen, so a screen cannot
 * forget to supply it.
 */
function pageContextFor(view: WorkspaceView, state: WorkspaceState | undefined, goalId?: string): PageContext | undefined {
  if (view === "goal" && goalId) {
    const goal = state?.goals.find((row) => String(row.id) === goalId);
    return { kind: "goal", id: goalId, label: `Goal: ${String(goal?.title ?? "this goal")}` };
  }
  if (view === "research") {
    const project = state?.projects[0];
    return project ? { kind: "project", id: String(project.id), label: `Project: ${String(project.title)}` } : undefined;
  }
  if (view === "code") return { kind: "build", label: "Build: current file and last run" };
  if (view === "today" || view === "goals") return { kind: "week", label: "This week" };
  return undefined;
}

/** What the shell chrome needs, read once per route by the server component. */
export type ShellData = {
  goals: Array<{ id: string; title: string; progress: number; targetDate: string; status: string }>;
  projects: Array<{ id: string; title: string; goalId: string | null }>;
  pendingProposals: number;
};

export function ContinuumApp({ user, initialState, shell, view, goalId, serverNow, needsOnboarding = false }: { user: AuthUser; initialState: Record<string, unknown>; shell: ShellData; view: WorkspaceView; goalId?: string; serverNow: string; needsOnboarding?: boolean }) {
  const router = useRouter();
  const activeGoalId = goalId;
  const [mobileNav, setMobileNav] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tourStep, setTourStep] = useState<number>();
  const currentView = view;
  const sidebarRef = useRef<HTMLElement>(null);
  const closeNavigationRef = useRef<HTMLButtonElement>(null);
  const openNavigationRef = useRef<HTMLButtonElement>(null);
  const mainAreaRef = useRef<HTMLElement>(null);
  const mobileNavigationRef = useRef<HTMLElement>(null);

  /**
   * C25: the per-view `Map<view, state>` cache, its in-flight set, its manual
   * `pushState` and its `popstate` listener are gone. They reimplemented the
   * router — every route already server-renders its own view — and the cost was
   * a client holding N views of stale workspace data and a Back button that
   * only worked because a second listener put it back. Navigation is now real
   * router navigation; the shell keeps only UI state.
   */
  const meta = workspaceMeta[currentView];
  const state = useMemo(() => normalizeWorkspaceState(initialState), [initialState]);
  const pendingProposals = shell.pendingProposals;

  /**
   * Nearest deadline first, completed last, capped so a long list never pushes
   * the rest of the sidebar out of reach. Read from shell data, so it is right
   * on every route rather than only on the ones that select goals.
   */
  const sidebarGoals = useMemo(() => [...shell.goals]
    .sort((left, right) => {
      const done = Number(left.status === "completed") - Number(right.status === "completed");
      if (done !== 0) return done;
      return String(left.targetDate ?? "").localeCompare(String(right.targetDate ?? ""));
    })
    .slice(0, 8), [shell.goals]);
  const moreActive = !mobileItems.some((item) => canonicalView(currentView) === item.id);

  const navigate = useCallback((next: WorkspaceView) => {
    setMobileNav(false);
    setCommandOpen(false);
    router.push(workspacePath[next]);
  }, [router]);

  // `router.refresh()` re-runs the server component for this route, which is
  // what a screen means when it says its data changed.
  const refreshCurrent = useCallback(async () => { router.refresh(); }, [router]);

  // One conversation, mounted twice (§8.5, AC-A9): the `/assistant` screen and
  // the `⌘J` panel both read this controller, so switching between them never
  // loses or forks the thread.
  const assistant = useAssistantController({
    initialSessions: (state?.assistantSessions ?? []) as unknown as AssistantSession[],
    onWorkspaceChange: refreshCurrent,
  });
  const { setPageContext, setPanelOpen, panelOpen } = assistant;

  const pageContext = useMemo(() => pageContextFor(currentView, state, activeGoalId), [currentView, state, activeGoalId]);
  useEffect(() => { setPageContext(pageContext); }, [pageContext, setPageContext]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
        return;
      }
      // §8.8: `⌘J` toggles the assistant from anywhere, including while typing —
      // asking about what you are writing is the point of having it everywhere.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setPanelOpen(!panelOpen);
        return;
      }
      // `?` opens the shortcut sheet, but never while the user is typing.
      const target = event.target as HTMLElement | null;
      const typing = target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (event.key === "?" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setShortcutsOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [panelOpen, setPanelOpen]);

  // First run: point an un-onboarded user at /welcome unless they chose to explore.
  useEffect(() => {
    if (!needsOnboarding) return;
    if (window.localStorage.getItem(SKIP_ONBOARDING_KEY) === "1") return;
    window.location.assign("/welcome");
  }, [needsOnboarding]);

  // The tour runs once, after a plan exists, and is resumable from Account.
  useEffect(() => {
    if (needsOnboarding || !state?.goals.length) return;
    if (window.localStorage.getItem(TOUR_KEY) === "1") return;
    setTourStep(0);
  }, [needsOnboarding, state?.goals.length]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 840px)");
    const sync = () => {
      setCompactNavigation(query.matches);
      if (!query.matches) setMobileNav(false);
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const setInert = (element: HTMLElement | null, inert: boolean) => {
      if (!element) return;
      (element as HTMLElement & { inert: boolean }).inert = inert;
    };
    setInert(sidebarRef.current, compactNavigation && !mobileNav);
    setInert(mainAreaRef.current, compactNavigation && mobileNav);
    setInert(mobileNavigationRef.current, compactNavigation && mobileNav);

    if (!compactNavigation || !mobileNav) return;
    closeNavigationRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMobileNav(false);
      window.requestAnimationFrame(() => openNavigationRef.current?.focus());
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [compactNavigation, mobileNav]);

  const closeMobileNavigation = () => {
    setMobileNav(false);
    window.requestAnimationFrame(() => openNavigationRef.current?.focus());
  };

  async function signOut() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) window.location.assign("/login");
    else setToast("Sign out failed. Your current session is still active.");
  }

  /** §8.4's minimum action set — verbs first, so the palette is a command bar
   *  and not only a finder. */
  const paletteActions = useMemo<PaletteAction[]>(() => [
    { id: "ask", label: "Ask Continuum about…", hint: "Open the assistant with this page attached", run: () => assistant.askFromPage({ ...(pageContext ? { page: pageContext } : {}) }) },
    { id: "new-goal", label: "New goal", hint: "Add an outcome with a deadline", run: () => navigate("goals") },
    { id: "new-task", label: "New task", hint: "Add work to a goal", run: () => navigate("goals") },
    { id: "new-project", label: "New project", hint: "Start a research project", run: () => navigate("research") },
    { id: "add-source", label: "Add a source", hint: "Bring a paper or document into your Library", run: () => navigate("library") },
    { id: "build-week", label: "Build my week", hint: "Draft a schedule from your real deadlines", run: () => navigate("goals") },
    { id: "study", label: "Start a study session", hint: "Practise the concept you are weakest on", run: () => navigate("learn") },
    { id: "open-build", label: "Open Build", hint: "Write and run code beside your material", run: () => navigate("code") },
    { id: "review", label: "Review proposals", hint: "Approve or reject pending changes", run: () => navigate("activity"), ...(pendingProposals ? { badge: `(${pendingProposals})` } : {}) },
    { id: "settings", label: "Open settings", hint: "Account, appearance, AI, connections, privacy", run: () => navigate("account") },
  ], [assistant, navigate, pageContext, pendingProposals]);

  return (
    <AssistantProvider value={assistant}>
    <div className="app-shell">
      <aside
        ref={sidebarRef}
        className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}
        aria-label="Workspace navigation"
        aria-hidden={compactNavigation && !mobileNav ? true : undefined}
      >
        <div className="sidebar-head">
          <Link className="brand" href={workspacePath.today} aria-label="Continuum workspace home">
            <BrandMark className="brand-symbol" />
            <span>continuum</span>
          </Link>
          <button ref={closeNavigationRef} className="icon-button mobile-only" onClick={closeMobileNavigation} aria-label="Close navigation"><X size={20} /></button>
        </div>

        <nav className="main-nav" aria-label="Primary navigation">
          {navGroups.map((group, index) => (
            <div className={`nav-group${group.variant ? ` nav-group-${group.variant}` : ""}`} key={group.label || `group-${index}`}>
              {group.label ? <p>{group.label}</p> : null}
              {group.items.map((item) => {
                const Icon = item.icon;
                const count = item.id === "activity" ? (state?.proposals.filter((proposal) => proposal.status === "pending").length ?? 0) : undefined;
                const active = canonicalView(currentView) === item.id;
                return (
                  <Link key={item.id} href={workspacePath[item.id]} className={active ? "nav-item active" : "nav-item"} aria-current={active ? "page" : undefined}>
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{item.label}</span>
                    {typeof count === "number" && count > 0 ? <small aria-label={`${count} pending`}>{count}</small> : null}
                  </Link>
                );
              })}
            </div>
          ))}

          {/* The user's own goals, between the daily entry points and the
              cross-cutting tools, so the sidebar reads as their work rather than
              as a menu of Continuum's features. */}
          {sidebarGoals.length ? (
            <div className="nav-group nav-group-goals">
              <p>Your goals</p>
              {sidebarGoals.map((goal) => {
                const id = String(goal.id ?? "");
                const progress = Math.round(Number(goal.progress ?? 0) * 100);
                const active = currentView === "goal" && activeGoalId === id;
                return (
                  <Link
                    key={id}
                    href={`/g/${encodeURIComponent(id)}` as Route}
                    className={active ? "nav-goal active" : "nav-goal"}
                    aria-current={active ? "page" : undefined}
                    title={String(goal.title ?? "")}
                    onClick={() => setMobileNav(false)}
                  >
                    <span className="nav-goal-title">{String(goal.title ?? "Untitled goal")}</span>
                    <small aria-label={`${progress}% complete`}>{progress}%</small>
                    <i className="nav-goal-progress" style={{ width: `${Math.max(3, progress)}%` }} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          ) : null}
        </nav>

        <div className="sidebar-spacer" />
        <button className="command-hint" onClick={() => setCommandOpen(true)}><Command size={16} /><span>Jump to anything</span><kbd>⌘K</kbd></button>
        <div className="profile-card">
          <div className="avatar">{initials(user.displayName)}</div>
          <button className="profile-details" onClick={() => navigate("account")}><strong>{user.displayName}</strong><span>{user.educationLevel ?? `@${user.username}`}</span></button>
          <button className="profile-signout" onClick={() => void signOut()} aria-label="Sign out"><LogOut size={16} /></button>
        </div>
      </aside>

      {mobileNav ? <button className="sidebar-scrim" aria-label="Close navigation" onClick={closeMobileNavigation} /> : null}

      <main ref={mainAreaRef} className="main-area" aria-hidden={compactNavigation && mobileNav ? true : undefined}>
        <header className="topbar">
          <button ref={openNavigationRef} className="icon-button mobile-only" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="location-label"><span>Continuum</span><strong>{meta.title}</strong></div>
          <button className="search-button" aria-label="Search workspace" onClick={() => setCommandOpen(true)}><Search size={17} /><span>Search workspace</span><kbd>⌘K</kbd></button>
          <div className="topbar-right">
            <button className={panelOpen ? "topbar-ask active" : "topbar-ask"} onClick={() => setPanelOpen(!panelOpen)} aria-pressed={panelOpen} aria-label="Ask Continuum about this page">
              <Sparkles size={16} /><span>Ask</span><kbd>⌘J</kbd>
            </button>
            <ThemeToggle />
            <span className="privacy-state"><i />Saved</span>
          </div>
        </header>

        <div className="content-wrap">
          {currentView === "integrations"
            ? <IntegrationsScreen showToast={setToast} />
            : state
              ? <WorkspaceScreens view={currentView} state={state} shellGoals={shell.goals} user={user} userName={user.displayName.split(/\s+/)[0] ?? user.displayName} serverNow={serverNow} goalId={activeGoalId} onNavigate={navigate} onRefresh={refreshCurrent} showToast={setToast} />
              : <ScreenLoading />}
        </div>
      </main>

      <nav ref={mobileNavigationRef} className="mobile-bottom-nav" aria-label="Mobile navigation" aria-hidden={compactNavigation && mobileNav ? true : undefined}>
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = canonicalView(currentView) === item.id;
          return <Link key={item.id} href={workspacePath[item.id]} prefetch={false} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><Icon size={19} /><span>{item.label}</span></Link>;
        })}
        <button className={moreActive ? "active" : ""} onClick={() => setMobileNav(true)} aria-label={pendingProposals ? `More sections, ${pendingProposals} pending in Review` : "More sections"}><Menu size={19} /><span>More</span>{pendingProposals ? <i className="nav-dot" aria-hidden="true" /> : null}</button>
      </nav>

      {state ? <AssistantPanel open={panelOpen} onOpenChange={setPanelOpen} state={state} /> : null}

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        actions={paletteActions}
        goals={sidebarGoals.map((goal) => ({ id: String(goal.id ?? ""), title: String(goal.title ?? "Untitled goal") }))}
        projects={(state?.projects ?? []).map((project) => ({ id: String(project.id ?? ""), title: String(project.title ?? "Untitled project") }))}
        onNavigate={navigate}
      />

      <Dialog.Root open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-backdrop" />
          <Dialog.Content className="modal-content shortcut-sheet">
            <Dialog.Title>Keyboard shortcuts</Dialog.Title>
            <Dialog.Description>Available from anywhere in the workspace.</Dialog.Description>
            <dl>
              {SHORTCUTS.map((shortcut) => (
                <div key={shortcut.keys}><dt><kbd>{shortcut.keys}</kbd></dt><dd>{shortcut.description}</dd></div>
              ))}
            </dl>
            <Dialog.Close className="button button-secondary">Close</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* A three-step coach-mark tour, dismissible and resumable from Account. */}
      {typeof tourStep === "number" && TOUR_STEPS[tourStep] ? <div className="tour-mark" role="dialog" aria-label="Getting started tour">
        <strong>{TOUR_STEPS[tourStep]!.title}</strong>
        <p>{TOUR_STEPS[tourStep]!.body}</p>
        <footer>
          <span>{tourStep + 1} of {TOUR_STEPS.length}</span>
          <div>
            <button onClick={() => { window.localStorage.setItem(TOUR_KEY, "1"); setTourStep(undefined); }}>Skip</button>
            <button
              className="tour-next"
              onClick={() => {
                if (tourStep + 1 >= TOUR_STEPS.length) { window.localStorage.setItem(TOUR_KEY, "1"); setTourStep(undefined); return; }
                if (tourStep === 0) navigate("goals");
                setTourStep(tourStep + 1);
              }}
            >
              {tourStep + 1 >= TOUR_STEPS.length ? "Done" : "Next"}
            </button>
          </div>
        </footer>
      </div> : null}

      {toast ? <div className="toast" role="status"><span className="toast-icon">✓</span><span>{toast}</span><button onClick={() => setToast(null)} aria-label="Dismiss"><X size={16} /></button></div> : null}
    </div>
    </AssistantProvider>
  );
}

/**
 * §8.8: the `?` sheet is the single source of truth for shortcuts, generated
 * from this one constant so a binding cannot exist without being documented.
 */
const SHORTCUTS = [
  { keys: "⌘K", description: "Find any goal, source, paper, conversation, or concept — or run a command" },
  { keys: "⌘J", description: "Ask Continuum about the page you are on" },
  { keys: "⌘↵", description: "Run your program in Build, or send a message" },
  { keys: "⇧↵", description: "New line in the composer" },
  { keys: "↑", description: "Edit your last message from an empty composer" },
  { keys: "Esc", description: "Stop a run or a response, or close the topmost panel" },
  { keys: "?", description: "Open this sheet" },
] as const;
