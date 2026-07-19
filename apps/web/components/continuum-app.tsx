"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { AuthUser } from "@continuum/db";
import {
  Activity,
  BookOpen,
  CalendarDays,
  Command,
  Database,
  FlaskConical,
  Goal,
  Link2,
  LogOut,
  Menu,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { IntegrationsScreen } from "@/components/integrations-screen";
import { normalizeWorkspaceState, WorkspaceScreens, type WorkspaceState } from "@/components/workspace-screens";
import { workspaceMeta, workspacePath, type WorkspaceView } from "@/lib/workspace-routes";

export type View = WorkspaceView;

type NavItem = { id: WorkspaceView; label: string; icon: typeof CalendarDays };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { id: "today", label: "Today", icon: CalendarDays },
      { id: "goals", label: "Goals", icon: Goal },
      { id: "learn", label: "Learn", icon: BookOpen },
      { id: "research", label: "Research", icon: FlaskConical },
    ],
  },
  {
    label: "Context",
    items: [{ id: "memory", label: "Memory", icon: Database }],
  },
  {
    label: "System",
    items: [
      { id: "integrations", label: "Integrations", icon: Link2 },
      { id: "activity", label: "Activity", icon: Activity },
    ],
  },
];

const mobileItems = navGroups[0]!.items;

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export function ContinuumApp({ user, initialState, view }: { user: AuthUser; initialState: Record<string, unknown>; view: WorkspaceView }) {
  const router = useRouter();
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const state = useMemo(() => normalizeWorkspaceState(initialState), [initialState]);
  const meta = workspaceMeta[view];

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

  function navigate(next: WorkspaceView) {
    setMobileNav(false);
    setCommandOpen(false);
    router.push(workspacePath[next]);
  }

  async function signOut() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) window.location.assign("/login");
    else setToast("Sign out failed. Your current session is still active.");
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`} aria-label="Workspace navigation">
        <div className="sidebar-head">
          <Link className="brand" href="/" onClick={() => setMobileNav(false)} aria-label="Continuum home">
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
                const count = item.id === "goals" ? state.goals.length : item.id === "research" ? state.projects.length : item.id === "activity" ? state.proposals.filter((proposal) => proposal.status === "pending").length : undefined;
                return (
                  <Link key={item.id} href={workspacePath[item.id]} className={view === item.id ? "nav-item active" : "nav-item"} aria-current={view === item.id ? "page" : undefined} onClick={() => setMobileNav(false)}>
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
          <div className="location-label"><span>Workspace</span><strong>{meta.title}</strong></div>
          <button className="search-button" onClick={() => setCommandOpen(true)}><Search size={17} /><span>Search workspace</span><kbd>⌘K</kbd></button>
          <div className="topbar-right"><span className="privacy-state"><i />Private workspace</span></div>
        </header>

        <div className="content-wrap">
          {view === "integrations"
            ? <IntegrationsScreen showToast={setToast} />
            : <WorkspaceScreens view={view} state={state} userName={user.displayName.split(/\s+/)[0] ?? user.displayName} onNavigate={navigate} showToast={setToast} />}
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          return <Link key={item.id} href={workspacePath[item.id]} className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined}><Icon size={19} /><span>{item.label}</span></Link>;
        })}
        <button className={["memory", "integrations", "activity"].includes(view) ? "active" : ""} onClick={() => setMobileNav(true)}><Menu size={19} /><span>More</span></button>
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

function workspaceActions(state: WorkspaceState): SearchAction[] {
  const destinations = navGroups.flatMap((group) => group.items.map((item) => ({ id: `view-${item.id}`, label: item.label, hint: workspaceMeta[item.id].description, view: item.id })));
  const goals = state.goals.map((goal) => ({ id: `goal-${rowString(goal, "id")}`, label: rowString(goal, "title") ?? "Untitled goal", hint: "Goal", view: "goals" as const }));
  const tasks = state.tasks.map((task) => ({ id: `task-${rowString(task, "id")}`, label: rowString(task, "title") ?? "Untitled task", hint: "Task", view: "goals" as const }));
  const projects = state.projects.map((project) => ({ id: `project-${rowString(project, "id")}`, label: rowString(project, "title") ?? "Untitled project", hint: "Research project", view: "research" as const }));
  const receipts = state.receipts.map((receipt) => ({ id: `receipt-${rowString(receipt, "id")}`, label: rowString(receipt, "summary") ?? "Outcome receipt", hint: "Memory receipt", view: "memory" as const }));
  return [...destinations, ...goals, ...tasks, ...projects, ...receipts];
}

function CommandPalette({ open, onOpenChange, state, onNavigate }: { open: boolean; onOpenChange: (open: boolean) => void; state: WorkspaceState; onNavigate: (view: WorkspaceView) => void }) {
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
