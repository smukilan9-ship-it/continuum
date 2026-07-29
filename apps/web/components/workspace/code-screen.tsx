"use client";

import type { AuthUser } from "@continuum/db";

import { BuildWorkspace } from "@/components/build/build-workspace";
import type { AskContext } from "@/components/build/types";

import type { WorkspaceState } from "./types";

/**
 * `/build` used to live in an 872-line `code-screen.tsx`. redesign.md §14.3
 * replaced it with `components/build/*`; what remains here is the entry point
 * `workspace-screens.tsx` already resolves, so the screen registry did not have
 * to change.
 *
 * The two error-presentation helpers are re-exported because they are pure,
 * covered by `tests/code-screen-helpers.test.ts`, and that suite asserts the
 * bundle-URL stripping §14.3 requires to be retained verbatim.
 */
export { cleanRuntimeMessage, errorLineFrom } from "@/components/build/runtime-error";

type Toast = (message: string | null) => void;

export function CodeScreen({
  state,
  user,
  showToast,
  onAskAssistant,
}: {
  state: WorkspaceState;
  user: AuthUser;
  showToast: Toast;
  onAskAssistant?: (context: AskContext) => void;
}) {
  return <BuildWorkspace state={state} user={user} showToast={showToast} onAskAssistant={onAskAssistant} />;
}
