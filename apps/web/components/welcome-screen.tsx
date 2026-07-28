"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { OnboardingFlow } from "@/components/workspace/onboarding-flow";
import { workspacePath } from "@/lib/workspace-routes";

export const SKIP_ONBOARDING_KEY = "continuum.onboarding.skipped.v1";

/**
 * The standalone onboarding route. "Skip for now" sets a flag so a power user can
 * explore the empty workspace, and the flag is cleared once a plan exists.
 */
export function WelcomeScreen({ userName }: { userName: string }) {
  const router = useRouter();

  const finish = useCallback(async (view?: "goals" | "today" | "learn") => {
    window.localStorage.removeItem(SKIP_ONBOARDING_KEY);
    // A fresh account is about to gain goals, so the whole workspace snapshot is stale.
    router.replace(workspacePath[view ?? "today"]);
    router.refresh();
  }, [router]);

  return (
    <div className="app-shell welcome-shell">
      <main className="main-area">
        <div className="content-wrap">
          <OnboardingFlow
            userName={userName}
            onRefresh={async () => { /* navigation happens on the completion CTA */ }}
            onNavigate={(view) => void finish(view)}
          />
          <div className="welcome-skip">
            <button
              type="button"
              onClick={() => {
                window.localStorage.setItem(SKIP_ONBOARDING_KEY, "1");
                router.replace(workspacePath.today);
              }}
            >
              Skip for now and explore the workspace
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
