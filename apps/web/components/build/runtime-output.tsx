"use client";

import { AlertTriangle, CheckCircle2, Edit3, Sparkles, TerminalSquare } from "lucide-react";

import { Button, EmptyState, LoadingState, StatusChip } from "@/components/ui";
import type { ExecutionResult, ExecutionStatus } from "@/lib/code-execution";

import { outcomeLabel, outcomeTone, statusLabel } from "./language";
import { cleanRuntimeMessage, errorLineFrom } from "./runtime-error";

/**
 * The console body (redesign.md §14.3).
 *
 * The error treatment is retained verbatim because it is the one part of the
 * old screen the audit called genuinely good: a plain headline carrying the
 * line number, one sentence of guidance, **Go to line n**, **Explain this
 * error**, and the full traceback behind a disclosure with bundle URLs stripped
 * (`cleanRuntimeMessage`).
 *
 * Output lives in a `<pre>` inside `role="log" aria-live="polite"`. A run
 * delivers its output in one piece at completion, so the region announces the
 * finished state once rather than narrating characters as they arrive.
 */
export function RuntimeOutput({
  result,
  source,
  running,
  status,
  announcement,
  onAsk,
  onJump,
  onIncreaseLimit,
}: {
  result: ExecutionResult | undefined;
  source: string;
  running: boolean;
  status: ExecutionStatus;
  announcement: string;
  onAsk: (intent: string) => void;
  onJump: (line: number) => void;
  onIncreaseLimit: () => void;
}) {
  if (running) {
    return (
      <div className="build-console-body build-console-running">
        <LoadingState variant="spinner" label={statusLabel(status)} />
        <p>Output appears here the moment the run finishes.</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="build-console-body">
        <EmptyState
          icon={<TerminalSquare size={20} />}
          title="Press Run to see what this does."
          body="The sample program is ready. Nothing runs until you ask for it."
        />
      </div>
    );
  }

  // The learner-facing message never carries a bundle URL or a JS stack frame;
  // the raw text stays available under Technical details.
  const readableError = cleanRuntimeMessage(result.stderr ?? "");
  const errorHeadline = readableError.split("\n")[0] ?? "";
  const errorBody = readableError.split("\n").slice(1).join("\n").trim();
  const parsedErrorLine = errorLineFrom(result.language, `${result.stderr}\n${result.technicalStderr ?? ""}`, source);
  const failed = result.outcome !== "success" && result.outcome !== "stopped";
  const limitSeconds = Math.round((result.timeoutMs ?? result.durationMs) / 1000);
  const guidance = result.outcome === "success"
    ? "Your program ran successfully. Check the output below."
    : result.outcome === "compiler_error"
      ? "The code could not be translated into a runnable program. Start with the first error below."
      : result.outcome === "runtime_error"
        ? "The program started, then stopped at an error. The message below identifies the failure."
        : result.outcome === "timeout"
          ? `Stopped after ${limitSeconds} seconds — check for a loop that never ends.`
          : result.outcome === "stopped"
            ? "The run was stopped before it finished."
            : "The local runner is temporarily unavailable. Your code is still saved.";

  return (
    <div className="build-console-body">
      <div className="build-console-log" role="log" aria-live="polite">
        <p className="sr-only">{announcement}</p>

        {/* Error-first: lead with the fix, not the dump. The full traceback is
            one disclosure away. */}
        {failed ? (
          <div className="build-error-lead">
            <div className="build-error-headline">
              <AlertTriangle size={17} aria-hidden="true" />
              <div>
                <strong>{errorHeadline || outcomeLabel(result.outcome)}{parsedErrorLine > 0 ? ` — line ${parsedErrorLine}` : ""}</strong>
                {errorBody ? <span>{errorBody}</span> : null}
              </div>
            </div>
            <p>{guidance}</p>
            <div className="build-error-actions">
              {parsedErrorLine > 0 ? (
                <Button variant="secondary" size="sm" onClick={() => onJump(parsedErrorLine)}>
                  <Edit3 size={14} aria-hidden="true" />Go to line {parsedErrorLine}
                </Button>
              ) : null}
              <Button variant="secondary" size="sm" onClick={() => onAsk("Explain this error")}>
                <Sparkles size={14} aria-hidden="true" />Explain this error
              </Button>
              {result.outcome === "timeout" ? (
                <Button variant="secondary" size="sm" onClick={onIncreaseLimit}>Increase limit</Button>
              ) : null}
            </div>
            {readableError ? <details className="build-traceback"><summary>Full traceback</summary><pre>{readableError}</pre></details> : null}
          </div>
        ) : (
          <div className="build-success-lead">
            <CheckCircle2 size={17} aria-hidden="true" />
            <div>
              <strong>{result.outcome === "stopped" ? "Program stopped" : "Run complete"}</strong>
              <span>{guidance}</span>
            </div>
          </div>
        )}

        {result.stdout ? <pre className="build-stdout">{result.stdout}</pre> : null}

        {result.tables?.length ? result.tables.map((table, index) => (
          <section className="build-sql-table" key={`${index}-${table.columns.join("-")}`}>
            <h3>Result table {index + 1}</h3>
            <div>
              <table>
                <thead><tr>{table.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                <tbody>
                  {table.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell === null ? <em>NULL</em> : String(cell)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )) : null}

        {typeof result.rowsModified === "number" ? <p className="build-rows-modified">{result.rowsModified} row{result.rowsModified === 1 ? "" : "s"} changed during the run.</p> : null}

        {!result.stdout && !result.stderr && !result.tables?.length && result.outcome === "success" ? (
          <p className="build-quiet-success">Completed without printable output.</p>
        ) : null}

        <details className="build-technical">
          <summary>Technical details</summary>
          <dl>
            <div><dt>Status</dt><dd>{outcomeLabel(result.outcome)}</dd></div>
            <div><dt>Exit code</dt><dd>{result.exitCode ?? "Not available"}</dd></div>
            <div><dt>Language setup</dt><dd>{result.startupDurationMs ?? 0} ms</dd></div>
            <div><dt>Execution</dt><dd>{result.executionDurationMs ?? result.durationMs} ms</dd></div>
            <div><dt>Limit</dt><dd>{result.timeoutMs ? `${result.timeoutMs / 1000} seconds` : "Not recorded"}</dd></div>
            <div><dt>Terminated</dt><dd>{result.terminated ? "Yes" : "No"}</dd></div>
          </dl>
          {result.technicalStderr ? <div className="build-raw-error"><strong>Raw runtime diagnostic</strong><pre>{result.technicalStderr}</pre></div> : null}
        </details>
      </div>
    </div>
  );
}

/** The run outcome as it appears in the console header. */
export function RunStatus({ result, running, status }: { result: ExecutionResult | undefined; running: boolean; status: ExecutionStatus }) {
  if (running) return <StatusChip tone="processing" label={statusLabel(status)} />;
  if (!result) return <StatusChip tone="neutral" label="Not run yet" />;
  return <StatusChip tone={outcomeTone(result.outcome)} label={`${outcomeLabel(result.outcome)} · ${result.executionDurationMs ?? result.durationMs}ms`} />;
}
