import { WorkspacePage, workspacePageMetadata } from "@/app/workspace-page";

export const dynamic = "force-dynamic";
export const metadata = workspacePageMetadata;

/**
 * `/plan` is the name the product uses for this surface (redesign.md §14.2) and
 * is already what the sidebar and `workspaceMeta` call it. The permanent
 * `/goals → /plan` redirect belongs to §16.7, which lands with the route-group
 * migration, so both paths serve the same screen until then.
 */
export default function PlanPage() { return <WorkspacePage view="goals" />; }
