import { ContinuumApp, type ShellData } from "@/components/continuum-app";
import { getServerUser } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { workspacePath, type WorkspaceView } from "@/lib/workspace-routes";
import { redirect } from "next/navigation";

export const workspacePageMetadata = { robots: { index: false, follow: false } };

export async function WorkspacePage({ view, goalId, projectId }: { view: WorkspaceView; goalId?: string; projectId?: string }) {
  const user = await getServerUser();
  if (!user) {
    const returnTo = projectId && goalId ? `/g/${goalId}/p/${projectId}` : goalId ? `/g/${goalId}` : workspacePath[view];
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  const store = getStore(user.id);
  // The shell's own chrome (goal list, Review badge) reads separately from the
  // screen's data, so it is correct on every route rather than only on the ones
  // whose snapshot happens to select goals (§8.1, C25).
  const [snapshot, shell] = await Promise.all([store.workspace(view), store.shellData()]);
  const initialState = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  const shellData = JSON.parse(JSON.stringify(shell)) as ShellData;
  // A user with no plan yet is pointed at onboarding from any workspace route,
  // not just Today. `ContinuumApp` honours a client-side "skip for now" flag so a
  // power user who chose to explore is not bounced back on every click.
  //
  // This used to need a second, fallible read on any view whose snapshot has no
  // `goals` key — where `[]` means "not part of this view", not "this user has
  // none", and reading it as the latter bounced every Library deep link to
  // onboarding. Shell data answers it directly.
  const needsOnboarding = view !== "today" && shell.goals.length === 0;
  return <ContinuumApp user={user} initialState={initialState} shell={shellData} view={view} goalId={goalId} projectId={projectId} serverNow={new Date().toISOString()} needsOnboarding={needsOnboarding} />;
}

