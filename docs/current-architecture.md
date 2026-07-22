# Current architecture (as audited 2026-07-21)

## Stack

| Concern | Choice |
|---|---|
| Monorepo | pnpm 11 workspaces + Turborepo |
| Runtime | Node.js ≥ 24 (dev machine ran Node 26) |
| Web framework | Next.js 15.5 (App Router), React 19 |
| Styling | Tailwind 3 + hand-written `globals.css` (no heavy UI kit) |
| Database | PostgreSQL (Neon) via Drizzle ORM + `pg` pool |
| Vectors | pgvector, 1536-dim, HNSW cosine indexes |
| Auth (app) | scrypt password + Google OpenID; opaque revocable DB sessions |
| Auth (MCP) | OAuth 2.1 authorization-code + PKCE, HMAC-signed tokens, per-tool scopes |
| MCP transport | `@modelcontextprotocol/sdk` Streamable HTTP (stateless per request) |
| Models | Groq, Featherless, Gemini (direct), AI Gateway (opt-in), Ollama (browser-loopback) |
| AI SDK | Vercel `ai` v6 + `@ai-sdk/openai-compatible`, `@ai-sdk/google` |
| Blob | `@vercel/blob` (optional private originals) |
| Deploy | Vercel (`output: "standalone"`) |

## Package layout

```
apps/web                 Next.js app: routes, API, OAuth, MCP endpoint, product UI
apps/obsidian-plugin     Optional local-vault connector (esbuild bundle)
packages/db              Drizzle schema, migrations, NeonRepository (user-scoped)
packages/domain          Learning mastery, scheduler, resource ranking, permissions
packages/retrieval       Sanitization, chunking, content hashing, source retrieval
packages/ai              Route policy, provider adapters, structured/stream generation, embeddings
packages/mcp             Canonical tool contract, scopes, validation, resources
packages/schemas         Shared Zod contracts
tests                    Vitest domain + contract tests (17 files, 89 tests)
```

## Request/state model

- **Standalone app.** Each route (`/`, `/goals`, `/learn`, `/code`,
  `/research`, `/memory`, `/activity`, `/integrations`) is `force-dynamic`
  and server-renders `ContinuumApp` with a per-view snapshot from
  `getStore(user.id).workspace(view)`. **After this audit, in-app navigation
  is client-side** (per-view cache + background `/api/state` refresh); SSR
  remains for initial load, deep links, and no-JS.
- **API.** `apps/web/app/api/*` route handlers (Node runtime) authenticate
  via session cookie (`getRequestUser`), enforce same-origin on writes and
  per-namespace rate limits (Postgres bucket), then call the shared store.
- **MCP.** `/mcp` (alias `/api/mcp`) authenticates a bearer token
  (`authorizedMcpIdentity`), filters tools by granted scope, and executes
  against the **same** `getStore(userId)` — this is what makes app ⇄ MCP
  state shared.

## The Store abstraction (the continuity seam)

`apps/web/lib/store.ts` defines one `Store` interface with two
implementations selected by `process.env.DATABASE_URL`:

- `NeonStore` → `NeonRepository` (real Postgres). Used whenever
  `DATABASE_URL` is set (dev with a URL, and production).
- `MemoryStore` → in-process singleton `demoStore`. Used only for
  zero-credential local mode.

Both the app API and the MCP endpoint obtain a store via `getStore(userId)`,
so a write through one surface is a read through the other. Verified live in
both directions (see `docs/mcp-verification.md`).

## Data model (Drizzle, `packages/db/src/schema.ts`)

~40 tables, all user-scoped, with the indexes that matter already present:
`users/profiles/credentials/auth_identities/app_sessions`, `goals/tasks/
milestones/task_dependencies`, `projects/project_decisions/sources/
source_chunks(+HNSW)/papers/research_notes/research_claims/claim_evidence/
artifacts`, `concepts/curricula/curriculum_nodes/learning_states/assessments/
assessment_attempts/misconceptions`, `memory_events/memory_records/
memory_chunks(+HNSW)/entity_summaries/session_receipts/memory_proposals/
context_access_log`, `resource_registry/resource_activities`, `model_routes/
model_usage/audit_log`, `oauth_clients/tokens/grants`, `integration_tokens/
integrations/synced_documents/calendar_constraints/rate_limit_buckets`.

Snapshot reads (`getWorkspaceSnapshot`, `getStateSnapshot`, `getProject`,
`getGoal`) already fan their queries out with `Promise.all` — there is no
N+1 in the hot read paths.

## Notable design facts found during the audit

- Workspace snapshots are computed per view (only the tables a screen needs)
  and run in parallel — good.
- `ensureDemoSeed()` used to run in the hot path on cold start; now gated
  (dev-only by default).
- Model routing is policy-driven (`packages/ai/src/policy.ts`) with a
  deterministic route for scheduling and an independent-verifier path for
  high-stakes claims.
- Provider **model IDs in the environment are forward-dated** and several are
  not actually available on the current accounts (see the performance and
  audit reports); Groq carries the working model layer.
