import { ContinuumApp } from "@/components/continuum-app";
import { getServerUser } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { workspacePath, type WorkspaceView } from "@/lib/workspace-routes";
import { redirect } from "next/navigation";

export const workspacePageMetadata = { robots: { index: false, follow: false } };

export async function WorkspacePage({ view }: { view: WorkspaceView }) {
  const user = await getServerUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(workspacePath[view])}`);
  const snapshot = await getStore(user.id).workspace(view);
  const initialState = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  return <ContinuumApp user={user} initialState={initialState} view={view} serverNow={new Date().toISOString()} />;
}
