"use client";

/**
 * `/learn` (redesign.md §14.1, §17 Phase 7).
 *
 * The 580-line screen that used to live here — six mental models on one page
 * (C10) plus a four-step resource wizard (C16) — is now three things:
 * `components/study/study-view.tsx`, `components/study/resource-panel.tsx`, and
 * the `/study/[sessionId]` route.
 *
 * This file stays only to keep the screen registry's contract: it is loaded by
 * name and prop shape from `components/workspace-screens.tsx`, which is outside
 * this phase's scope.
 */
import { StudyView } from "@/components/study/study-view";
import type { WorkspaceState } from "./types";

type Toast = (message: string | null) => void;

export function LearnScreen({
  state,
  showToast,
  onRefresh,
}: {
  state: WorkspaceState;
  /** Sessions are keyed server-side now; the screen no longer needs the id. */
  userId: string;
  showToast: Toast;
  onRefresh: () => Promise<void>;
}) {
  return <StudyView state={state} showToast={showToast} onRefresh={onRefresh} />;
}
