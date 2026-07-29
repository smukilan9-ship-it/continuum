import { WorkspacePage, workspacePageMetadata } from "@/app/workspace-page";

export const dynamic = "force-dynamic";
export const metadata = workspacePageMetadata;

/**
 * Each settings segment has its own address so it can be linked, bookmarked, and
 * returned to with Back. The workspace shell resolves a view from the first path
 * segment, so every one of these is the `account` view; the settings page reads
 * the second segment to decide which section to open.
 */
export default function AppearanceSettingsPage() { return <WorkspacePage view="account" />; }
