import { describe, expect, it } from "vitest";
import { cleanRuntimeMessage, errorLineFrom } from "../apps/web/components/workspace/code-screen";

describe("runtime error presentation", () => {
  it("strips the bundle URL a browser runtime appends to SQLite errors", () => {
    const raw = 'Error: near "while": syntax error at a.handleError (https://continuumstudy.vercel.app/_next/static/chunks/6796.a0af92c80.js:1:2)';
    expect(cleanRuntimeMessage(raw)).toBe('Error: near "while": syntax error');
    expect(cleanRuntimeMessage(raw)).not.toContain("_next");
  });

  it("drops JS stack frames while keeping the message", () => {
    const raw = "TypeError: x is not a function\n    at run (eval:3:9)\n    at Module._compile (node:internal/modules:1:1)";
    expect(cleanRuntimeMessage(raw)).toBe("TypeError: x is not a function");
  });

  it("leaves a clean Python traceback intact", () => {
    const raw = 'Traceback (most recent call last):\n  File "main.py", line 2, in <module>\nIndexError: list index out of range';
    expect(cleanRuntimeMessage(raw)).toContain("IndexError: list index out of range");
    expect(cleanRuntimeMessage(raw)).toContain("line 2");
  });
});

describe("go-to-line parsing", () => {
  it("reads a Python traceback line", () => {
    expect(errorLineFrom("python", 'File "main.py", line 2, in <module>\nIndexError', "")).toBe(2);
  });

  it("reads a JavaScript position", () => {
    expect(errorLineFrom("javascript", "at eval (eval at run:4:11)", "")).toBe(4);
  });

  it("locates the offending SQL statement from the reported token", () => {
    const source = "CREATE TABLE t (id INTEGER);\nwhile True:\n    pass";
    expect(errorLineFrom("sql", 'near "while": syntax error', source)).toBe(2);
  });

  it("returns 0 when there is nothing to jump to", () => {
    expect(errorLineFrom("sql", "database is locked", "SELECT 1;")).toBe(0);
  });
});
