export const workspaceViews = ["today", "goals", "learn", "research", "memory", "integrations", "activity"] as const;

export type WorkspaceView = (typeof workspaceViews)[number];

export const workspacePath: Record<WorkspaceView, Route> = {
  today: "/",
  goals: "/goals",
  learn: "/learn",
  research: "/research",
  memory: "/memory",
  integrations: "/integrations",
  activity: "/activity",
};

export const workspaceMeta: Record<WorkspaceView, { title: string; description: string }> = {
  today: { title: "Today", description: "Your next action, current schedule, and last verified checkpoint." },
  goals: { title: "Goals", description: "Outcomes, deadlines, tasks, and the evidence needed to finish them." },
  learn: { title: "Learn", description: "Choose the strongest native or external resource and verify progress afterward." },
  research: { title: "Research", description: "Projects, source-backed claims, decisions, and unresolved questions." },
  memory: { title: "Memory", description: "Durable academic context retrieved by relevance, not transcript replay." },
  integrations: { title: "Integrations", description: "Connect Claude, Obsidian, local models, and hosted model providers safely." },
  activity: { title: "Activity", description: "Review assistant proposals, model routes, evidence updates, and audit events." },
};
import type { Route } from "next";
