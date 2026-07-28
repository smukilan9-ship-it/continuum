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
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { normalizeWorkspaceState, WorkspaceScreens, type WorkspaceState } from "@/components/workspace-screens";
import { canonicalView, viewFromPath, workspaceMeta, workspacePath, type WorkspaceView } from "@/lib/workspace-routes";

export type View = WorkspaceView;

type NavItem = { id: WorkspaceView; label: string; icon: typeof CalendarDays };
type NavGroup = { label: string; items: NavItem[]; variant?: "primary" | "utility" };

/**
 * Grouped by intent ("what am I doing?") rather than by storage. Today is
 * ungrouped and visually primary because it is the intended daily entry point;
 * Zotero and OpenAlex are two halves of one job and share the Library
 * destination; the occasional destinations sit below a divider.
 */
const navGroups: NavGroup[] = [
  { label: "", variant: "primary", items: [{ id: "today", label: "Today", icon: CalendarDays }] },
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
  {
    label: "",
    variant: "utility",
    items: [
      { id: "activity", label: "Review", icon: Activity },
      { id: "integrations", label: "Connections", icon: Link2 },
      { id: "account", label: "Account & Security", icon: ShieldCheck },
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
  { title: "⌘K jumps anywhere", body: "Search sections, goals, tasks, projects, and receipts from any screen." },
] as const;

export function ContinuumApp({ user, initialState, view, serverNow, needsOnboarding = false }: { user: AuthUser; initialState: Record<string, unknown>; view: WorkspaceView; serverNow: string; needsOnboarding?: boolean }) {
  const [mobileNav, setMobileNav] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tourStep, setTourStep] = useState<number>();
  const [currentView, setCurrentView] = useState<WorkspaceView>(view);
  const sidebarRef = useRef<HTMLElement>(null);
  const closeNavigationRef = useRef<HTMLButtonElement>(null);
  const openNavigationRef = useRef<HTMLButtonElement>(null);
  const mainAreaRef = useRef<HTMLElement>(null);
  const mobileNavigationRef = useRef<HTMLElement>(null);

  // Per-view cache seeded with the server-rendered snapshot. Navigation switches
  // the visible view instantly from cache and refreshes it in the background, so a
  // click never waits on a full-page server round-trip to the remote database.
  const cacheRef = useRef<Map<WorkspaceView, WorkspaceState>>(new Map([[view, normalizeWorkspaceState(initialState)]]));
  const inflight = useRef<Set<WorkspaceView>>(new Set());
  const [, bumpCache] = useReducer((count: number) => count + 1, 0);
  const meta = workspaceMeta[currentView];
  const state = cacheRef.current.get(currentView);
  const pendingProposals = state?.proposals.filter((proposal) => proposal.status === "pending").length ?? 0;
  const moreActive = !mobileItems.some((item) => canonicalView(currentView) === item.id);

  const refreshView = useCallback(async (target: WorkspaceView) => {
    if (target === "integrations" || inflight.current.has(target)) return;
    inflight.current.add(target);
    try {
      const response = await fetch(`/api/state?view=${encodeURIComponent(target)}`, { cache: "no-store" });
      const payload = await response.json() as { data?: Record<string, unknown> };
      if (response.ok && payload.data) { cacheRef.current.set(target, normalizeWorkspaceState(payload.data)); bumpCache(); }
    } catch { /* Keep the last good cached view rather than blanking the screen. */ } finally {
      inflight.current.delete(target);
    }
  }, []);

  const navigate = useCallback((next: WorkspaceView) => {
    setMobileNav(false);
    setCommandOpen(false);
    setCurrentView(next);
    if (typeof window !== "undefined" && window.location.pathname !== (workspacePath[next] as string)) {
      window.history.pushState({ view: next }, "", workspacePath[next]);
    }
    void refreshView(next);
  }, [refreshView]);

  const refreshCurrent = useCallback(() => refreshView(currentView), [refreshView, currentView]);

  // Keep browser back/forward working with the client-side view switch.
  useEffect(() => {
    const onPopState = () => {
      const next = viewFromPath(window.location.pathname);
      setCurrentView(next);
      if (!cacheRef.current.has(next)) void refreshView(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [refreshView]);

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
  }, []);

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

  // Intercept in-app link clicks so navigation is instant, while preserving
  // new-tab and modifier-click behavior against the real server routes.
  const linkHandler = (next: WorkspaceView) => (event: React.MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(next);
  };

  async function signOut() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) window.location.assign("/login");
    else setToast("Sign out failed. Your current session is still active.");
  }

  return (
    <div className="app-shell">
      <aside
        ref={sidebarRef}
        className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}
        aria-label="Workspace navigation"
        aria-hidden={compactNavigation && !mobileNav ? true : undefined}
      >
        <div className="sidebar-head">
          <Link className="brand" href={workspacePath.today} onClick={linkHandler("today")} aria-label="Continuum workspace home">
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
                  <Link key={item.id} href={workspacePath[item.id]} prefetch={false} className={active ? "nav-item active" : "nav-item"} aria-current={active ? "page" : undefined} onClick={linkHandler(item.id)} onMouseEnter={() => void refreshView(item.id)} onFocus={() => void refreshView(item.id)}>
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{item.label}</span>
                    {typeof count === "number" && count > 0 ? <small aria-label={`${count} pending`}>{count}</small> : null}
                  </Link>
                );
              })}
            </div>
          ))}
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
          <div className="topbar-right"><ThemeToggle /><span className="privacy-state"><i />Saved</span></div>
        </header>

        <div className="content-wrap">
          {currentView === "integrations"
            ? <IntegrationsScreen showToast={setToast} />
            : state
              ? <WorkspaceScreens view={currentView} state={state} user={user} userName={user.displayName.split(/\s+/)[0] ?? user.displayName} serverNow={serverNow} onNavigate={navigate} onRefresh={refreshCurrent} showToast={setToast} />
              : <ScreenLoading />}
        </div>
      </main>

      <nav ref={mobileNavigationRef} className="mobile-bottom-nav" aria-label="Mobile navigation" aria-hidden={compactNavigation && mobileNav ? true : undefined}>
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = canonicalView(currentView) === item.id;
          return <Link key={item.id} href={workspacePath[item.id]} prefetch={false} className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={linkHandler(item.id)}><Icon size={19} /><span>{item.label}</span></Link>;
        })}
        <button className={moreActive ? "active" : ""} onClick={() => setMobileNav(true)} aria-label={pendingProposals ? `More sections, ${pendingProposals} pending in Review` : "More sections"}><Menu size={19} /><span>More</span>{pendingProposals ? <i className="nav-dot" aria-hidden="true" /> : null}</button>
      </nav>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} state={state} onNavigate={navigate} />

      <Dialog.Root open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-backdrop" />
          <Dialog.Content className="modal-content shortcut-sheet">
            <Dialog.Title>Keyboard shortcuts</Dialog.Title>
            <Dialog.Description>Available from anywhere in the workspace.</Dialog.Description>
            <dl>
              <div><dt><kbd>⌘K</kbd></dt><dd>Jump to any section, goal, task, project, or receipt</dd></div>
              <div><dt><kbd>⌘↵</kbd></dt><dd>Run your program in Code</dd></div>
              <div><dt><kbd>Esc</kbd></dt><dd>Stop a running program, or close a panel</dd></div>
              <div><dt><kbd>?</kbd></dt><dd>Open this sheet</dd></div>
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
  );
}

type SearchAction = { id: string; label: string; hint: string; view: WorkspaceView };

function rowString(row: Record<string, unknown>, key: string) {
  return typeof row[key] === "string" ? row[key] : undefined;
}

function workspaceActions(state: WorkspaceState | undefined): SearchAction[] {
  const destinations = navGroups.flatMap((group) => group.items.map((item) => ({ id: `view-${item.id}`, label: item.label, hint: workspaceMeta[item.id].description, view: item.id })));
  if (!state) return destinations;
  const goals = state.goals.map((goal) => ({ id: `goal-${rowString(goal, "id")}`, label: rowString(goal, "title") ?? "Untitled goal", hint: "Goal", view: "goals" as const }));
  const tasks = state.tasks.map((task) => ({ id: `task-${rowString(task, "id")}`, label: rowString(task, "title") ?? "Untitled task", hint: "Task", view: "goals" as const }));
  const projects = state.projects.map((project) => ({ id: `project-${rowString(project, "id")}`, label: rowString(project, "title") ?? "Untitled project", hint: "Research project", view: "research" as const }));
  const receipts = state.receipts.map((receipt) => ({ id: `receipt-${rowString(receipt, "id")}`, label: rowString(receipt, "summary") ?? "Outcome receipt", hint: "Memory receipt", view: "memory" as const }));
  return [...destinations, ...goals, ...tasks, ...projects, ...receipts];
}

function CommandPalette({ open, onOpenChange, state, onNavigate }: { open: boolean; onOpenChange: (open: boolean) => void; state: WorkspaceState | undefined; onNavigate: (view: WorkspaceView) => void }) {
  const [query, setQuery] = useState("");
  const actions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workspaceActions(state).filter((item) => !needle || `${item.label} ${item.hint}`.toLowerCase().includes(needle)).slice(0, 12);
  }, [query, state]);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setQuery(""); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="command-overlay" />
        <Dialog.Content className="command-panel" aria-describedby="command-description">
          <Dialog.Title className="sr-only">Search Continuum</Dialog.Title>
          <Dialog.Description className="sr-only" id="command-description">Search sections, goals, tasks, projects, and outcome receipts.</Dialog.Description>
          <div className="command-input"><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sections, goals, tasks, and projects" /><Dialog.Close aria-label="Close search"><X size={17} /></Dialog.Close></div>
          <div className="command-results">
            <p>{query ? "Matches" : "Workspace"}</p>
            {actions.map((action) => <button key={action.id} onClick={() => onNavigate(action.view)}><span>{action.label}</span><small>{action.hint}</small></button>)}
            {!actions.length ? <div className="command-empty"><Search size={20} /><span>No workspace item matches “{query}”.</span></div> : null}
          </div>
          <footer><span><kbd>esc</kbd> close</span><span>Search opens the matching workspace; it never changes your data.</span></footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
