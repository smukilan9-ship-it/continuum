/// <reference lib="webworker" />

import initSqlJs, { type Database } from "sql.js";
import ts from "typescript";
import {
  capExecutionOutput,
  formatPythonError,
  gradeExecutionTest,
  renderSqlTables,
  type ExecutionRequest,
  type ExecutionResult,
  type ExecutionStatus,
  type RunnableLanguage,
  type SqlResultTable,
} from "./code-execution";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const NativeWorker = Worker;
type RunPiece = Omit<ExecutionResult, "id" | "language" | "durationMs" | "timedOut" | "tests">;
type PythonGlobals = { destroy: () => void };
type PyodideInterface = {
  setStdout: (options: { batched: (value: string) => void }) => void;
  setStderr: (options: { batched: (value: string) => void }) => void;
  setStdin: (options: { stdin: () => string }) => void;
  toPy: (value: unknown) => PythonGlobals;
  runPythonAsync: (source: string, options?: { globals?: PythonGlobals }) => Promise<unknown>;
};

type WorkerRequest =
  | { type: "prewarm"; id: string; language: RunnableLanguage }
  | { type: "execute"; request: ExecutionRequest };

function status(id: string, value: ExecutionStatus) {
  scope.postMessage({ type: "status", id, status: value });
}

function safeText(value: unknown) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack || value.message;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function blockNetworkGlobals() {
  const blocked = () => { throw new Error("Network access is disabled in the Continuum browser sandbox."); };
  const blockedAsync = () => Promise.reject(new Error("Network access is disabled in the Continuum browser sandbox."));
  for (const [name, value] of Object.entries({ fetch: blockedAsync, XMLHttpRequest: blocked, WebSocket: blocked, EventSource: blocked, WebTransport: blocked, importScripts: blocked, Worker: blocked, SharedWorker: blocked, indexedDB: undefined, caches: undefined })) {
    try { Object.defineProperty(globalThis, name, { configurable: true, value }); } catch { /* absent or non-configurable in this browser */ }
  }
}

async function runJavaScript(source: string, stdin: string, language: RunnableLanguage): Promise<RunPiece> {
  let executable = source;
  if (language === "typescript") {
    const compiled = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, strict: true },
      reportDiagnostics: true,
    });
    const errors = (compiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    if (errors.length) {
      return {
        outcome: "compiler_error",
        stdout: "",
        stderr: errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n"),
        exitCode: 1,
      };
    }
    executable = compiled.outputText;
  }

  const workerSource = `
const __report = globalThis.postMessage.bind(globalThis);
const __stdout = [];
const __stderr = [];
const __safeText = (value) => {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack || value.message;
  try { return JSON.stringify(value); } catch { return String(value); }
};
const __blocked = () => { throw new Error("Network access is disabled in the Continuum browser sandbox."); };
const __blockedAsync = () => Promise.reject(new Error("Network access is disabled in the Continuum browser sandbox."));
for (const [name, value] of Object.entries({
  fetch: __blockedAsync,
  XMLHttpRequest: __blocked,
  WebSocket: __blocked,
  EventSource: __blocked,
  WebTransport: __blocked,
  importScripts: __blocked,
  Worker: __blocked,
  SharedWorker: __blocked,
  indexedDB: undefined,
  caches: undefined,
})) {
  try { Object.defineProperty(globalThis, name, { configurable: true, value }); } catch {}
}
const console = {
  log: (...values) => __stdout.push(values.map(__safeText).join(" ") + "\\n"),
  info: (...values) => __stdout.push(values.map(__safeText).join(" ") + "\\n"),
  debug: (...values) => __stdout.push(values.map(__safeText).join(" ") + "\\n"),
  warn: (...values) => __stderr.push(values.map(__safeText).join(" ") + "\\n"),
  error: (...values) => __stderr.push(values.map(__safeText).join(" ") + "\\n"),
};
const __lines = ${JSON.stringify(stdin.replace(/\r\n/g, "\n").split("\n"))};
let __line = 0;
const readline = (prompt) => {
  if (prompt) __stdout.push(String(prompt));
  return __lines[__line++] ?? "";
};
const input = readline;
const process = Object.freeze({
  stdin: Object.freeze({ read: () => readline() }),
  stdout: Object.freeze({ write: (value) => __stdout.push(String(value)) }),
  stderr: Object.freeze({ write: (value) => __stderr.push(String(value)) }),
  env: Object.freeze({}),
});
void (async () => {
try {
  await (async () => {
    "use strict";
${executable}
  })();
  __report({ outcome: "success", stdout: __stdout.join(""), stderr: __stderr.join(""), exitCode: 0 });
} catch (error) {
  __report({ outcome: "runtime_error", stdout: __stdout.join(""), stderr: __stderr.join("") + __safeText(error), exitCode: 1 });
}
})();
`;
  const objectUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
  try {
    return await new Promise<RunPiece>((resolve) => {
      const runner = new NativeWorker(objectUrl, { name: `continuum-${language}-run` });
      runner.onmessage = (event: MessageEvent<RunPiece>) => {
        runner.terminate();
        resolve({
          ...event.data,
          stdout: capExecutionOutput(event.data.stdout),
          stderr: capExecutionOutput(event.data.stderr),
        });
      };
      runner.onerror = (event) => {
        runner.terminate();
        resolve({ outcome: "compiler_error", stdout: "", stderr: capExecutionOutput(event.message || "The JavaScript runtime could not parse this program."), exitCode: 1 });
      };
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

let pyodidePromise: Promise<PyodideInterface> | undefined;
function pythonRuntime() {
  pyodidePromise ??= (async () => {
    const moduleUrl = "/runtime/pyodide/pyodide.mjs";
    const runtimeModule = await import(/* webpackIgnore: true */ moduleUrl) as { loadPyodide: (options: { indexURL: string }) => Promise<PyodideInterface> };
    return runtimeModule.loadPyodide({ indexURL: "/runtime/pyodide/" });
  })();
  return pyodidePromise;
}

async function runPython(source: string, stdin: string): Promise<RunPiece> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const pyodide = await pythonRuntime();
  const lines = stdin.replace(/\r\n/g, "\n").split("\n");
  let line = 0;
  pyodide.setStdout({ batched: (value) => stdout.push(`${value}\n`) });
  pyodide.setStderr({ batched: (value) => stderr.push(`${value}\n`) });
  pyodide.setStdin({ stdin: () => lines[line++] ?? "" });
  blockNetworkGlobals();
  const globals = pyodide.toPy({});
  try {
    await pyodide.runPythonAsync([
      "import builtins, sys, os, shutil",
      "for _continuum_path in ('/home/pyodide', '/tmp'):",
      "    os.makedirs(_continuum_path, exist_ok=True)",
      "    for _continuum_name in os.listdir(_continuum_path):",
      "        _continuum_target = os.path.join(_continuum_path, _continuum_name)",
      "        try:",
      "            shutil.rmtree(_continuum_target) if os.path.isdir(_continuum_target) else os.remove(_continuum_target)",
      "        except OSError:",
      "            pass",
      "os.chdir('/home/pyodide')",
      "if not hasattr(builtins, '_continuum_original_import'):",
      "    builtins._continuum_original_import = builtins.__import__",
      "_continuum_blocked = {'js', 'pyodide', 'micropip', 'socket', 'urllib', 'http', 'subprocess', 'multiprocessing', 'asyncio'}",
      "def _continuum_safe_import(name, *args, **kwargs):",
      "    if name.split('.')[0] in _continuum_blocked:",
      "        raise ImportError(f'{name} is disabled in the Continuum browser sandbox')",
      "    return builtins._continuum_original_import(name, *args, **kwargs)",
      "builtins.__import__ = _continuum_safe_import",
    ].join("\n"), { globals });
    await pyodide.runPythonAsync(source, { globals });
    return { outcome: "success", stdout: capExecutionOutput(stdout.join("")), stderr: capExecutionOutput(stderr.join("")), exitCode: 0 };
  } catch (error) {
    const rawMessage = `${stderr.join("")}${safeText(error)}`;
    const message = formatPythonError(rawMessage);
    const compiler = /(?:SyntaxError|IndentationError|TabError)/.test(message);
    return {
      outcome: compiler ? "compiler_error" : "runtime_error",
      stdout: capExecutionOutput(stdout.join("")),
      stderr: capExecutionOutput(message),
      technicalStderr: rawMessage.trim() === message ? undefined : capExecutionOutput(rawMessage),
      exitCode: 1,
    };
  } finally {
    try {
      await pyodide.runPythonAsync([
        "import os, shutil",
        "for _continuum_path in ('/home/pyodide', '/tmp'):",
        "    for _continuum_name in os.listdir(_continuum_path):",
        "        _continuum_target = os.path.join(_continuum_path, _continuum_name)",
        "        try:",
        "            shutil.rmtree(_continuum_target) if os.path.isdir(_continuum_target) else os.remove(_continuum_target)",
        "        except OSError:",
        "            pass",
      ].join("\n"), { globals });
    } catch { /* the worker remains isolated; a failed cleanup is cleared when it is replaced */ }
    globals.destroy();
  }
}

let sqlPromise: ReturnType<typeof initSqlJs> | undefined;
function sqlRuntime() {
  sqlPromise ??= initSqlJs({ locateFile: () => "/runtime/sql-wasm.wasm" });
  return sqlPromise;
}

function normalizeSqlValue(value: unknown): string | number | null {
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  if (value instanceof Uint8Array) return `0x${Array.from(value).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  return String(value);
}

async function runSql(source: string): Promise<RunPiece> {
  let database: Database | undefined;
  try {
    const SQL = await sqlRuntime();
    database = new SQL.Database();
    const before = database.getRowsModified();
    const result = database.exec(source);
    const tables: SqlResultTable[] = result.map((table) => ({ columns: table.columns, rows: table.values.map((row) => row.map(normalizeSqlValue)) }));
    const rowsModified = Math.max(0, database.getRowsModified() - before);
    return { outcome: "success", stdout: renderSqlTables(tables), stderr: "", exitCode: 0, rowsModified, tables };
  } catch (error) {
    return { outcome: "runtime_error", stdout: "", stderr: capExecutionOutput(safeText(error)), exitCode: 1 };
  } finally {
    database?.close();
  }
}

async function runPiece(language: RunnableLanguage, source: string, stdin: string) {
  if (language === "python") return runPython(source, stdin);
  if (language === "sql") return runSql(source);
  return runJavaScript(source, stdin, language);
}

async function prepareRuntime(language: RunnableLanguage) {
  if (language === "python") await pythonRuntime();
  else if (language === "sql") await sqlRuntime();
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === "prewarm") {
    try {
      if (message.language === "python") status(message.id, "loading_python");
      else if (message.language === "sql") status(message.id, "loading_sql");
      await prepareRuntime(message.language);
      scope.postMessage({ type: "ready", id: message.id, language: message.language });
    } catch (error) {
      scope.postMessage({ type: "startup_error", id: message.id, error: capExecutionOutput(safeText(error)) });
    }
    return;
  }
  const request = message.request;
  const startedAt = performance.now();
  try {
    if (request.language === "python") status(request.id, "loading_python");
    else if (request.language === "sql") status(request.id, "loading_sql");
    await prepareRuntime(request.language);
    const readyAt = performance.now();
    status(request.id, "ready");
    status(request.id, "running");
    const main = await runPiece(request.language, request.source, request.stdin);
    const tests = [];
    if (main.outcome === "success" && request.tests.length) {
      status(request.id, "testing");
      for (const test of request.tests) {
        const testRun = await runPiece(request.language, request.source, test.stdin ?? "");
        const actual = request.language === "sql" ? renderSqlTables(testRun.tables) : testRun.stdout;
        tests.push(gradeExecutionTest(test, actual, testRun.outcome === "success" ? undefined : testRun.stderr));
      }
    }
    const result: ExecutionResult = {
      id: request.id,
      language: request.language,
      ...main,
      stdout: capExecutionOutput(main.stdout),
      stderr: capExecutionOutput(main.stderr),
      durationMs: Math.round(performance.now() - startedAt),
      startupDurationMs: Math.round(readyAt - startedAt),
      executionDurationMs: Math.round(performance.now() - readyAt),
      timeoutMs: request.timeoutMs,
      terminated: false,
      timedOut: false,
      tests,
    };
    scope.postMessage({ type: "result", id: request.id, result });
  } catch (error) {
    const result: ExecutionResult = {
      id: request.id,
      language: request.language,
      outcome: "provider_error",
      stdout: "",
      stderr: capExecutionOutput(safeText(error)),
      exitCode: 1,
      durationMs: Math.round(performance.now() - startedAt),
      timeoutMs: request.timeoutMs,
      terminated: false,
      timedOut: false,
      tests: [],
    };
    scope.postMessage({ type: "result", id: request.id, result });
  }
};

export {};
