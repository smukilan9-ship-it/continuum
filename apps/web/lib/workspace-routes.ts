export const workspaceViews = ["today", "assistant", "goals", "learn", "code", "research", "library", "openalex", "zotero", "memory", "integrations", "account", "activity"] as const;

export type WorkspaceView = (typeof workspaceViews)[number];

export const workspacePath: Record<WorkspaceView, Route> = {
  today: "/today" as Route,
  assistant: "/assistant" as Route,
  goals: "/goals",
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
  learn: { title: "Learn", description: "Choose the best resource for your goal and verify progress afterward." },
  code: { title: "Code", description: "Understand the task, write code, run it, check the tests, and ask for help when needed." },
  research: { title: "Research", description: "Projects, source-backed claims, decisions, and unresolved questions." },
  library: { title: "Library", description: "Find sources in the public scholarly graph, keep the ones that matter, and browse your connected Zotero libraries." },
  openalex: { title: "Library", description: "Explore scholarly entities and traverse the citation graph." },
  zotero: { title: "Library", description: "Browse connected personal and group libraries, attachments, and citations." },
  memory: { title: "Memory", description: "Durable academic context retrieved by relevance, not transcript replay." },
  integrations: { title: "Connections", description: "Connect the academic tools you use and control what each one can access." },
  account: { title: "Account & Security", description: "Verification, password, sessions, export, integrations, and deletion." },
  activity: { title: "Review", description: "Approve assistant proposals and inspect important changes to your academic state." },
};

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
