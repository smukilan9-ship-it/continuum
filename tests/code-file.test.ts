import { describe, expect, it } from "vitest";
import {
  CODE_FILE_LIMIT_BYTES,
  safeSourceFileName,
  validateCodeFile,
  validateCodeSourceText,
} from "../apps/web/lib/code-file";

describe("local source-file workflow", () => {
  it("accepts supported source files without executing them", () => {
    expect(validateCodeFile({ name: "hello.py", size: 24, type: "text/x-python" })).toEqual({
      ok: true,
      name: "hello.py",
      size: 24,
      language: "python",
      runnable: true,
    });
    expect(validateCodeFile({ name: "app.ts", size: 30, type: "text/plain" })).toMatchObject({ ok: true, language: "typescript", runnable: true });
    expect(validateCodeFile({ name: "app.js", size: 30, type: "text/plain" })).toMatchObject({ ok: true, language: "javascript", runnable: true });
    expect(validateCodeFile({ name: "query.sql", size: 30, type: "text/plain" })).toMatchObject({ ok: true, language: "sql", runnable: true });
    expect(validateCodeFile({ name: "Main.java", size: 30, type: "text/plain" })).toMatchObject({ ok: true, language: "java", runnable: false });
    expect(validateCodeFile({ name: "main.c", size: 30, type: "text/plain" })).toMatchObject({ ok: true, language: "c", runnable: false });
    expect(validateCodeFile({ name: "main.cpp", size: 30, type: "text/plain" })).toMatchObject({ ok: true, language: "c++", runnable: false });
    expect(validateCodeFile({ name: "main.rs", size: 30, type: "text/plain" })).toMatchObject({ ok: true, language: "rust", runnable: false });
  });

  it("rejects the wrong extension, an empty file, an oversized file, and a binary MIME type", () => {
    expect(validateCodeFile({ name: "hello.txt", size: 24, type: "text/plain" })).toMatchObject({ ok: false, error: expect.stringMatching(/Python.*Rust/i) });
    expect(validateCodeFile({ name: "empty.py", size: 0, type: "text/plain" })).toMatchObject({ ok: false, error: expect.stringMatching(/empty/i) });
    expect(validateCodeFile({ name: "large.py", size: CODE_FILE_LIMIT_BYTES + 1, type: "text/plain" })).toMatchObject({ ok: false, error: expect.stringMatching(/1 MB/i) });
    expect(validateCodeFile({ name: "binary.py", size: 24, type: "image/png" })).toMatchObject({ ok: false, error: expect.stringMatching(/plain-text/i) });
    expect(validateCodeFile({ name: "browser-upload.py", size: 24, type: "application/octet-stream" })).toMatchObject({ ok: true });
    expect(validateCodeSourceText("\0binary")).toMatch(/not valid UTF-8/i);
    expect(validateCodeSourceText(" \n")).toMatch(/no source code/i);
  });

  it("creates a safe download name while preserving supported extensions", () => {
    expect(safeSourceFileName("../../My assignment.py", "py")).toBe("My_assignment.py");
    expect(safeSourceFileName("", "py")).toBe("continuum_program.py");
    expect(safeSourceFileName("analysis.PY", "py")).toBe("analysis.py");
    expect(safeSourceFileName("project.ts", "txt")).toBe("project.ts");
  });
});
