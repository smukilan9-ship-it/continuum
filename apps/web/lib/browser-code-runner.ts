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
  | { type: "result"; id: string; result: ExecutionResult };

export type ExecutionHandle = {
  result: Promise<ExecutionResult>;
  stop: () => void;
};

export function startBrowserExecution(request: ExecutionRequest, onStatus?: (status: ExecutionStatus) => void): ExecutionHandle {
  const validationError = validateExecutionRequest(request);
  if (validationError) return { result: Promise.resolve(emptyExecutionResult(request, "provider_error", validationError, 0)), stop: () => undefined };

  const startedAt = performance.now();
  const worker = new Worker(new URL("./code-execution.worker.ts", import.meta.url), { type: "module", name: `continuum-${request.language}` });
  let finish: ((result: ExecutionResult) => void) | undefined;
  let settled = false;

  const complete = (result: ExecutionResult) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    worker.terminate();
    finish?.(result);
  };

  const result = new Promise<ExecutionResult>((resolve) => {
    finish = resolve;
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.id !== request.id) return;
      if (message.type === "status") onStatus?.(message.status);
      else complete(message.result);
    };
    worker.onerror = (event) => complete(emptyExecutionResult(request, "provider_error", event.message || "The browser runtime failed to start.", Math.round(performance.now() - startedAt)));
    worker.postMessage(request);
  });

  const timeout = window.setTimeout(() => {
    complete(emptyExecutionResult(request, "timeout", `Execution stopped after ${request.timeoutMs.toLocaleString()} ms.`, Math.round(performance.now() - startedAt)));
  }, request.timeoutMs);

  return {
    result,
    stop: () => complete(emptyExecutionResult(request, "stopped", "Execution stopped by the learner.", Math.round(performance.now() - startedAt))),
  };
}
