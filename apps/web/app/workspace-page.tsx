import { ContinuumApp } from "@/components/continuum-app";
import { getServerUser } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { workspacePath, type WorkspaceView } from "@/lib/workspace-routes";
import { redirect } from "next/navigation";

export const workspacePageMetadata = { robots: { index: false, follow: false } };

export async function WorkspacePage({ view, goalId }: { view: WorkspaceView; goalId?: string }) {
  const user = await getServerUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(goalId ? `/g/${goalId}` : workspacePath[view])}`);
  const snapshot = await getStore(user.id).workspace(view);
  const initialState = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  // A user with no plan yet is pointed at onboarding from any workspace route,
  // not just Today. `ContinuumApp` honours a client-side "skip for now" flag so a
  // power user who chose to explore is not bounced back on every click.
  //
  // Views whose own snapshot carries no goals (Library, Connections, Account…)
  // need one extra read. It must fail safe: a read that errors, or returns an
  // unexpected shape, leaves the user where they asked to be rather than
  // bouncing them out of a deep link.
  const needsOnboarding = view !== "today" && await hasNoGoals(user.id, view, initialState);
  return <ContinuumApp user={user} initialState={initialState} view={view} goalId={goalId} serverNow={new Date().toISOString()} needsOnboarding={needsOnboarding} />;
}

/**
 * Views that actually load goals into their snapshot. The others return an empty
 * skeleton in which `goals: []` means "not part of this view", not "this user has
 * none" — reading it as the latter bounced every Library deep link to onboarding
 * and from there to Today.
 */
const VIEWS_WITH_GOALS = new Set<WorkspaceView>(["today", "goals", "goal", "learn", "research", "memory", "code", "assistant"]);

async function hasNoGoals(userId: string, view: WorkspaceView, snapshot: Record<string, unknown>) {
  if (VIEWS_WITH_GOALS.has(view) && Array.isArray(snapshot.goals)) return snapshot.goals.length === 0;
  try {
    const today = await getStore(userId).workspace("today") as { goals?: unknown };
    return Array.isArray(today.goals) ? today.goals.length === 0 : false;
  } catch {
    // Fail safe: leave the user where they asked to be rather than redirecting.
    return false;
  }
}
