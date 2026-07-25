export const RUNNABLE_LANGUAGES = ["python", "javascript", "typescript", "sql"] as const;
export type RunnableLanguage = (typeof RUNNABLE_LANGUAGES)[number];

export type ExecutionTest = {
  id: string;
  name: string;
  stdin?: string;
  expectedOutput: string;
};

export type ExecutionTestResult = ExecutionTest & {
  actualOutput: string;
  passed: boolean;
  error?: string;
};

export type SqlResultTable = {
  columns: string[];
  rows: Array<Array<string | number | null>>;
};

export type ExecutionOutcome =
  | "success"
  | "compiler_error"
  | "runtime_error"
  | "timeout"
  | "stopped"
  | "provider_error";

export type ExecutionRequest = {
  id: string;
  language: RunnableLanguage;
  source: string;
  stdin: string;
  timeoutMs: number;
  tests: ExecutionTest[];
};

export type ExecutionResult = {
  id: string;
  language: RunnableLanguage;
  outcome: ExecutionOutcome;
  stdout: string;
  stderr: string;
  /** Raw runtime diagnostics shown only inside the advanced details disclosure. */
  technicalStderr?: string;
  exitCode: number | null;
  durationMs: number;
  /** Time spent loading the language runtime before user code started. */
  startupDurationMs?: number;
  /** Time spent executing user code (and tests, when explicitly requested). */
  executionDurationMs?: number;
  timeoutMs?: number;
  terminated?: boolean;
  timedOut: boolean;
  rowsModified?: number;
  tables?: SqlResultTable[];
  tests: ExecutionTestResult[];
};

export type ExecutionStatus = "preparing" | "loading_python" | "loading_sql" | "ready" | "running" | "testing" | "stopping";

export const EXECUTION_LIMITS = {
  maxSourceCharacters: 50_000,
  maxStdinCharacters: 20_000,
  maxOutputCharacters: 64_000,
  maxTests: 8,
  minTimeoutMs: 500,
  maxTimeoutMs: 30_000,
  runtimeStartupTimeoutMs: 45_000,
} as const;

export function normalizeRunnableLanguage(value: string): RunnableLanguage | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "js") return "javascript";
  if (normalized === "ts") return "typescript";
  if (normalized === "sqlite") return "sql";
  return RUNNABLE_LANGUAGES.find((language) => language === normalized);
}

export function validateExecutionRequest(request: ExecutionRequest) {
  if (!RUNNABLE_LANGUAGES.includes(request.language)) return "This language does not have a deterministic runtime.";
  if (!request.source.trim()) return "Write some code before running it.";
  if (request.source.length > EXECUTION_LIMITS.maxSourceCharacters) return `Source is limited to ${EXECUTION_LIMITS.maxSourceCharacters.toLocaleString()} characters.`;
  if (request.stdin.length > EXECUTION_LIMITS.maxStdinCharacters) return `Input is limited to ${EXECUTION_LIMITS.maxStdinCharacters.toLocaleString()} characters.`;
  if (request.tests.length > EXECUTION_LIMITS.maxTests) return `A run can include at most ${EXECUTION_LIMITS.maxTests} tests.`;
  if (request.timeoutMs < EXECUTION_LIMITS.minTimeoutMs || request.timeoutMs > EXECUTION_LIMITS.maxTimeoutMs) return "Execution timeout is outside the allowed range.";
  if (["javascript", "typescript"].includes(request.language) && /\bimport\s*\(/.test(request.source)) return "Dynamic imports are disabled in the browser sandbox.";
  return undefined;
}

export function capExecutionOutput(value: string) {
  if (value.length <= EXECUTION_LIMITS.maxOutputCharacters) return value;
  return `${value.slice(0, EXECUTION_LIMITS.maxOutputCharacters)}\n… output truncated at ${EXECUTION_LIMITS.maxOutputCharacters.toLocaleString()} characters`;
}

export function formatPythonError(value: string) {
  const withoutJavaScriptStack = (value
    .split(/\n\s+at (?:new_error|https?:|wasm:|wrapper\b|Object\.)/)[0] ?? value)
    .trim();
  const lines = withoutJavaScriptStack.split("\n");
  const firstUserFrame = lines.findIndex((line) => /File ["']<exec>["']/.test(line));
  if (firstUserFrame >= 0) {
    const tracebackLine = lines.find((line) => line.includes("Traceback"));
    const traceback = tracebackLine ? tracebackLine.slice(tracebackLine.indexOf("Traceback")) : undefined;
    return [traceback, ...lines.slice(firstUserFrame)].filter(Boolean).join("\n").trim();
  }
  let finalPythonError = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/(?:SyntaxError|IndentationError|TabError|NameError|TypeError|ValueError|ImportError|RuntimeError|ZeroDivisionError|MemoryError):/.test(lines[index]!)) {
      finalPythonError = index;
      break;
    }
  }
  return finalPythonError >= 0 ? lines.slice(Math.max(0, finalPythonError - 1)).join("\n").trim() : withoutJavaScriptStack;
}

export function normalizedOutput(value: string) {
  return value.replace(/\r\n/g, "\n").trimEnd();
}

export function renderSqlTables(tables: SqlResultTable[] = []) {
  return tables.map((table) => [table.columns.join(" | "), ...table.rows.map((row) => row.map((cell) => cell === null ? "NULL" : String(cell)).join(" | "))].join("\n")).join("\n\n");
}

export function gradeExecutionTest(test: ExecutionTest, actualOutput: string, error?: string): ExecutionTestResult {
  return {
    ...test,
    actualOutput: normalizedOutput(actualOutput),
    passed: !error && normalizedOutput(actualOutput) === normalizedOutput(test.expectedOutput),
    ...(error ? { error } : {}),
  };
}

export function emptyExecutionResult(request: ExecutionRequest, outcome: ExecutionOutcome, stderr: string, durationMs: number): ExecutionResult {
  return {
    id: request.id,
    language: request.language,
    outcome,
    stdout: "",
    stderr,
    exitCode: outcome === "stopped" ? null : 1,
    durationMs,
    executionDurationMs: durationMs,
    timeoutMs: request.timeoutMs,
    terminated: outcome === "stopped" || outcome === "timeout",
    timedOut: outcome === "timeout",
    tests: [],
  };
}

export const LANGUAGE_RUNTIME_NOTES: Record<RunnableLanguage, string> = {
  python: "Python runs in a browser-only WebAssembly worker. Network access, desktop files, server data, and package installation are unavailable; temporary files are cleared after each run.",
  javascript: "JavaScript runs in an isolated browser worker with network APIs disabled and a hard wall-clock timeout.",
  typescript: "TypeScript is compiled locally, then executed in the same disposable JavaScript worker.",
  sql: "SQLite in WebAssembly. It supports instructional DDL, queries, transactions, and data changes; it is not MySQL.",
};

export const EDITOR_ONLY_LANGUAGES = ["Java", "C", "C++", "Rust"] as const;
