"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { StartFlow } from "./start-flow";
import { workspacePath, type WorkspaceView } from "@/lib/workspace-routes";

export const SKIP_ONBOARDING_KEY = "continuum.onboarding.skipped.v1";

/**
 * `/start` — the standalone first-run route (§9.3), in its own shell with no
 * sidebar. The separate "Skip for now" link below the panel is gone: StartFlow
 * offers skipping inline as a secondary action on step 1, so the escape hatch
 * is where the decision is made rather than duplicated underneath (AC-S4).
 */
export function StartScreen({ userName }: { userName: string }) {
  const router = useRouter();

  const finish = useCallback((view?: WorkspaceView) => {
    // A fresh account is about to gain goals, so the whole snapshot is stale.
    window.localStorage.removeItem(SKIP_ONBOARDING_KEY);
    router.replace(workspacePath[view ?? "today"]);
    router.refresh();
  }, [router]);

  return (
    <div className="app-shell welcome-shell">
      <main className="main-area">
        <div className="content-wrap">
          <StartFlow
            userName={userName}
            onRefresh={async () => finish("today")}
            onNavigate={(view) => finish(view)}
          />
        </div>
      </main>
    </div>
  );
}
