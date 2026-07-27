# Continuum production-readiness security audit

Date: 2026-07-23
Branch: `feat/product-ready-premium-rebuild`
Scope: application code and dependencies, authentication/session behavior,
cookie-authenticated APIs, Postgres tenant boundaries, credential storage,
provider fetches, imported content, browser code execution, OAuth/MCP, local
connectors, Vercel Preview configuration, and full Git history secret patterns.

## Result

**No known Critical or High-severity vulnerabilities were found within the
tested scope after remediation.** This is not a claim that the product has no
security threats, and it is not a substitute for an independent penetration
test.

The audit initially found five High dependency advisories. Next.js was upgraded
to 15.5.21 and Sharp/`fast-uri` were pinned to patched releases. A newly
disclosed Moderate Hono adapter advisory was also remediated. The final
`pnpm audit --prod` result is `No known vulnerabilities found`.

## Evidence and controls

### Authentication and sessions

- Passwords use Node scrypt with per-user random salt. Unknown/locked users
  still execute a dummy hash; comparison is constant-time.
- Login failures are persisted and lock after five attempts for 15 minutes.
- Sessions are 256-bit opaque random values. Only SHA-256 hashes are stored;
  expiry and revocation are checked on every lookup.
- The session cookie is host-only, `Path=/`, `HttpOnly`, `SameSite=Lax`,
  `Priority=High`, and `Secure` in production. Logout revokes the record and
  expires the cookie.
- Authenticated mutations require exact request-origin or configured
  canonical-origin validation. Unsafe return paths reject scheme-relative and
  backslash forms.
- Google sign-in uses state and PKCE with an exact callback. MCP OAuth uses
  authorization code + PKCE, single-use grants, audience/resource validation,
  scopes, and revocation.

### Authorization and data isolation

- Repository reads/writes are user-scoped directly or by ownership through a
  parent object. MCP tools receive the bound OAuth user, not caller-supplied
  tenant identity.
- Retrieval/vector queries are user-scoped; provider credential lookup binds
  `(userId, provider)`.
- The research discovery cache now includes the authenticated user ID. This
  closed a cross-user cache/provider-state isolation gap found during review.
- The Preview branch uses the separate
  `continuum_preview_product_ready` database and branch-scoped DB URLs.
  Production database variables were not modified.

### Provider credentials

- OpenAlex, YouTube, and Featherless use fixed official
  provider origins and server-side health checks.
- First save requires authentication and HTTPS. Replacement/deletion require
  the current Continuum password; writes are same-origin and rate-limited.
- Credentials use AES-256-GCM with a random nonce/authentication tag and a
  versioned key lookup. Old envelope versions remain readable; new writes and
  periodic use reseal under the current version.
- Status, masked suffix, validation time, and last-use time live inside the
  authenticated encrypted envelope. No rollout migration is required and no
  plaintext secret is returned after save.
- Audit/memory events contain provider/status/version metadata only. Full keys
  are excluded from prompts, analytics, status responses, and application logs.
- Preview has an independent branch-scoped envelope key.

### Provider and imported-content boundaries

- Provider URLs are constructed from constants; user input becomes query
  parameters, not origins. Ollama accepts only loopback hosts in the browser.
- Research discovery uses OpenAlex as its primary scholarly metadata API and
  Crossref as a DOI-focused secondary source.
- PDF/text ingestion is size/time/type bounded, hashed, deduplicated, and
  user-scoped. Retrieved text is explicitly delimited as untrusted source data
  in generation policy.
- React renders text/error output without raw HTML insertion. Security headers
  include CSP, `nosniff`, frame denial, restricted permissions, COOP, strict
  referrer policy, and production HSTS.

### Code execution

- JavaScript/TypeScript, Python/Pyodide, and SQLite execute in disposable
  browser Web Workers/WASM—not in a server shell.
- Source, stdin, tests, timeout, and output are bounded. Workers terminate on
  completion, stop, error, or hard timeout.
- Network/browser storage/process APIs and dynamic imports are blocked; Python
  network/process/package-manager imports are restricted. Runtime assets are
  same-origin. SQLite creates a fresh in-memory database per run.
- AI feedback is an authenticated, bounded secondary request and is never
  represented as execution output.

### MCP and local tools

- MCP registers tools only after scope filtering; consequential changes remain
  proposals/confirmation operations. Per-user/client limits and audit records
  apply.
- Obsidian pairing tokens are one-time display/hashed at rest; sync is
  selected-folder and ordinary notes are not overwritten. The plugin uses
  Obsidian SecretStorage.
- NotebookLM consumer support is a deliberate export/query/citation handoff;
  no Google cookies or session tokens are uploaded to Continuum.

## Findings by severity

| Severity | Open | Fixed in this pass |
|---|---:|---:|
| Critical | 0 | 0 |
| High | 0 | 5 dependency advisories |
| Medium | 1 accepted product limitation | cross-user cache key; same-origin Preview mismatch; Hono advisory |
| Low | 2 defense-in-depth items | dark-surface disclosure; generic provider error handling |
| Informational | 3 | environment inventory and rollout notes |

The open Medium limitation is Google-only account reauthentication for
credential replacement/deletion; password accounts are protected now and the
UI does not weaken the rule. Low/Informational items include nonce-based CSP
work and the need for independent/desktop verification.

## Tool results

- `pnpm audit --prod`: no known vulnerabilities after upgrades.
- Full-history targeted secret-pattern scan: no matches.
- Credential, request-security, password, OAuth, code-execution, retrieval,
  source, MCP, and routing tests are part of the full Vitest suite.
- Typecheck, lint, build, Playwright, visual matrix, and deployed probes are
  release gates; their final status belongs in the delivery report and must not
  be inferred from this document.

See `security-threat-model.md`, `security-remediation.md`, and
`security-code-execution.md` for boundaries, remediation IDs, and sandbox
non-guarantees.

## 2026-07-26 delta

- Added user-scoped encrypted BYOK for Featherless, Groq, and Gemini. Keys are
  validated only against fixed official origins and loaded into a
  request-local provider environment.
- Removed answer keys from initial Learn snapshots and all practice responses.
  Keys are returned only after the owned answer is submitted.
- Provider isolation now clears every non-allowed key before an independent
  verifier call; router fallback cannot collapse Model A and Model B onto the
  same provider.
- TXT/PDF/DOCX ingestion validates extension, MIME/content signatures, size,
  and treats extracted document instructions as untrusted. DOCX extraction uses
  `mammoth` server-side.
- Assistant session/message reads and writes are user-scoped; durable memory is
  a separate, reviewable action and can be edited, excluded, or deleted.
- Tracked-code secret-pattern scan found zero credential/private-key patterns;
  `.env.local` is ignored and only `.env.example` is tracked.
- `pnpm audit` could not be used for the final delta because the registry audit
  endpoint returned a gzip body as invalid JSON twice. As an independent
  release check, all 427 packages in the installed web production dependency
  closure were queried against OSV; zero advisories were returned. This does
  not cover development-only packages.
