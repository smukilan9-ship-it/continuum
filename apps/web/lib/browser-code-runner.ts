"use client";

import {
  emptyExecutionResult,
  validateExecutionRequest,
  type ExecutionRequest,
  type ExecutionResult,
  type ExecutionStatus,
} from "./code-execution";

type WorkerMessage =
  | { type: "status"; id: string; status: ExecutionStatus }
  | { type: "result"; id: string; result: ExecutionResult }
  | { type: "ready"; id: string; language: ExecutionRequest["language"] }
  | { type: "startup_error"; id: string; error: string };

export type ExecutionHandle = {
  result: Promise<ExecutionResult>;
  stop: () => void;
};

type WorkerSlot = {
  worker: Worker;
  activeId?: string;
};

const slots = new Map<ExecutionRequest["language"], WorkerSlot>();

function createSlot(language: ExecutionRequest["language"]) {
  const worker = new Worker(new URL("./code-execution.worker.ts", import.meta.url), { type: "module", name: `continuum-${language}` });
  const slot: WorkerSlot = { worker };
  slots.set(language, slot);
  return slot;
}

function slotFor(language: ExecutionRequest["language"]) {
  return slots.get(language) ?? createSlot(language);
}

function discardSlot(language: ExecutionRequest["language"], slot: WorkerSlot) {
  slot.worker.terminate();
  if (slots.get(language) === slot) slots.delete(language);
}

/** Load a heavy runtime while the learner is editing. This never runs user code. */
export function prewarmBrowserRuntime(language: ExecutionRequest["language"]) {
  if (!["python", "sql"].includes(language)) return () => undefined;
  const slot = slotFor(language);
  if (slot.activeId) return () => undefined;
  const id = `prewarm-${crypto.randomUUID()}`;
  slot.worker.postMessage({ type: "prewarm", id, language });
  return () => undefined;
}

export function startBrowserExecution(request: ExecutionRequest, onStatus?: (status: ExecutionStatus) => void): ExecutionHandle {
  const validationError = validateExecutionRequest(request);
  if (validationError) return { result: Promise.resolve(emptyExecutionResult(request, "provider_error", validationError, 0)), stop: () => undefined };

  const startedAt = performance.now();
  const slot = slotFor(request.language);
  if (slot.activeId) {
    return {
      result: Promise.resolve(emptyExecutionResult(request, "provider_error", "Another program is already running. Stop it before starting a new run.", 0)),
      stop: () => undefined,
    };
  }
  const worker = slot.worker;
  slot.activeId = request.id;
  let finish: ((result: ExecutionResult) => void) | undefined;
  let settled = false;
  let executionStartedAt: number | undefined;
  let executionTimeout: number | undefined;

  const complete = (result: ExecutionResult) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(startupTimeout);
    if (executionTimeout) window.clearTimeout(executionTimeout);
    slot.activeId = undefined;
    finish?.(result);
  };

  const terminate = (outcome: "timeout" | "stopped", message: string) => {
    const elapsed = Math.round(performance.now() - startedAt);
    discardSlot(request.language, slot);
    complete({
      ...emptyExecutionResult(request, outcome, message, executionStartedAt ? Math.round(performance.now() - executionStartedAt) : elapsed),
      startupDurationMs: executionStartedAt ? Math.round(executionStartedAt - startedAt) : elapsed,
      durationMs: elapsed,
      timeoutMs: request.timeoutMs,
      terminated: true,
    });
  };

  const result = new Promise<ExecutionResult>((resolve) => {
    finish = resolve;
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.id !== request.id) return;
      if (message.type === "status") {
        onStatus?.(message.status);
        if (message.status === "running" && !executionStartedAt) {
          executionStartedAt = performance.now();
          window.clearTimeout(startupTimeout);
          executionTimeout = window.setTimeout(() => terminate(
            "timeout",
            `Your program exceeded the ${Math.round(request.timeoutMs / 1000)}-second execution limit and was terminated. Check for a loop that never finishes, or choose Extended run in Advanced settings.`,
          ), request.timeoutMs);
        }
      } else if (message.type === "result") complete(message.result);
      else if (message.type === "startup_error") {
        discardSlot(request.language, slot);
        complete(emptyExecutionResult(request, "provider_error", `The ${request.language === "python" ? "Python" : "code"} setup could not start. ${message.error}`, Math.round(performance.now() - startedAt)));
      }
    };
    worker.onerror = (event) => {
      discardSlot(request.language, slot);
      complete(emptyExecutionResult(request, "provider_error", event.message || "The browser runtime failed to start.", Math.round(performance.now() - startedAt)));
    };
    worker.postMessage({ type: "execute", request });
  });

  const startupTimeout = window.setTimeout(() => terminate(
    "timeout",
    `The ${request.language === "python" ? "Python" : "code"} setup did not finish within 45 seconds and was terminated. Refresh the page and check that your browser allows Continuum runtime files to load.`,
  ), 45_000);

  return {
    result,
    stop: () => {
      onStatus?.("stopping");
      terminate("stopped", "You stopped the program. Its worker was terminated and the editor content was preserved.");
    },
  };
}
