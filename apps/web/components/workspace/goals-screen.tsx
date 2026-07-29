"use client";

/**
 * `/plan` and `/goals` (redesign.md §14.2, §17 Phase 7).
 *
 * The 457-line screen that used to live here is now `components/plan/*`. This
 * file stays only to keep the screen registry's contract: it is loaded by name
 * and prop shape from `components/workspace-screens.tsx`, which is outside this
 * phase's scope.
 */
import { PlanPage } from "@/components/plan/plan-page";
import type { WorkspaceState } from "./types";

type Toast = (message: string | null) => void;

export function GoalsScreen({
  state,
  timeZone,
  serverNow,
  showToast,
  onRefresh,
}: {
  state: WorkspaceState;
  timeZone: string;
  serverNow: string;
  showToast: Toast;
  onRefresh: () => Promise<void>;
}) {
  return <PlanPage state={state} timeZone={timeZone} serverNow={serverNow} showToast={showToast} onRefresh={onRefresh} />;
}
