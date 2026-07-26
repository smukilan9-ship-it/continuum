"use client";

import type { AuthUser } from "@continuum/db";
import dynamic from "next/dynamic";
import type { WorkspaceView } from "@/lib/workspace-routes";
import type { WorkspaceState } from "./workspace/types";

export { normalizeWorkspaceState, type WorkspaceState } from "./workspace/types";

type Toast = (message: string | null) => void;

const loading = () => <div className="screen-loading" role="status" aria-label="Loading workspace"><span /><span /><span /></div>;
const ActivityScreen = dynamic(() => import("./workspace/activity-screen").then((module) => module.ActivityScreen), { loading });
const GoalsScreen = dynamic(() => import("./workspace/goals-screen").then((module) => module.GoalsScreen), { loading });
const LearnScreen = dynamic(() => import("./workspace/learn-screen").then((module) => module.LearnScreen), { loading });
const CodeScreen = dynamic(() => import("./workspace/code-screen").then((module) => module.CodeScreen), { loading });
const MemoryScreen = dynamic(() => import("./workspace/memory-screen").then((module) => module.MemoryScreen), { loading });
const ResearchScreen = dynamic(() => import("./workspace/research-screen").then((module) => module.ResearchScreen), { loading });
const TodayScreen = dynamic(() => import("./workspace/today-screen").then((module) => module.TodayScreen), { loading });

export function WorkspaceScreens({ view, state, user, userName, serverNow, onNavigate, onRefresh, showToast }: { view: WorkspaceView; state: WorkspaceState; user: AuthUser; userName: string; serverNow: string; onNavigate: (view: WorkspaceView) => void; onRefresh: () => Promise<void>; showToast: Toast }) {
  if (view === "today") return <TodayScreen state={state} userName={userName} timeZone={user.timezone} serverNow={serverNow} onNavigate={onNavigate} onRefresh={onRefresh} />;
  if (view === "goals") return <GoalsScreen state={state} timeZone={user.timezone} serverNow={serverNow} showToast={showToast} onRefresh={onRefresh} />;
  if (view === "learn") return <LearnScreen state={state} userId={user.id} showToast={showToast} onRefresh={onRefresh} />;
  if (view === "code") return <CodeScreen state={state} user={user} showToast={showToast} />;
  if (view === "research") return <ResearchScreen state={state} showToast={showToast} onRefresh={onRefresh} />;
  if (view === "memory") return <MemoryScreen state={state} showToast={showToast} />;
  if (view === "activity") return <ActivityScreen state={state} timeZone={user.timezone} showToast={showToast} onRefresh={onRefresh} />;
  return null;
}
