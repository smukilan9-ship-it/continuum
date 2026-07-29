"use client";

/**
 * Client shell for `/study/[sessionId]`.
 *
 * The study route sits outside the workspace shell — that is what makes it
 * focused — so it cannot inherit the shell's toast surface. It mounts its own
 * `ToastProvider` here rather than having `StudySession` fall back to silence
 * when a save fails.
 */
import { ToastProvider, useToast } from "@/components/ui";
import { StudySession } from "./study-session";

type Props = Omit<Parameters<typeof StudySession>[0], "showToast">;

function Inner(props: Props) {
  const { push } = useToast();
  return (
    <StudySession
      {...props}
      showToast={(message) => { if (message) push({ tone: "error", message }); }}
    />
  );
}

export function StudySessionScreen(props: Props) {
  return (
    <ToastProvider>
      <Inner {...props} />
    </ToastProvider>
  );
}
