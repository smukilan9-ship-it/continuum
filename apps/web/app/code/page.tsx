import { WorkspacePage, workspacePageMetadata } from "@/app/workspace-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = workspacePageMetadata;

export default async function CodePage() {
  return <WorkspacePage view="code" />;
}
