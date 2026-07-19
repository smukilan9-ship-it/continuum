# Security and privacy

This document describes controls implemented in the repository. It is not a claim that an unconfigured deployment has completed a security review, penetration test, backup exercise, or incident-response drill.

## Secrets

- Database, Blob, model-provider, OAuth signing, and integration credentials are server-only.
- `.env.local` and all `.env*` files are ignored except the value-free `.env.example`.
- API responses expose provider presence and key counts, never values.
- User provider keys are not stored in the database. Adding BYOK later requires a managed KMS/envelope-encryption design; plain application encryption is not an acceptable substitute.
- Production environment validation requires HTTPS origin configuration, database state, a strong MCP signing secret, a session privacy salt, at least one model provider, and a 1536-dimensional embedding path.
- Local Ollama URLs are restricted to loopback unless an operator explicitly enables remote access.

No design makes credentials impossible to compromise. Use least-privilege keys, encrypted environment storage, separate development/production projects, rotation, revocation, usage alerts, and provider budgets.

## Accounts and sessions

- Passwords use Node `scrypt` with per-user random salts.
- Session tokens contain 256 bits of randomness; only their SHA-256 hashes are stored.
- Cookies are HttpOnly, SameSite=Lax, path-scoped, and Secure in production.
- Login failures are counted and can trigger a temporary lock.
- Registration, login, AI, MCP, and other sensitive routes use PostgreSQL-backed rate limits where appropriate.
- Public registration is closed by default in production until the operator explicitly enables it with an account-verification and recovery process.
- Browser writes require the request origin to match the application origin in production.
- Return paths reject protocol-relative and backslash-based redirects.

## User isolation

Application and MCP handlers create a Store bound to the authenticated user ID. Repository reads include ownership filters. Writes separately validate supplied goal, project, task, source, passage, receipt, resource-activity, schedule, and supersession references before mutation. Private Blob paths include user ownership, while retrieval always joins passages through a user-owned source.

Automated checks cannot prove absence of every authorization bug. Before public release, add tenant-isolation integration tests against a disposable database and an independent security review.

## MCP authorization

- Authorization code flow requires PKCE S256 and exact registered redirect matching.
- Access tokens are short-lived; refresh tokens rotate.
- Only token hashes/grants needed for revocation are durable.
- Tokens bind issuer, audience, subject, client ID, scopes, type, expiry, and unique ID.
- Tools outside granted scopes are not registered for that connection.
- OAuth authorization requires a signed-in Continuum user.
- Grant revocation is checked before tool execution.
- The development token path is disabled whenever `NODE_ENV=production`; setting `MCP_DEMO_TOKEN` does not re-enable it.
- Goal/project/task/schedule assistant changes use expiring proposals.
- Confirmation timestamps must be fresh. Schedule confirmation and schedule commit remain separate operations/scopes.

Dynamic client registration is signed and stateless. OAuth authorization and token exchange verify the registration signature, exact client and redirect, PKCE challenge, and one-time authorization-code state.

## Source and model safety

- Upload and Obsidian sync limit file size, indexed character count, accepted formats, filename/path length, and parsing behavior before embedding work begins.
- Vault paths are normalized and reject absolute paths, traversal components, nulls, and empty segments.
- Source text is normalized and prompt-injection patterns are marked before retrieval.
- Retrieved documents are treated as untrusted evidence, not instructions.
- Tool names are allowlisted and arguments are Zod-validated.
- Structured model outputs must pass schema validation.
- Source-locked retrieval refuses unsupported answers.
- Deleted or superseded sources/chunks are excluded.
- Assistant research claims stay unverified and can link only to exact accessible passages.

## Data minimization

Memory chunks deliberately exclude fields named `rawConversation`, `transcript`, and `fullText`; only bounded durable meaning is embedded. `load_context` returns current structured state and relevant memories within a requested budget. Context-access logs record selected record IDs and estimated tokens for accountability.

Obsidian whole-vault sync is explicit opt-in. Folder-only and manual sync are the defaults. Generated Continuum files have a frontmatter marker and the plugin refuses to overwrite ordinary notes.

## Operational requirements before public launch

- Managed database backups and a tested restore procedure.
- Secret rotation and incident-response runbooks.
- CSP review with nonces if stricter script/style policy is required.
- Dependency and container/function vulnerability scanning.
- Audit-log retention, export, deletion, and legal privacy policy decisions.
- Abuse controls and per-user/provider budgets sized for the deployment.
- Data-processing and provider-retention review for the intended student population and jurisdictions.
- External penetration test and authorization/tenant-isolation test suite.
