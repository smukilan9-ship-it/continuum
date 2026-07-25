# Code execution

Status: Java, C, C++, and Rust are unavailable for execution and deliberately
labelled editor-only. Exact verification results for this revision belong in the
release report; this document describes the implementation.

## Architecture

`browser-code-runner.ts` validates a bounded request and maintains one warm worker
per runnable language. Python and SQL can pre-load while the learner edits, so a
normal Run does not download and initialize the runtime again. A completed worker
is reused; Stop, timeout, startup failure, or a worker crash terminates and discards
it. `code-execution.worker.ts` captures stdout/stderr and returns one typed result.
Tests run only after the separate **Run tests** action. Nothing is sent to an AI
model to produce program output.

| Language | Runtime | Actual behavior |
| --- | --- | --- |
| JavaScript | Worker `AsyncFunction` | Captured console/process shim, stdin helper, network globals blocked |
| TypeScript | TypeScript transpile + JS worker | Compile diagnostics first, then the same JS runtime |
| Python | locally served Pyodide WASM | stdin/stdout/stderr, fresh globals, blocked network/process/package imports, temporary files scrubbed before/after each run |
| SQL | sql.js SQLite WASM | fresh in-memory DB per run, DDL/DML/query tables and row-change count |

Language setup has a separate 45-second startup ceiling. User code uses a
learner-selected 3-, 10-, or 30-second limit that begins only after the runtime
is ready. Each result records outcome, stdout, stderr, exit code, setup/execution
duration, selected timeout, termination state,
tables/rows for SQL, and test results. Output is capped at 64,000 characters; source
at 50,000; stdin at 20,000. Source, input, results, history, and AI attempts persist
in account-keyed browser local storage and survive navigation/refresh.

## AI boundary

Program Output/Tests and AI Feedback are distinct tabs. Feedback receives a bounded
copy of the exact runtime result only after the user submits. The centralized prompt
envelope treats source and runtime data as content, not instructions. An AI outage
cannot alter or erase deterministic output.

## Security boundary and limitations

Execution is browser-side, not a server process or cloud container. The worker
cannot receive server environment variables, database credentials, source-tree
access, other users' files, authentication tokens, private network access, or
cloud metadata. JavaScript network/storage/worker APIs are replaced or removed.
Python blocks `js`, `pyodide`, `micropip`, socket/HTTP/process/concurrency imports;
package installation is not available. SQL uses a new in-memory database per run.
Source, input, and output sizes are capped. A hard timeout terminates the worker,
which is the reliable interruption boundary for an infinite loop.

This is an educational browser sandbox, not a formally verified hostile-code
isolation product. Browser engine or WebAssembly vulnerabilities remain outside
the application's boundary. Memory/CPU are bounded primarily by the browser
worker and wall-clock termination; there is no cross-browser byte-exact heap quota.
Do not use this runner for secrets or untrusted production workloads.
