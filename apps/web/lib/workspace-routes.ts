export const workspaceViews = ["today", "goals", "learn", "code", "research", "memory", "integrations", "activity"] as const;

export type WorkspaceView = (typeof workspaceViews)[number];

export const workspacePath: Record<WorkspaceView, Route> = {
  today: "/",
  goals: "/goals",
  learn: "/learn",
  code: "/code" as Route,
  research: "/research",
  memory: "/memory",
  integrations: "/integrations",
  activity: "/activity",
};

export const workspaceMeta: Record<WorkspaceView, { title: string; description: string }> = {
  today: { title: "Today", description: "Your next action, current schedule, and last verified checkpoint." },
  goals: { title: "Plan", description: "Outcomes, deadlines, tasks, calendar constraints, and proof of completion." },
  learn: { title: "Learn", description: "Choose the strongest native or external resource and verify progress afterward." },
  code: { title: "Code", description: "Learn programming against your syllabus with a context-aware coding model." },
  research: { title: "Research", description: "Projects, source-backed claims, decisions, and unresolved questions." },
  memory: { title: "Memory", description: "Durable academic context retrieved by relevance, not transcript replay." },
  integrations: { title: "Connections", description: "Connect the academic tools you use and control what each one can access." },
  activity: { title: "Review", description: "Approve assistant proposals and inspect important changes to your academic state." },
};
import type { Route } from "next";
