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
- Twenty-nine canonical actions for context, projects, goals, learning, research evidence, schedule, resources, safe proposals, session synchronization, artifacts, and specialist routing. Twenty-seven are remotely available; approval and accepted-decision writes stay app-only.
- A reviewed resource registry and deterministic native-versus-external ranking policy. Recommendations include exact location, authority, access, time, focus, completion, alternatives, and a return-verification contract.
- A real external-resource lifecycle: save handoff, leave, record return, verify or hold for review, update mastery only from valid evidence, save an outcome receipt, and schedule a spaced follow-up.
- Deterministic plan generation and repair. Generated schedules become expiring proposals; explicit confirmation and commit are separate writes.
- Evidence-linked research retrieval over real user sources. Claims saved by assistants remain `unverified`; they may link only to exact user-owned passages.
- Private PDF/text ingestion with sanitization, stable chunks, content hashes, duplicate detection, optional private Blob originals, pgvector embeddings, lexical fallback, and source deletion from retrieval.
- A syllabus-aware Code workspace with streaming coaching, safe Markdown/math rendering, server-selected Featherless/Groq routes, abort support, per-user limits, optional browser-to-loopback Ollama, and memory checkpoints.
- Featherless task-aware routing from the live plan/catalog with reviewed task fallbacks, Groq low-latency and reasoning routes, direct Gemini generation/embeddings with up to ten server-side keys, AI Gateway fallback, Featherless embeddings, and optional local Ollama.
- Real user connection flows for Claude remote MCP, Google Calendar OAuth and explicit two-way schedule sync, encrypted paginated Zotero library indexing, NotebookLM source-pack handoff, Obsidian, and Ollama. Personal NotebookLM is correctly labeled as a handoff because it exposes no general account API.
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

See [architecture](docs/architecture.md), [memory and retrieval](docs/memory-retrieval.md), [MCP tools](docs/mcp-tools.md), [resource broker](docs/resource-broker.md), and [security](docs/security.md).

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

Open [http://localhost:3000](http://localhost:3000). Never commit `.env.local`; it is ignored by Git.

## Provider configuration

- Featherless: set `FEATHERLESS_API_KEY`. Model overrides are optional; the router inspects `/v1/plan` and `/v1/models` when available. The reviewed task fallbacks are Qwen3.5 9B for fast work, Qwen3.6 27B for reasoning, Qwen3 Coder Next for code, and GPT-OSS 20B for verification. The default embedding model is `Qwen/Qwen3-Embedding-8B` at 1,536 dimensions. Set concurrency-cost overrides accurately when pinning models.
- Groq: set `GROQ_API_KEY`. The default policy uses Llama 3.1 8B Instant for bounded work, Qwen3.6 27B for reasoning, GPT-OSS 120B for code, and GPT-OSS 20B for verification, subject to the live models enabled for the Groq project.
- Gemini: set `GEMINI_API_KEY_1` through `GEMINI_API_KEY_10` or `GEMINI_API_KEYS`, then explicitly set `GEMINI_DATA_USE_ACKNOWLEDGED=true`. Keys are server-only and responses never expose them. Multiple keys in one Google Cloud project do not multiply project quota.
- Embeddings: keep `EMBEDDING_DIMENSIONS=1536`. Provider order may include Gemini, Featherless, AI Gateway, or Ollama. Lexical retrieval remains available if every embedding provider fails.
- Ollama: browser-local generation accepts only loopback endpoints by default. Server-side remote Ollama is rejected unless `ALLOW_REMOTE_OLLAMA=true` is deliberately set.

Provider keys belong in an encrypted deployment secret store or the ignored local environment file. No system can make a key literally impossible to compromise; Continuum reduces exposure through server-only access, least privilege, no logging/display of values, rotation, and revocation.

See [deployment and configuration](docs/deployment.md) and the [exact integration setup guide](docs/integrations.md).

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
pnpm typecheck
pnpm lint
pnpm build
pnpm --filter @continuum/obsidian-plugin build
```

Passing local checks does not configure external credentials, publish a production domain, or complete the final Claude account-side connector action. Those are deployment gates, not source-code claims.

## Cost boundary

Continuum itself does not require an end-user subscription in this repository. Infrastructure and providers may still charge:

- Featherless Premium is a paid operator plan; the current documented plan includes four concurrency units, not four unlimited large-model requests.
- Gemini and hosted infrastructure have quotas and free-tier limits that can change.
- Ollama and Obsidian are local/free software paths, but use the user’s hardware and storage.
- Neon, Vercel, and Blob can exceed free allowances in real production use.

Continuum supports local fallbacks and operator-side provider health checks, but does not expose infrastructure details in the consumer Connections screen or label a hosted production deployment as universally free.

## License

MIT. See [THIRD_PARTY.md](THIRD_PARTY.md) for dependencies and content attribution.
