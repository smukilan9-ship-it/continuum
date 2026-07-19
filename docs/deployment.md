# Deployment and provider configuration

## Required production services

1. PostgreSQL with the `vector` extension and the checked-in migrations.
2. A public HTTPS application origin.
3. Strong MCP signing and session privacy secrets.
4. At least one generation provider.
5. At least one 1536-dimensional embedding provider.
6. Optional private Blob storage for original uploads and non-text Obsidian files.

Run:

```bash
pnpm db:migrate
pnpm db:seed
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`db:seed` adds only the separately identified Maya demonstration account and reviewed resource/curriculum seed. Ordinary accounts receive no seeded academic state.

## Secrets

For local work, put values in `.env.local`, which is ignored. For a hosted deployment, use the platform’s encrypted environment-variable store. Never paste keys into source, client-side variables, screenshots, logs, issue text, or documentation.

Minimum production values are documented in `.env.example`. Generate high-entropy values for `MCP_JWT_SIGNING_SECRET` and `SESSION_PRIVACY_SALT`; do not reuse provider keys across environments. The exact local and Vercel locations, provider instructions, and first-party links are in [integration setup](integrations.md).

Public registration is closed by default in production. Enable `PUBLIC_REGISTRATION_ENABLED=true` only after adding the intended email-verification, recovery, abuse-monitoring, and user-support process; local development registration remains available.

## Featherless

Set `FEATHERLESS_API_KEY`. The router uses the live plan and eligible model catalog, then ranks models by task, context, hot availability, likely concurrency-unit cost, model specialization, and operator allowlist. Optional task-class overrides are:

- `FEATHERLESS_FAST_MODEL`
- `FEATHERLESS_REASONING_MODEL`
- `FEATHERLESS_CODE_MODEL`
- `FEATHERLESS_VERIFIER_MODEL`

When pinning a model, set `FEATHERLESS_MODEL_CONCURRENCY_COST` accurately. Featherless documents four concurrency units on Premium: models below 16B consume one unit, models below 34B consume two, and models at 70B or above consume four. That corresponds to four small, two medium, or one large request at once; excess work may receive HTTP 429. Continuum favors one-unit models for bounded work and retries/falls back, but the provider remains the final account-wide concurrency authority across multiple server instances.

If live catalog discovery is degraded, generation uses the reviewed task set: `Qwen/Qwen3.5-9B` for fast work, `Qwen/Qwen3.6-27B` for reasoning, `Qwen/Qwen3-Coder-Next` for code, and `openai/gpt-oss-20b` for verification. An explicit `FEATHERLESS_FALLBACK_MODEL` overrides that task set. Featherless embeddings default to `Qwen/Qwen3-Embedding-8B` with 1,536 output dimensions so vectors match the database column. Pin different models only after a provider smoke test and dimension check.

## Groq

Set `GROQ_API_KEY`. Continuum checks the project’s live model catalog before using the configured task route. Defaults are `llama-3.1-8b-instant` for bounded work, `qwen/qwen3.6-27b` for reasoning, `openai/gpt-oss-120b` for code, and `openai/gpt-oss-20b` for verification. The catalog check prevents a retired or project-disabled identifier from being used blindly.

Featherless is paid in this plan. It can serve generation, tool-calling-capable models, and embeddings when the selected model supports them. It is not used for deterministic schedules, permissions, arithmetic, state transitions, or database retrieval.

## Gemini keys

Set up to ten keys with `GEMINI_API_KEY_1` … `GEMINI_API_KEY_10`, a comma-separated `GEMINI_API_KEYS`, or the single-key compatibility variable. Duplicate keys are removed. Values are not returned by status APIs.

Set `GEMINI_DATA_USE_ACKNOWLEDGED=true` only after reviewing Google’s terms and the data sent by this deployment. Key rotation happens server-side. Google quota is per project rather than per key, so ten keys in one project do not create ten times the quota. Use separate legitimate projects only when Google’s policies and intended ownership permit it; do not use key cycling to evade limits.

Direct Gemini generation uses the stable `gemini-3.5-flash` default. Direct embeddings use `gemini-embedding-001` and request 1,536 output dimensions to match the database vector column.

## Abuse controls

`AI_REQUESTS_PER_MINUTE`, `MCP_REQUESTS_PER_MINUTE`, and `PER_USER_DAILY_TOKEN_CAP` are enforced in the application in addition to provider quotas. Authentication, integration credential creation/status, source ingestion, semantic retrieval, and Obsidian sync use separate PostgreSQL-backed rate-limit namespaces. These limits are atomic across server instances. Keep provider-level budgets and usage alerts enabled as a second boundary.

Vercel AI Gateway is disabled unless `AI_GATEWAY_ENABLED=true`. The automatically available Vercel OIDC credential is not treated as consent to use metered fallback models.

## Ollama

Users can configure a browser-local Ollama endpoint under Integrations. The URL and model preference remain in localStorage, and generated text travels directly between the browser and loopback Ollama. Server API keys are not involved. CORS/allowed-origin configuration in Ollama may be required.

Server-side Ollama embeddings/generation can use `OLLAMA_BASE_URL`. Non-loopback URLs require the deliberate `ALLOW_REMOTE_OLLAMA=true` opt-in and appropriate transport authentication outside Continuum.

## Release gates

- Health endpoint reports a ready production environment.
- Migrations and a restore test have passed.
- Registration/login/logout and tenant isolation pass against production-like infrastructure.
- Claude connects through OAuth, loads real context, syncs a receipt, and revocation fails the next call.
- External-resource start/return/verify creates a receipt and a schedule block.
- Provider failure degrades to another configured provider or a clear error; it does not fabricate output.
- Private original storage is configured before promising original-file retention.
- Logs and observability redact authorization and credential material.
