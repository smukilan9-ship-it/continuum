# Continuum

> One evidence-backed academic memory and execution engine across adaptive learning, Claude, ChatGPT, and every MCP-compatible assistant.

Continuum is the judged-demo implementation for the Prometheus July AI Challenge. It closes the loop from **diagnose → teach → verify → remember → schedule** while keeping research claims connected to exact evidence.

## What works

- A polished, responsive Today dashboard with deadline risk, completion evidence, and selective replanning.
- Goal creation with editable inferences, milestone graphs, blockers, and next evidence.
- A complete Physics diagnostic, misconception intervention, KaTeX lesson, unseen checkpoint, evidence-gated mastery update, and review scheduling flow.
- A research workspace with a paper library, claim ledger, exact passages, support states, accepted decisions, unresolved questions, and next tasks.
- Source ingestion for PDF/text, hashing, sanitization, stable chunks, source-locked refusal, and lexical fallback retrieval.
- Deterministic scheduling with hard constraints, dependency ordering, energy fit, buffers, and repair-only replanning.
- Event-first memory, compact context packing, append-only audit contracts, provider routing, independent verifier selection, and daily token caps.
- A Streamable HTTP MCP endpoint built with the official TypeScript SDK, 16 scoped tools, eight resources, guided prompts, OAuth 2.1-style PKCE, token rotation, revocation, and a feature-flagged demo token.
- A complete Drizzle/Postgres schema for all P0 entities, including pgvector storage.

External provider, Supabase, and calendar credentials are optional. The coherent demo path runs entirely from fresh seeded data.

## Run locally

Requirements: Node.js 24+ and pnpm 11+.

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The main route opens the ready-to-judge demo workspace; `/login` shows the demo-user entry experience.

Verification:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

## MCP development connection

Endpoint: `http://localhost:3000/api/mcp`

For local inspection only, the default feature-flagged token is:

```text
continuum-demo-2026
```

Set `MCP_DEMO_TOKEN` to override it. Production has no default token and requires `MCP_JWT_SIGNING_SECRET`. OAuth discovery is at `/.well-known/oauth-authorization-server`.

Example initialization:

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H 'Authorization: Bearer continuum-demo-2026' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"continuum-test","version":"1.0.0"}}}'
```

## Repository map

```text
apps/web             Next.js app, routes, OAuth, MCP, demo UI
packages/schemas     Zod contracts and inferred TypeScript types
packages/domain      Memory, learning, scheduling, permissions, audit
packages/retrieval   Chunking, hashing, sanitization, retrieval
packages/ai          Deterministic provider-routing and validation policy
packages/db          Drizzle schema and migrations
packages/mcp         Tool/resource contracts and scope enforcement
seed                 Original Physics and synthetic research demo data
tests                Executable acceptance checks mapped to PRD §14
docs                 Architecture, security, MCP, and demo handoff
```

## Data and deployment

The demo intentionally uses an in-process seed adapter so judges never hit a broken loading state. Set `DATABASE_URL` and apply the checked-in Drizzle schema for durable Supabase/Postgres persistence. Source file blobs belong in Supabase Storage; only server routes receive service credentials.

Deploy `apps/web` to Vercel with Node.js 24. Configure the variables in `.env.example`, apply the pgvector migration to Supabase, and make `/api/mcp` HTTPS reachable before registering a remote connector.

## Safety and integrity

- Provider and service-role keys are server-only.
- Retrieved sources are untrusted data, sanitized, and never treated as tool instructions.
- MCP read/write scopes are separate; schedule commits require confirmation metadata.
- Generated structured outputs are Zod-validated before use.
- Reading a lesson cannot increase transfer mastery.
- Unsupported source-locked questions refuse rather than invent citations.
- Research assistance verifies and structures the learner's work; it does not misrepresent ghostwritten text as user scholarship.

See [docs/security.md](docs/security.md) and [docs/mcp-tools.md](docs/mcp-tools.md) for the full contract.

## Demo credentials

- User: Maya Singh (seeded demo workspace)
- Account password: none required for local demo
- MCP demo token: `continuum-demo-2026` (local, feature-flagged only)

## License

MIT. See [THIRD_PARTY.md](THIRD_PARTY.md) for dependencies and content attribution.
