# Code execution

Status: JavaScript and SQL execution **browser- and Playwright-tested**; TypeScript
and Python runtime contracts **unit-tested**; the complete Code journey
**Playwright-tested**. Java, C, C++, and Rust are **unavailable for execution** and
deliberately labelled editor-only.

## Architecture

`browser-code-runner.ts` validates a bounded request and creates a disposable module
Web Worker. `code-execution.worker.ts` owns the runtime, captures stdout/stderr, runs
the main program and up to eight exact-output tests, and returns one typed result.
The UI terminates the worker on completion, Stop, failure, or the 0.5–12 second
wall-clock timeout. Nothing is sent to an AI model to produce program output.

| Language | Runtime | Actual behavior |
| --- | --- | --- |
| JavaScript | Worker `AsyncFunction` | Captured console/process shim, stdin helper, network globals blocked |
| TypeScript | TypeScript transpile + JS worker | Compile diagnostics first, then the same JS runtime |
| Python | locally served Pyodide WASM | stdin/stdout/stderr, fresh globals, selected network/process imports blocked |
| SQL | sql.js SQLite WASM | fresh in-memory DB per run, DDL/DML/query tables and row-change count |

Each result records outcome, stdout, stderr, exit code, duration, timeout state,
tables/rows for SQL, and test results. Output is capped at 64,000 characters; source
at 50,000; stdin at 20,000. Source, input, results, history, and AI attempts persist
in account-keyed browser local storage and survive navigation/refresh.

## AI boundary

Program Output/Tests and AI Feedback are distinct tabs. Feedback receives a bounded
copy of the exact runtime result only after the user submits. The centralized prompt
envelope treats source and runtime data as content, not instructions. An AI outage
cannot alter or erase deterministic output.

Security details and non-guarantees are in `security-code-execution.md`.
