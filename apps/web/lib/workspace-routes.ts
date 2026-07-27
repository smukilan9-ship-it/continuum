export const workspaceViews = ["today", "assistant", "goals", "learn", "code", "research", "openalex", "zotero", "memory", "integrations", "account", "activity"] as const;

export type WorkspaceView = (typeof workspaceViews)[number];

export const workspacePath: Record<WorkspaceView, Route> = {
  today: "/",
  assistant: "/assistant" as Route,
  goals: "/goals",
  learn: "/learn",
  code: "/code" as Route,
  research: "/research",
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
  openalex: { title: "OpenAlex", description: "Explore scholarly entities and traverse the citation graph." },
  zotero: { title: "Zotero", description: "Browse connected personal and group libraries, attachments, and citations." },
  memory: { title: "Memory", description: "Durable academic context retrieved by relevance, not transcript replay." },
  integrations: { title: "Connections", description: "Connect the academic tools you use and control what each one can access." },
  account: { title: "Account & Security", description: "Verification, password, sessions, export, integrations, and deletion." },
  activity: { title: "Review", description: "Approve assistant proposals and inspect important changes to your academic state." },
};
import type { Route } from "next";
