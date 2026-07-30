import type { Route } from "next";

export const workspaceViews = ["today", "assistant", "goals", "goal", "project", "learn", "code", "research", "library", "openalex", "zotero", "memory", "integrations", "account", "activity"] as const;

export type WorkspaceView = (typeof workspaceViews)[number];

/**
 * §7.1's addresses. The view ids are internal and predate the rename, so they
 * stay as they are — renaming them would touch every screen for no user-visible
 * gain — but every path a user can see or link to is now the §16.7 one, and the
 * old paths are 308 redirects in `next.config`.
 */
export const workspacePath: Record<WorkspaceView, Route> = {
  today: "/home" as Route,
  assistant: "/ask" as Route,
  goals: "/plan" as Route,
  // A goal page is always opened for a specific goal, so this base path is only
  // the registry entry that lets `/g/:id` resolve to the goal view by prefix.
  goal: "/g" as Route,
  // A project always hangs off a goal, so it has no standalone base path; the
  // registry entry exists so `/g/:id/p/:id` resolves to the project view.
  project: "/g" as Route,
  learn: "/learn" as Route,
  code: "/build" as Route,
  research: "/research" as Route,
  library: "/library" as Route,
  openalex: "/library" as Route,
  zotero: "/library" as Route,
  memory: "/context" as Route,
  integrations: "/settings/connections" as Route,
  account: "/settings" as Route,
  activity: "/review" as Route,
};

export const workspaceMeta: Record<WorkspaceView, { title: string; description: string }> = {
  today: { title: "Home", description: "Your next action, current schedule, and last verified checkpoint." },
  assistant: { title: "Ask", description: "Work with the smallest relevant slice of your Continuum context." },
  goals: { title: "Plan", description: "Outcomes, deadlines, tasks, calendar constraints, and proof of completion." },
  goal: { title: "Goal", description: "Everything for one goal: its plan, what you are learning, and the material behind it." },
  project: { title: "Project", description: "The evidence, claims, and decisions behind one research question." },
  learn: { title: "Study", description: "Choose the best resource for your goal and verify progress afterward." },
  code: { title: "Build", description: "Understand the task, write code, run it, check the tests, and ask for help when needed." },
  research: { title: "Research", description: "Projects, source-backed claims, decisions, and unresolved questions." },
  library: { title: "Library", description: "Find sources in the public scholarly graph, keep the ones that matter, and browse your connected Zotero libraries." },
  openalex: { title: "Library", description: "Explore scholarly entities and traverse the citation graph." },
  zotero: { title: "Library", description: "Browse connected personal and group libraries, attachments, and citations." },
  memory: { title: "Context", description: "What Continuum remembers, retrieved by relevance rather than transcript replay." },
  integrations: { title: "Connections", description: "Connect the academic tools you use and control what each one can access." },
  account: { title: "Settings", description: "Your account, appearance, AI, connections, privacy, security, data, and diagnostics." },
  activity: { title: "Review", description: "Approve assistant proposals and inspect important changes to your academic state." },
};

/**
 * The eight settings segments (§9.11), as palette destinations.
 *
 * They are deliberately not `WorkspaceView`s. A view is a screen the shell
 * switches between; these are sub-paths of one view. AC-ST3 requires every
 * settings page to be reachable in two clicks from anywhere, and the palette
 * navigates by view, so it reads `href` from here instead.
 */
export const settingsDestinations: ReadonlyArray<{ segment: string; label: string; href: Route; description: string }> = [
  { segment: "account", label: "Settings · Account", href: "/settings/account" as Route, description: "Your name, email, and how Continuum addresses you." },
  { segment: "appearance", label: "Settings · Appearance", href: "/settings/appearance" as Route, description: "Theme and how tightly lists are packed." },
  { segment: "ai", label: "Settings · AI", href: "/settings/ai" as Route, description: "How Continuum picks a model, your own key, and local AI." },
  { segment: "connections", label: "Settings · Connections", href: "/settings/connections" as Route, description: "Claude, your reading, your notes, and your own keys." },
  { segment: "privacy", label: "Settings · Privacy", href: "/settings/privacy" as Route, description: "What the assistant may use, and what Continuum keeps." },
  { segment: "security", label: "Settings · Security", href: "/settings/security" as Route, description: "Password and the devices you are signed in on." },
  { segment: "data", label: "Settings · Data", href: "/settings/data" as Route, description: "Take everything with you, or delete the account." },
  { segment: "advanced", label: "Settings · Advanced", href: "/settings/advanced" as Route, description: "Connector address, model availability, diagnostics." },
];

/**
 * The nine object kinds `GET /api/search` can return (§8.4), and the single
 * place that decides where each one opens. Both the palette and the Library
 * read a hit's `href` from here rather than each building its own mapping.
 */
export const searchKinds = ["goal", "task", "project", "source", "paper", "conversation", "concept", "note", "memory"] as const;

export type SearchKind = (typeof searchKinds)[number];

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string;
  context: string;
  parentId?: string;
  updatedAt: string;
  href?: string;
};

/** Palette section headings, in the §8.4 order. */
export const searchKindSection: Record<SearchKind, string> = {
  goal: "Goals",
  task: "Tasks",
  project: "Projects",
  source: "Sources & papers",
  paper: "Sources & papers",
  conversation: "Conversations",
  concept: "Concepts",
  note: "Notes",
  memory: "Context",
};

export function searchHitHref(hit: { kind: SearchKind; id: string; parentId?: string }): Route {
  const id = encodeURIComponent(hit.id);
  switch (hit.kind) {
    case "goal": return `/g/${id}` as Route;
    // A task and a project are both reached through the goal that owns them;
    // without one, the section that lists them is still the right landing.
    case "task": return (hit.parentId ? `/g/${encodeURIComponent(hit.parentId)}?view=plan` : "/plan") as Route;
    case "project": return (hit.parentId ? `/g/${encodeURIComponent(hit.parentId)}/p/${id}` : "/research") as Route;
    case "source": return `/library?tab=sources&source=${id}` as Route;
    case "paper": return `/library?tab=saved&paper=${id}` as Route;
    case "conversation": return `/ask?conversation=${id}` as Route;
    case "concept": return `/learn?concept=${id}` as Route;
    case "note": return (hit.parentId ? `/research?project=${encodeURIComponent(hit.parentId)}` : "/research") as Route;
    case "memory": return `/context?record=${id}` as Route;
  }
}

/**
 * Views that share a screen. `openalex` and `zotero` predate the merged Library
 * destination; their old paths are now 308 redirects, and these aliases keep
 * the shell resolving them to the same screen with a tab preselected.
 */
export const viewAliases: Partial<Record<WorkspaceView, WorkspaceView>> = {
  openalex: "library",
  zotero: "library",
};

export function canonicalView(view: WorkspaceView): WorkspaceView {
  return viewAliases[view] ?? view;
}

const pathToView = new Map<string, WorkspaceView>(
  workspaceViews
    // `openalex` and `zotero` now share `/library`; the `library` entry wins.
    // `project` shares `/g` with `goal`; the path resolver disambiguates on the
    // `/p/` segment, so only `goal` claims the prefix.
    .filter((view) => !["openalex", "zotero", "project"].includes(view))
    .map((value) => [workspacePath[value] as string, value]),
);

/**
 * Resolves a pathname to a view by prefix, not exact match.
 *
 * Deep links carry sub-state in later segments (`/library/works/W2741809807`,
 * `/g/goal_1/p/project_1`). An exact-match lookup missed all of them and fell
 * back to Home, so pressing Back from any deep link dumped the user out of the
 * section they were in.
 */
export function viewFromPath(pathname: string): WorkspaceView {
  if (/^\/g\/[^/]+\/p\/[^/]+/.test(pathname)) return "project";
  const exact = pathToView.get(pathname);
  if (exact) return exact;
  const segments = pathname.split("/").filter(Boolean);
  // `/settings/connections` is Connections; every other `/settings/*` is the
  // Settings screen, so the two-segment lookup has to come first.
  const two = pathToView.get(`/${segments.slice(0, 2).join("/")}`);
  if (two) return two;
  return pathToView.get(`/${segments[0] ?? ""}`) ?? "today";
}
