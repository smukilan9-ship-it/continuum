import { WorkspacePage, workspacePageMetadata } from "@/app/workspace-page";

export const dynamic = "force-dynamic";
export const metadata = workspacePageMetadata;
export default function ActivityPage() { return <WorkspacePage view="activity" />; }
