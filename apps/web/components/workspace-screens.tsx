"use client";

import type { WorkspaceView } from "@/lib/workspace-routes";
import { ActivityScreen } from "./workspace/activity-screen";
import { GoalsScreen } from "./workspace/goals-screen";
import { LearnScreen } from "./workspace/learn-screen";
import { MemoryScreen } from "./workspace/memory-screen";
import { ResearchScreen } from "./workspace/research-screen";
import { TodayScreen } from "./workspace/today-screen";
import type { WorkspaceState } from "./workspace/types";

export { normalizeWorkspaceState, type WorkspaceState } from "./workspace/types";

type Toast = (message: string | null) => void;

export function WorkspaceScreens({ view, state, userName, onNavigate, showToast }: { view: WorkspaceView; state: WorkspaceState; userName: string; onNavigate: (view: WorkspaceView) => void; showToast: Toast }) {
  if (view === "today") return <TodayScreen state={state} userName={userName} onNavigate={onNavigate} />;
  if (view === "goals") return <GoalsScreen state={state} showToast={showToast} />;
  if (view === "learn") return <LearnScreen state={state} showToast={showToast} />;
  if (view === "research") return <ResearchScreen state={state} showToast={showToast} />;
  if (view === "memory") return <MemoryScreen state={state} showToast={showToast} />;
  if (view === "activity") return <ActivityScreen state={state} showToast={showToast} />;
  return null;
}
