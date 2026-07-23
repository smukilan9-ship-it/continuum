import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EDITOR_ONLY_LANGUAGES,
  EXECUTION_LIMITS,
  capExecutionOutput,
  emptyExecutionResult,
  gradeExecutionTest,
  normalizeRunnableLanguage,
  normalizedOutput,
  renderSqlTables,
  validateExecutionRequest,
  type ExecutionRequest,
} from "../apps/web/lib/code-execution";

const request = (patch: Partial<ExecutionRequest> = {}): ExecutionRequest => ({
  id: "run_1",
  language: "javascript",
  source: "console.log(input())",
  stdin: "42",
  timeoutMs: 5_000,
  tests: [],
  ...patch,
});

describe("browser code execution contract", () => {
  it("normalizes only genuinely runnable languages", () => {
    expect(normalizeRunnableLanguage("JS")).toBe("javascript");
    expect(normalizeRunnableLanguage("sqlite")).toBe("sql");
    expect(normalizeRunnableLanguage("Rust")).toBeUndefined();
    expect(EDITOR_ONLY_LANGUAGES).toEqual(["Java", "C", "C++", "Rust"]);
  });

  it("accepts bounded source, stdin, timeout, and tests", () => {
    expect(validateExecutionRequest(request({ tests: [{ id: "t", name: "stdin", stdin: "9", expectedOutput: "9" }] }))).toBeUndefined();
  });

  it("rejects blank and oversized source before a worker starts", () => {
    expect(validateExecutionRequest(request({ source: " " }))).toMatch(/Write some code/);
    expect(validateExecutionRequest(request({ source: "x".repeat(EXECUTION_LIMITS.maxSourceCharacters + 1) }))).toMatch(/limited/);
  });

  it("rejects oversized stdin and an excessive test set", () => {
    expect(validateExecutionRequest(request({ stdin: "x".repeat(EXECUTION_LIMITS.maxStdinCharacters + 1) }))).toMatch(/Input is limited/);
    expect(validateExecutionRequest(request({ tests: Array.from({ length: EXECUTION_LIMITS.maxTests + 1 }, (_, index) => ({ id: String(index), name: "test", expectedOutput: "" })) }))).toMatch(/at most/);
  });

  it("rejects timeouts outside the hard wall-clock range", () => {
    expect(validateExecutionRequest(request({ timeoutMs: 1 }))).toMatch(/timeout/);
    expect(validateExecutionRequest(request({ timeoutMs: EXECUTION_LIMITS.maxTimeoutMs + 1 }))).toMatch(/timeout/);
  });

  it("blocks JavaScript and TypeScript dynamic imports", () => {
    expect(validateExecutionRequest(request({ source: "await import('https://example.com/x.js')" }))).toMatch(/Dynamic imports/);
    expect(validateExecutionRequest(request({ language: "typescript", source: "import('x')" }))).toMatch(/Dynamic imports/);
  });

  it("caps stdout/stderr without losing the bounded prefix", () => {
    const long = "x".repeat(EXECUTION_LIMITS.maxOutputCharacters + 50);
    expect(capExecutionOutput(long)).toHaveLength(EXECUTION_LIMITS.maxOutputCharacters + "\n… output truncated at 64,000 characters".length);
    expect(capExecutionOutput(long)).toMatch(/output truncated/);
  });

  it("grades actual output exactly after line-ending normalization", () => {
    const test = { id: "t", name: "stdin echo", stdin: "42", expectedOutput: "answer: 42\n" };
    expect(gradeExecutionTest(test, "answer: 42\r\n").passed).toBe(true);
    expect(gradeExecutionTest(test, "answer: 41\n").passed).toBe(false);
    expect(gradeExecutionTest(test, "", "runtime failed")).toMatchObject({ passed: false, error: "runtime failed" });
    expect(normalizedOutput("a\r\n")).toBe("a");
  });

  it("renders deterministic SQLite tables including NULL", () => {
    expect(renderSqlTables([{ columns: ["name", "score"], rows: [["Asha", 91], ["Missing", null]] }])).toBe("name | score\nAsha | 91\nMissing | NULL");
  });

  it("represents timeout, stop, and provider failure without invented output", () => {
    expect(emptyExecutionResult(request(), "timeout", "hard timeout", 5_001)).toMatchObject({ outcome: "timeout", stdout: "", stderr: "hard timeout", exitCode: 1, timedOut: true });
    expect(emptyExecutionResult(request(), "stopped", "stopped", 25)).toMatchObject({ outcome: "stopped", exitCode: null, timedOut: false });
    expect(emptyExecutionResult(request(), "provider_error", "runtime unavailable", 2)).toMatchObject({ outcome: "provider_error", stdout: "", exitCode: 1 });
  });

  it("keeps network and process APIs blocked in the worker implementation", () => {
    const source = readFileSync(new URL("../apps/web/lib/code-execution.worker.ts", import.meta.url), "utf8");
    for (const blocked of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "WebTransport", "importScripts", "Worker", "SharedWorker", "indexedDB", "caches"]) expect(source).toContain(blocked);
    for (const blockedImport of ["'socket'", "'urllib'", "'http'", "'subprocess'", "'micropip'"]) expect(source).toContain(blockedImport);
    expect(source).toContain("env: Object.freeze({})");
    expect(source).not.toContain("AsyncFunction");
  });

  it("loads Python and SQLite WASM only from same-origin runtime paths", () => {
    const source = readFileSync(new URL("../apps/web/lib/code-execution.worker.ts", import.meta.url), "utf8");
    expect(source).toContain('"/runtime/pyodide/pyodide.mjs"');
    expect(source).toContain('"/runtime/sql-wasm.wasm"');
    expect(source).not.toContain("cdn.jsdelivr.net");
  });
});
