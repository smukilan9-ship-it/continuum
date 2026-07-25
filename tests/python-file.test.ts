import { describe, expect, it } from "vitest";
import {
  PYTHON_FILE_LIMIT_BYTES,
  safePythonFileName,
  validatePythonFile,
  validatePythonSourceText,
} from "../apps/web/lib/python-file";

describe("local Python file workflow", () => {
  it("accepts a bounded plain-text .py file without executing it", () => {
    expect(validatePythonFile({ name: "hello.py", size: 24, type: "text/x-python" })).toEqual({
      ok: true,
      name: "hello.py",
      size: 24,
    });
  });

  it("rejects the wrong extension, an empty file, an oversized file, and a binary MIME type", () => {
    expect(validatePythonFile({ name: "hello.txt", size: 24, type: "text/plain" })).toMatchObject({ ok: false, error: expect.stringMatching(/ending in \.py/i) });
    expect(validatePythonFile({ name: "empty.py", size: 0, type: "text/plain" })).toMatchObject({ ok: false, error: expect.stringMatching(/empty/i) });
    expect(validatePythonFile({ name: "large.py", size: PYTHON_FILE_LIMIT_BYTES + 1, type: "text/plain" })).toMatchObject({ ok: false, error: expect.stringMatching(/256 KB/i) });
    expect(validatePythonFile({ name: "binary.py", size: 24, type: "image/png" })).toMatchObject({ ok: false, error: expect.stringMatching(/plain-text/i) });
    expect(validatePythonFile({ name: "browser-upload.py", size: 24, type: "application/octet-stream" })).toMatchObject({ ok: true });
    expect(validatePythonSourceText("\0binary")).toMatch(/not valid UTF-8/i);
    expect(validatePythonSourceText(" \n")).toMatch(/no Python code/i);
  });

  it("creates a safe download name without changing the Python extension contract", () => {
    expect(safePythonFileName("../../My assignment.py")).toBe("My_assignment.py");
    expect(safePythonFileName("")).toBe("continuum_program.py");
    expect(safePythonFileName("analysis.PY")).toBe("analysis.py");
  });
});
