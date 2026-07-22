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
  Goal,
  Link2,
  LogOut,
  Menu,
  Search,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { normalizeWorkspaceState, WorkspaceScreens, type WorkspaceState } from "@/components/workspace-screens";
import { workspaceMeta, workspacePath, workspaceViews, type WorkspaceView } from "@/lib/workspace-routes";

const pathToView = new Map<string, WorkspaceView>(workspaceViews.map((value) => [workspacePath[value] as string, value]));
function viewFromPath(pathname: string): WorkspaceView {
  return pathToView.get(pathname) ?? "today";
}

export type View = WorkspaceView;

type NavItem = { id: WorkspaceView; label: string; icon: typeof CalendarDays };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { id: "today", label: "Today", icon: CalendarDays },
      { id: "goals", label: "Plan", icon: Goal },
      { id: "learn", label: "Learn", icon: BookOpen },
      { id: "code", label: "Code", icon: Code2 },
      { id: "research", label: "Research", icon: FlaskConical },
    ],
  },
  {
    label: "Library",
    items: [
      { id: "memory", label: "Memory", icon: Database },
      { id: "activity", label: "Review", icon: Activity },
    ],
  },
  {
    label: "Account",
    items: [{ id: "integrations", label: "Connections", icon: Link2 }],
  },
];

const mobileItems = navGroups[0]!.items.filter((item) => item.id !== "research");

const IntegrationsScreen = dynamic(() => import("@/components/integrations-screen").then((module) => module.IntegrationsScreen), { loading: () => <ScreenLoading /> });

function ScreenLoading() {
  return <div className="screen-loading" role="status" aria-label="Loading workspace"><span /><span /><span /></div>;
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export function ContinuumApp({ user, initialState, view }: { user: AuthUser; initialState: Record<string, unknown>; view: WorkspaceView }) {
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [currentView, setCurrentView] = useState<WorkspaceView>(view);

  // Per-view cache seeded with the server-rendered snapshot. Navigation switches
  // the visible view instantly from cache and refreshes it in the background, so a
  // click never waits on a full-page server round-trip to the remote database.
  const cacheRef = useRef<Map<WorkspaceView, WorkspaceState>>(new Map([[view, normalizeWorkspaceState(initialState)]]));
  const inflight = useRef<Set<WorkspaceView>>(new Set());
  const [, bumpCache] = useReducer((count: number) => count + 1, 0);
  const meta = workspaceMeta[currentView];
  const state = cacheRef.current.get(currentView);

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
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

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
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`} aria-label="Workspace navigation">
        <div className="sidebar-head">
          <Link className="brand" href="/" onClick={linkHandler("today")} aria-label="Continuum home">
            <span className="brand-symbol">C</span>
            <span>Continuum</span>
          </Link>
          <button className="icon-button mobile-only" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={20} /></button>
        </div>

        <nav className="main-nav" aria-label="Primary navigation">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const count = item.id === "activity" ? (state?.proposals.filter((proposal) => proposal.status === "pending").length ?? 0) : undefined;
                return (
                  <Link key={item.id} href={workspacePath[item.id]} prefetch={false} className={currentView === item.id ? "nav-item active" : "nav-item"} aria-current={currentView === item.id ? "page" : undefined} onClick={linkHandler(item.id)} onMouseEnter={() => void refreshView(item.id)} onFocus={() => void refreshView(item.id)}>
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{item.label}</span>
                    {typeof count === "number" && count > 0 ? <small>{count}</small> : null}
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
          <div><strong>{user.displayName}</strong><span>{user.educationLevel ?? user.email}</span></div>
          <button className="profile-signout" onClick={() => void signOut()} aria-label="Sign out"><LogOut size={16} /></button>
        </div>
      </aside>

      {mobileNav ? <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} /> : null}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="location-label"><span>Continuum</span><strong>{meta.title}</strong></div>
          <button className="search-button" onClick={() => setCommandOpen(true)}><Search size={17} /><span>Search workspace</span><kbd>⌘K</kbd></button>
          <div className="topbar-right"><span className="privacy-state"><i />Saved</span></div>
        </header>

        <div className="content-wrap">
          {currentView === "integrations"
            ? <IntegrationsScreen showToast={setToast} />
            : state
              ? <WorkspaceScreens view={currentView} state={state} user={user} userName={user.displayName.split(/\s+/)[0] ?? user.displayName} onNavigate={navigate} onRefresh={refreshCurrent} showToast={setToast} />
              : <ScreenLoading />}
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          return <Link key={item.id} href={workspacePath[item.id]} prefetch={false} className={currentView === item.id ? "active" : ""} aria-current={currentView === item.id ? "page" : undefined} onClick={linkHandler(item.id)}><Icon size={19} /><span>{item.label}</span></Link>;
        })}
        <button className={["research", "memory", "integrations", "activity"].includes(currentView) ? "active" : ""} onClick={() => setMobileNav(true)}><Menu size={19} /><span>More</span></button>
      </nav>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} state={state} onNavigate={navigate} />
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
