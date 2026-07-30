export const workspaceViews = ["today", "assistant", "goals", "goal", "learn", "code", "research", "library", "openalex", "zotero", "memory", "integrations", "account", "activity"] as const;

export type WorkspaceView = (typeof workspaceViews)[number];

export const workspacePath: Record<WorkspaceView, Route> = {
  today: "/today" as Route,
  assistant: "/assistant" as Route,
  goals: "/goals",
  // A goal page is always opened for a specific goal, so this base path is only
  // the registry entry that lets `/g/:id` resolve to the goal view by prefix.
  goal: "/g" as Route,
  learn: "/learn",
  code: "/code" as Route,
  research: "/research",
  library: "/library" as Route,
  openalex: "/openalex" as Route,
  zotero: "/zotero" as Route,
  memory: "/memory",
  integrations: "/integrations",
  account: "/account" as Route,
  activity: "/activity",
};

export const workspaceMeta: Record<WorkspaceView, { title: string; description: string }> = {
  today: { title: "Today", description: "Your next action, current schedule, and last verified checkpoint." },
  assistant: { title: "Assistant", description: "Work with the smallest relevant slice of your Continuum context." },
  goals: { title: "Plan", description: "Outcomes, deadlines, tasks, calendar constraints, and proof of completion." },
  goal: { title: "Goal", description: "Everything for one goal: its plan, what you are learning, and the material behind it." },
  learn: { title: "Learn", description: "Choose the best resource for your goal and verify progress afterward." },
  code: { title: "Code", description: "Understand the task, write code, run it, check the tests, and ask for help when needed." },
  research: { title: "Research", description: "Projects, source-backed claims, decisions, and unresolved questions." },
  library: { title: "Library", description: "Find sources in the public scholarly graph, keep the ones that matter, and browse your connected Zotero libraries." },
  openalex: { title: "Library", description: "Explore scholarly entities and traverse the citation graph." },
  zotero: { title: "Library", description: "Browse connected personal and group libraries, attachments, and citations." },
  memory: { title: "Memory", description: "Durable academic context retrieved by relevance, not transcript replay." },
  integrations: { title: "Connections", description: "Connect the academic tools you use and control what each one can access." },
  account: { title: "Settings", description: "Your account, appearance, AI, connections, privacy, security, data, and diagnostics." },
  activity: { title: "Review", description: "Approve assistant proposals and inspect important changes to your academic state." },
};

/**
 * The eight settings segments (§9.11), as palette destinations.
 *
 * They are deliberately not `WorkspaceView`s. A view is a screen the shell
 * switches between and must round-trip through `viewFromPath`; these are
 * sub-paths of one view. Modelling them as views would put eight `/account/*`
 * entries into `pathToView`, where the prefix lookup already resolves them all
 * to `account` anyway.
 *
 * AC-ST3 requires every settings page to be reachable in two clicks from
 * anywhere. The palette navigates by view and cannot express a sub-path, so it
 * reads `href` from here instead.
 */
export const settingsDestinations: ReadonlyArray<{ segment: string; label: string; href: Route; description: string }> = [
  { segment: "account", label: "Settings · Account", href: "/account" as Route, description: "Your name, email, and how Continuum addresses you." },
  { segment: "appearance", label: "Settings · Appearance", href: "/account/appearance" as Route, description: "Theme and how tightly lists are packed." },
  { segment: "ai", label: "Settings · AI", href: "/account/ai" as Route, description: "How Continuum picks a model, your own key, and local AI." },
  { segment: "connections", label: "Settings · Connections", href: "/account/connections" as Route, description: "Claude, your reading, your notes, and your own keys." },
  { segment: "privacy", label: "Settings · Privacy", href: "/account/privacy" as Route, description: "What the assistant may use, and what Continuum keeps." },
  { segment: "security", label: "Settings · Security", href: "/account/security" as Route, description: "Password and the devices you are signed in on." },
  { segment: "data", label: "Settings · Data", href: "/account/data" as Route, description: "Take everything with you, or delete the account." },
  { segment: "advanced", label: "Settings · Advanced", href: "/account/advanced" as Route, description: "Connector address, model availability, diagnostics." },
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
    case "task": return (hit.parentId ? `/g/${encodeURIComponent(hit.parentId)}?view=plan` : "/goals") as Route;
    case "project": return (hit.parentId ? `/g/${encodeURIComponent(hit.parentId)}?view=overview` : "/research") as Route;
    case "source": return `/library?tab=sources&source=${id}` as Route;
    case "paper": return `/library?tab=saved&paper=${id}` as Route;
    case "conversation": return `/assistant?conversation=${id}` as Route;
    case "concept": return `/learn?concept=${id}` as Route;
    case "note": return (hit.parentId ? `/research?project=${encodeURIComponent(hit.parentId)}` : "/research") as Route;
    case "memory": return `/memory?record=${id}` as Route;
  }
}

/**
 * Views that share a screen. `/openalex` and `/zotero` predate the merged
 * Library destination and stay reachable — every bookmark and shared deep link
 * keeps working — but they resolve to the same screen with a tab preselected.
 */
export const viewAliases: Partial<Record<WorkspaceView, WorkspaceView>> = {
  openalex: "library",
  zotero: "library",
};

export function canonicalView(view: WorkspaceView): WorkspaceView {
  return viewAliases[view] ?? view;
}

const pathToView = new Map<string, WorkspaceView>(workspaceViews.map((value) => [workspacePath[value] as string, value]));

/**
 * Resolves a pathname to a view by prefix, not exact match.
 *
 * Deep links carry sub-state in later segments (`/library/works/W2741809807`,
 * `/research/{projectId}/{tab}`). An exact-match lookup missed all of them and
 * fell back to Today, so pressing Back from any deep link dumped the user out of
 * the section they were in.
 */
export function viewFromPath(pathname: string): WorkspaceView {
  const exact = pathToView.get(pathname);
  if (exact) return exact;
  const segment = `/${pathname.split("/").filter(Boolean)[0] ?? ""}`;
  return pathToView.get(segment) ?? "today";
}

import type { Route } from "next";
