import { WorkspacePage, workspacePageMetadata } from "../workspace-page";

export const dynamic = "force-dynamic";
export const metadata = workspacePageMetadata;

export default function AssistantPage() {
  return <WorkspacePage view="assistant" />;
}
