import { WorkspacePage, workspacePageMetadata } from "@/app/workspace-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = workspacePageMetadata;

/**
 * §13.1 — a research project, reached through the goal that owns it. It renders
 * inside the app shell like every other screen, so it has the sidebar, `⌘K`,
 * and the `⌘J` assistant; rendering it standalone left `ProjectScreen` outside
 * the assistant provider and it threw on mount.
 */
export default async function ProjectPage({ params }: { params: Promise<{ goalId: string; projectId: string }> }) {
  const { goalId, projectId } = await params;
  return <WorkspacePage view="project" goalId={goalId} projectId={projectId} />;
}
