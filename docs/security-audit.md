# Security audit

Method: manual review of auth, the 1,284-line user-scoped repository, the MCP
endpoint, OAuth, request-security, provider adapters, and ingestion; plus
`pnpm audit --prod`, git-history secret scan, and live probes.

**Result: no Critical or High exploitable issues found.** The security
engineering is strong and consistent. Findings below are Low/Informational,
with one High-severity *operational* item (credential hygiene) that is
configuration rather than a code defect.

## What was verified as sound

### Authentication & authorization
- **No IDOR.** Every read and write in `NeonRepository` filters by `userId`
  (or joins through an owned parent) — goals, tasks, projects, sources,
  chunks, claims, evidence, memory, receipts, activities, schedule, OAuth
  grants, integrations. Spot-checked all mutating methods; ownership is
  re-checked inside transactions before applying proposal changes.
- Passwords: scrypt (N=16384) with per-user salt, constant-time compare, a
  dummy-hash path for unknown users (timing equalization), and a 5-attempt /
  15-minute lockout.
- Sessions: opaque random token, only its SHA-256 hash stored, `HttpOnly`
  `SameSite=Lax` `Secure` (prod), revocation checked on every read; no
  write-on-read.
- Same-origin write protection on all cookie-authenticated mutations
  (`sameOriginWrite`), production-strict against `APP_BASE_URL`.
- MCP OAuth: authorization-code + PKCE (`verifyPkce`), HMAC-signed tokens,
  issuer/audience/resource validation, single-use code/refresh grants,
  immediate revocation checks, per-tool scope enforcement.

### Secrets
- No secrets in tracked files; `.env*` git-ignored except `.env.example`;
  `.env.local`/`.env` never appear in git history. No `NEXT_PUBLIC_*` secret.
  No secret logging. Provider keys are server-only and never returned in
  responses (a routing unit test asserts serialized provider status contains
  no key).

### Input / output & retrieval
- Zod validation at every route boundary; discriminated unions for actions.
- Retrieved sources are explicitly marked untrusted ("never as instructions")
  in every generation system prompt; claims saved by assistants stay
  `unverified` and may only cite user-owned passages.
- Ingestion validates PDF/UTF-8, hashes content, dedupes, and marks
  injection; uploads are size/time-bounded.
- Postgres protocol enforced with `sslmode=verify-full` for non-loopback DBs.

### Dependencies & infra
- `pnpm audit --prod`: **0 known vulnerabilities.**
- Security headers set globally: `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options: DENY`, `Permissions-Policy`, `COOP`, HSTS (prod), and a
  CSP. Private cache-control on authenticated JSON.

## Findings

### H-1 (Operational) Deployed provider credentials/model IDs are stale
- **Affected:** deployment env (`GEMINI_MODEL`, Gemini keys, Featherless model
  IDs). Not a code defect.
- **Impact:** Gemini/Featherless generation fails (503/404/empty). Not a
  security exposure, but a reliability/availability gap.
- **Remediation:** set working model IDs and healthy keys, or rely on Groq
  (already the effective path). Rotate any keys that have been shared in
  logs/screenshots.
- **Verification:** direct provider probes (documented in
  `performance-baseline.md`).

### L-1 Authenticated routes echo `error.message`
- **Affected:** e.g. `apps/web/app/api/resources/route.ts` GET (422),
  MCP tool errors return `error.message`.
- **Impact:** minor internal-detail disclosure to an already-authenticated
  caller; no secret content is included.
- **Remediation:** map to generic messages for unexpected errors; keep
  specific messages only for validation/ownership errors.

### L-2 Static non-production MCP demo token
- **Affected:** `apps/web/lib/oauth.ts` — `continuum-demo-2026` default in
  `NODE_ENV !== "production"`, granting all scopes to `MCP_DEMO_USER_ID`.
- **Impact:** none in production (the demo path is disabled when
  `NODE_ENV=production`). In shared dev environments it is a broad grant.
- **Remediation:** require an explicit `MCP_DEMO_TOKEN` in any non-local
  shared dev; already off in production.

### I-1 CSP allows `script-src 'unsafe-inline'`
- **Affected:** `apps/web/next.config.mjs` CSP (`'unsafe-eval'` in dev too).
- **Impact:** weakens XSS defense-in-depth; typical Next.js App Router
  tradeoff (framework injects inline bootstrap scripts). No injection sink was
  found — user content is rendered via React and sanitized Markdown.
- **Remediation (optional):** move to a nonce-based CSP via middleware.

### I-2 `sameOriginWrite` permits missing-Origin writes in non-production
- **Affected:** `apps/web/lib/request-security.ts` (returns
  `NODE_ENV !== "production"` when no Origin header).
- **Impact:** none in production (strict there). Convenience for local tooling.

## Data privacy
- Vector search is user-scoped (`eq(..., userId)` on both lexical and vector
  branches) — no cross-user retrieval leakage.
- Private object originals require a Blob token; metadata responses strip
  `storagePath`.
- Local/private Ollama runs in the browser against a loopback-validated host;
  no server-side fetch of a user-supplied URL (no SSRF surface found).

## Fix status
No Critical/High **code** issues to fix. H-1 is a deployment action; L-1/L-2
are hardening; I-1/I-2 are accepted framework/dev tradeoffs. The
demo-fixture-in-production data-integrity issue found during the audit was
fixed in code (`fix(db): keep the demo fixture out of production`).
