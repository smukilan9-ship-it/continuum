"use client";

import type { AuthUser } from "@continuum/db";
import dynamic from "next/dynamic";
import type { WorkspaceView } from "@/lib/workspace-routes";
import type { WorkspaceState } from "./workspace/types";

export { normalizeWorkspaceState, type WorkspaceState } from "./workspace/types";

type Toast = (message: string | null) => void;

const loading = () => <div className="screen-loading" role="status" aria-label="Loading workspace"><span /><span /><span /></div>;
const ReviewPage = dynamic(() => import("./review/review-page").then((module) => module.ReviewPage), { loading });
const AccountScreen = dynamic(() => import("./workspace/account-screen").then((module) => module.AccountScreen), { loading });
const AskSurface = dynamic(() => import("./assistant/ask-surface").then((module) => module.AskSurface), { loading });
const GoalsScreen = dynamic(() => import("./workspace/goals-screen").then((module) => module.GoalsScreen), { loading });
const GoalScreen = dynamic(() => import("./goal/goal-screen").then((module) => module.GoalScreen), { loading });
const LearnScreen = dynamic(() => import("./workspace/learn-screen").then((module) => module.LearnScreen), { loading });
const CodeScreen = dynamic(() => import("./workspace/code-screen").then((module) => module.CodeScreen), { loading });
const ContextPage = dynamic(() => import("./context/context-page").then((module) => module.ContextPage), { loading });
const LibraryScreen = dynamic(() => import("./workspace/library-screen").then((module) => module.LibraryScreen), { loading });
const ResearchScreen = dynamic(() => import("./workspace/research-screen").then((module) => module.ResearchScreen), { loading });
const HomePage = dynamic(() => import("./home/home-page").then((module) => module.HomePage), { loading });

export function WorkspaceScreens({ view, state, user, userName, serverNow, goalId, shellGoals, onNavigate, onRefresh, showToast }: { view: WorkspaceView; state: WorkspaceState; user: AuthUser; userName: string; serverNow: string; goalId?: string; shellGoals: Array<{ id: string; title: string; progress: number; targetDate: string; status: string }>; onNavigate: (view: WorkspaceView) => void; onRefresh: () => Promise<void>; showToast: Toast }) {
  if (view === "today") return <HomePage state={state} userName={userName} timeZone={user.timezone} serverNow={serverNow} onNavigate={onNavigate} onRefresh={onRefresh} />;
  if (view === "goal") return <GoalScreen goalId={goalId ?? ""} shellGoal={shellGoals.find((goal) => goal.id === goalId)} serverNow={serverNow} showToast={showToast} onNavigate={onNavigate} onRefresh={onRefresh} />;
  if (view === "assistant") return <AskSurface state={state} showToast={showToast} onRefresh={onRefresh} />;
  if (view === "goals") return <GoalsScreen state={state} timeZone={user.timezone} serverNow={serverNow} showToast={showToast} onRefresh={onRefresh} />;
  if (view === "learn") return <LearnScreen state={state} userId={user.id} showToast={showToast} onRefresh={onRefresh} />;
  if (view === "code") return <CodeScreen state={state} user={user} showToast={showToast} />;
  if (view === "research") return <ResearchScreen state={state} showToast={showToast} onRefresh={onRefresh} />;
  // `/openalex` and `/zotero` predate the merged Library destination and stay
  // reachable; they open the same screen with the matching tab preselected.
  if (view === "library") return <LibraryScreen showToast={showToast} onNavigate={onNavigate} state={state} />;
  if (view === "openalex") return <LibraryScreen initialTab="discover" showToast={showToast} onNavigate={onNavigate} state={state} />;
  if (view === "zotero") return <LibraryScreen initialTab="zotero" showToast={showToast} onNavigate={onNavigate} state={state} />;
  if (view === "memory") return <ContextPage state={state} showToast={showToast} />;
  if (view === "activity") return <ReviewPage state={state} timeZone={user.timezone} showToast={showToast} onRefresh={onRefresh} />;
  if (view === "account") return <AccountScreen user={user} showToast={showToast} />;
  return null;
}
