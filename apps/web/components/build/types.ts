import type { ExecutionResult } from "@/lib/code-execution";
import type { CodeWorkspaceFile } from "@/components/workspace/use-code-session";

export type BuildFile = CodeWorkspaceFile;

/**
 * What `/build` hands the global assistant panel when the learner presses Ask.
 *
 * §8.5 says the panel attaches the current page as a context chip — for build
 * that is "File: {name} + last run" — and §14.3 moves the old third-tab coach's
 * contextual starters here as suggestion chips. This type is the contract; the
 * panel that consumes it is Phase 3 work that has not shipped yet.
 */
export type AskContext = {
  fileName: string;
  language: string;
  code: string;
  result?: ExecutionResult;
  /** Learner-facing error text, already stripped of bundle URLs. */
  error?: string;
  /** Offered as chips in the panel: "Explain this error" after a failure. */
  suggestions: string[];
};
