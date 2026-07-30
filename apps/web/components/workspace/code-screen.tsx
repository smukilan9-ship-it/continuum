"use client";

import type { AuthUser } from "@continuum/db";

import { useAssistant } from "@/components/assistant/use-assistant";
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

export function CodeScreen({ state, user, showToast }: { state: WorkspaceState; user: AuthUser; showToast: Toast }) {
  const assistant = useAssistant();
  /**
   * §8.5: Ask opens the one global panel with this file, its language, and the
   * last run attached as the page chip — so the assistant answers about the
   * actual error rather than a description of it.
   */
  const askAssistant = (context: AskContext) => {
    const detail = [
      `File: ${context.fileName} (${context.language})`,
      context.result ? `Last run: ${context.result.outcome}` : "Not run yet",
      context.error ? `Error: ${context.error}` : "",
      `\n${context.code.slice(0, 4_000)}`,
    ].filter(Boolean).join("\n");
    assistant.askFromPage({
      page: { kind: "build", label: `File: ${context.fileName}`, detail },
      prompt: context.suggestions[0] ?? "Explain my code",
    });
  };
  return <BuildWorkspace state={state} user={user} showToast={showToast} onAskAssistant={askAssistant} />;
}
