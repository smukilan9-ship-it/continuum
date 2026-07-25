import { redirect } from "next/navigation";
import { workspacePath } from "@/lib/workspace-routes";

export default function LegacyConnectionsPage() {
  redirect(workspacePath.integrations);
}
