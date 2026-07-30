# Continuum

Continuum is a user-owned academic memory, learning, research, and scheduling system that can be used from the standalone web app and from authorized AI assistants through MCP.

Its two product rules are:

1. One academic memory follows the user across the tools they already use.
2. Continuum recommends the resource most likely to improve the user’s outcome, even when that means leaving Continuum.

## Implemented product paths

- Persistent accounts with slow-hashed passwords or verified Google OpenID sign-in, durable provider identities, revocable opaque sessions, same-origin write protection, and PostgreSQL-backed rate limits.
- User-scoped goals, tasks, projects, learning states, research notes and decisions, source passages, claims, schedule blocks, resource activities, audit events, and compact outcome receipts.
- Token-efficient context assembly: structured current state plus hybrid semantic/lexical retrieval, ranking, a caller-selected token budget, provenance, and an access log. Raw transcripts are not copied into memory chunks.
- A remote Streamable HTTP MCP server with OAuth authorization code + PKCE, dynamic client registration, per-tool scopes, durable grants, token rotation, and immediate revocation checks.
- Fifteen outcome-shaped MCP tools, each named for a question a student would ask: find what I have, what am I working on, open this goal or project, read this passage, show the evidence behind this claim, what changed since last time, what do I know, what should I do next, start and record practice, save work, and propose a change. Every documented workflow completes in at most two calls. Accepting a decision, confirming a proposal, and committing a schedule stay app-only, because they are the user's actions.
- A reviewed resource registry and deterministic native-versus-external ranking policy. Recommendations include exact location, authority, access, time, focus, completion, alternatives, and a return-verification contract.
- A real external-resource lifecycle: save handoff, leave, record return, verify or hold for review, update mastery only from valid evidence, save an outcome receipt, and schedule a spaced follow-up.
- Deterministic plan generation and repair. Generated schedules become expiring proposals; explicit confirmation and commit are separate writes.
- Evidence-linked research retrieval over real user sources. Claims saved by assistants remain `unverified`; they may link only to exact user-owned passages.
- Private PDF/text ingestion with sanitization, stable chunks, content hashes, duplicate detection, optional private Blob originals, pgvector embeddings, lexical fallback, and source deletion from retrieval.
- A syllabus-aware Code Lab with disposable browser workers for real JavaScript, TypeScript, Python (Pyodide), and SQLite execution; stdout/stderr/exit/timeout/test reporting; persisted local sessions; and visibly separate streaming AI coaching. Java, C/C++, and Rust remain honestly editor-only.
- Featherless task-aware routing from the live plan/catalog with up to four server-side Featherless keys, health/backoff-aware least-busy selection, reviewed task fallbacks, Groq low-latency and reasoning routes, direct Gemini generation/embeddings with up to ten server-side keys, AI Gateway fallback, Featherless embeddings, and optional local Ollama.
- Real user connection flows for Claude remote MCP, encrypted paginated Zotero library indexing, NotebookLM source-pack handoff, Obsidian, and Ollama. Continuum’s own editable planner has no external-calendar dependency. Personal NotebookLM is correctly labeled as a handoff because it exposes no general account API.
- An optional Obsidian plugin. The user chooses one folder or explicitly opts into the whole vault; secrets use Obsidian SecretStorage, generated Continuum notes cannot overwrite ordinary notes, and original binaries require private Blob storage.

Zero-credential local mode uses an explicitly labeled in-memory development identity. The optional Maya database seed is a separate acceptance fixture. Ordinary persistent accounts never receive its goals or research data; they start with honest onboarding and user-owned records.

ChatGPT MCP is future scope. The endpoint is standards-based, but this repository currently exposes and documents Claude connection setup only and does not claim a tested ChatGPT product integration.

## Architecture

```text
apps/web                 Next.js app, accounts, API, OAuth, MCP, product UI
apps/obsidian-plugin     Optional local-vault connector
packages/db              Drizzle schema, migrations, user-scoped repository
packages/domain          Learning, memory, scheduler, resources, permissions
packages/retrieval       Sanitization, chunking, hashing, source retrieval
packages/ai              Model policy, Featherless, Gemini, embeddings
packages/mcp             Canonical tools, scopes, validation, resources
packages/schemas         Shared Zod contracts
tests                    Domain and contract acceptance tests
docs                     Operator, security, memory, MCP, and integration guides
```

See [architecture](docs/architecture.md), [code execution](docs/code-execution.md), [Learn](docs/learn-workspace.md), [Research](docs/research-workspace.md), [memory](docs/memory-architecture.md), [MCP context](docs/mcp-context.md), [resource broker](docs/resource-broker.md), and [security](docs/security.md).

## Local development

Requirements: Node.js 24+ and pnpm 11+.

For the isolated seeded workspace:

```bash
pnpm install
pnpm dev:seeded
```

For persistent accounts and cross-client state:

```bash
cp .env.example .env.local
# Add DATABASE_URL and server-only provider/configuration values.
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The dev server prints the URL it actually bound to — usually [http://localhost:3000](http://localhost:3000), but if that port is busy Next.js falls back automatically (e.g. `http://localhost:3001`), so use whichever URL the terminal reports. Never commit `.env.local`; it is ignored by Git.

Account passwords require a minimum of **6 characters** (client validation, server schema, and helper text share one policy in `apps/web/lib/password-policy.ts`).

## Demo account

For hackathon judges and local demos, a single disposable, fully populated demo account is available. From a clone with `.env.local` configured:

```bash
pnpm seed:demo            # create or reset the demo account + demonstration data
pnpm dev                  # start the app; open the URL the terminal prints
```

- **Username:** `demo`  ·  **Password:** `demo123`
- On the sign-in page, **“Try the demo”** logs in with one click (normal authentication — no bypass).
- The account is a lived-in Class 12 student workspace: SAT prep, a SQL/Python–MySQL unit, the **OASIS** cross-marker IHC research (with citable sources), and an exoplanet classifier.
- Seeding is **idempotent** and safe to re-run — it resets only the `demo` account to its canonical state and never touches other users. It is created **only** by this command, never by an ordinary request.

Full details, the reset guarantees, and a 2–4 minute walkthrough are in [docs/demo-account.md](docs/demo-account.md) and [docs/demo-walkthrough.md](docs/demo-walkthrough.md).

## Provider configuration

- Featherless: set exactly `FEATHERLESS_API_KEY_PRIMARY` and
  `FEATHERLESS_API_KEY_SECONDARY` in the server environment. Values never enter
  client configuration, payloads, HTML, logs, status responses, or source maps.
  The central gateway balances healthy slots, backs off rate-limited/provider-error
  slots, and performs at most one safe failover. Model overrides are optional;
  the router uses reviewed fallbacks when discovery is unavailable. The default
  embedding model is `Qwen/Qwen3-Embedding-8B` at 1,536 dimensions.
- Groq: set `GROQ_API_KEY`. The default policy uses Llama 3.1 8B Instant for bounded work, Qwen3.6 27B for reasoning, GPT-OSS 120B for code, and GPT-OSS 20B for verification, subject to the live models enabled for the Groq project.
- Gemini: set `GEMINI_API_KEY_1` through `GEMINI_API_KEY_10` or `GEMINI_API_KEYS`, then explicitly set `GEMINI_DATA_USE_ACKNOWLEDGED=true`. Keys are server-only and responses never expose them. Multiple keys in one Google Cloud project do not multiply project quota.
- Embeddings: keep `EMBEDDING_DIMENSIONS=1536`. Provider order may include Gemini, Featherless, AI Gateway, or Ollama. Lexical retrieval remains available if every embedding provider fails.
- Ollama: browser-local generation accepts only loopback endpoints by default. Server-side remote Ollama is rejected unless `ALLOW_REMOTE_OLLAMA=true` is deliberately set.

Structured (JSON-schema) generation is bounded by the central request deadline
(`AI_REQUEST_TIMEOUT_MS`, default 30 s). Policy chooses the lowest-cost qualified
model for each task; safe bounded requests may fail over once, while expensive
or high-stakes requests are never repeatedly retried.

Provider keys belong in an encrypted deployment secret store or the ignored local environment file. No system can make a key literally impossible to compromise; Continuum reduces exposure through server-only access, least privilege, no logging/display of values, rotation, and revocation.

The model layer is health-aware (`packages/ai/src/health.ts`), and every route,
fallback, timeout, quota, and unsupported category is documented in
[model routing](docs/model-routing.md). Prompt composition, trust boundaries,
schemas, and actual limitations are documented in
[prompt engineering](docs/prompt-engineering.md).

See [deployment and configuration](docs/deployment.md) and the [exact integration setup guide](docs/integrations.md). A full audit of performance, security, and feature verification is in [AUDIT_REPORT.md](AUDIT_REPORT.md).

## Claude MCP

The canonical endpoint is `https://<your-domain>/mcp` (`/api/mcp` remains a compatibility alias). Production requires HTTPS, `APP_BASE_URL`, `MCP_OAUTH_ISSUER_URL`, and a strong `MCP_JWT_SIGNING_SECRET`. Claude completes OAuth in the browser and receives only approved scopes. Connection status and revocation are visible under Connections.

The local development token path is disabled in production unless the operator explicitly overrides the safety flag. Do not use a shared static token in production.

See [Claude MCP setup and tool contract](docs/mcp-tools.md).

## Obsidian

Build the connector with:

```bash
pnpm --filter @continuum/obsidian-plugin build
```

Install `apps/obsidian-plugin/manifest.json`, `main.js`, and `versions.json` in the vault’s `.obsidian/plugins/continuum-sync/` directory. Create a one-time vault token from Continuum Integrations and paste it into the plugin. Whole-vault sync is opt-in, not the default.

See [Obsidian integration](docs/obsidian.md).

## Verification

```bash
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm build
pnpm --filter @continuum/obsidian-plugin build
```

Passing local checks does not configure external credentials, publish a production domain, or complete the final Claude account-side connector action. Those are deployment gates, not source-code claims.

The stable Playwright suite covers demo login; native Learn and a YouTube-provider contract result; deterministic browser code output; separated AI-feedback rendering; navigation persistence; Plan proposals; OpenAlex discovery normalization/save through a contract fixture; Memory context packs; a real OAuth+PKCE MCP read-after-write; and mobile navigation. Live external-provider credentials are checked separately so CI never disguises a fixture as a live provider call.

## Cost boundary

Continuum itself does not require an end-user subscription in this repository. Infrastructure and providers may still charge:

- Featherless Premium is a paid operator plan; the current documented plan includes four concurrency units, not four unlimited large-model requests.
- Gemini and hosted infrastructure have quotas and free-tier limits that can change.
- Ollama and Obsidian are local/free software paths, but use the user’s hardware and storage.
- Neon, Vercel, and Blob can exceed free allowances in real production use.

Continuum supports local fallbacks and operator-side provider health checks, but does not expose infrastructure details in the consumer Connections screen or label a hosted production deployment as universally free.

## License

MIT. See [THIRD_PARTY.md](THIRD_PARTY.md) for dependencies and content attribution.
