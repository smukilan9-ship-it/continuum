# Code execution security

Status: controls **unit-tested** and JavaScript path **browser/Playwright-tested**.
This is a learner sandbox, not a hardened hostile multi-tenant compute boundary.

## Implemented controls

- Execution stays in a disposable browser Web Worker; no submitted program runs on
  the Continuum server and no server secret is available to it.
- The runner validates language, source/input size, test count, and timeout before
  creating the worker; the worker is terminated on result, Stop, error, or timeout.
- JavaScript/TypeScript replace `fetch`, XHR, WebSocket, EventSource, WebTransport,
  `importScripts`, IndexedDB, and Cache Storage; dynamic `import()` is rejected.
- The process shim has an empty frozen environment. Captured output is length-capped.
- Python is served locally, uses fresh globals, and blocks `js`, `pyodide`, `micropip`,
  socket/HTTP/process/concurrency imports. Its virtual filesystem is noncanonical and
  discarded with the runtime lifecycle.
- SQL creates a new in-memory SQLite database per execution and closes it afterward.
- AI feedback is a separate authenticated server call over a bounded snapshot. AI
  text is never inserted into stdout/stderr or treated as execution evidence.

## Limits and operational guidance

Browser globals are defense-in-depth, not a formal VM escape guarantee. A malicious
program may still consume CPU until termination or exploit an upstream browser/WASM
bug. Do not add server-side execution, arbitrary package installation, persistent
filesystem mounts, browser credentials, or network access without a separately
hardened isolation service, resource quotas, egress policy, and security review.

The CSP and locally served WASM assets must remain compatible with workers while
preventing arbitrary remote code. Dependency and secret scans are release gates.
