# Continuum build log

## 2026-07-18 — foundation

- Defined the shared academic-memory, outcome-first resource, and deterministic scheduling contracts.
- Created the TypeScript monorepo, shared Zod schemas, domain engines, retrieval helpers, model policy, database schema, OAuth foundation, MCP server, and initial product shell.
- Added source chunking, content hashes, evidence-linked claims, mastery transitions, immutable memory events, and schedule repair.

## 2026-07-19 — production implementation pass

- Replaced staged screens with real `/`, `/goals`, `/learn`, `/research`, `/memory`, `/integrations`, and `/activity` routes, grouped navigation, command search, mobile navigation, user-owned empty states, and a restrained light-blue/navy/white system.
- Replaced persistent-account seed rendering with user-scoped onboarding, goal/task/project creation, research sources and decisions, schedule proposals, proposal review, activity history, memory retrieval, and outcome receipts.
- Completed the user-bound Store and PostgreSQL repository for accounts, sessions, goals, tasks, projects, learning state, research, sources, resource activities, schedule, memory, audit, model usage, integration tokens, and OAuth grants.
- Implemented slow password hashing, opaque revocable sessions, aggregate and targeted login limits, temporary lockouts, same-origin mutations, secure cookies, remote database TLS enforcement, and production environment validation.
- Expanded the MCP contract to twenty-nine canonical actions and twenty-seven remote tools. Added token-efficient context loading, project selection, exact passages, safe proposals, receipts, progress, resource handoffs, specialist routing, per-tool scopes, OAuth consent, atomic code/refresh consumption, and immediate revocation checks.
- Made assistant proposal approval and accepted research-decision writes app-only. Schedule confirmation and commit remain separate operations in Continuum.
- Added the reviewed resource registry and deterministic ranking by topical fit, need, authority, quality, time, cost, access, format, and accessibility. Implemented saved handoff, return, checkpoint/review state, evidence-gated mastery, outcome receipt, and spaced follow-up.
- Added private source ingestion, PDF/UTF-8 validation, prompt-injection marking, stable chunks, deduplication, optional private Blob originals, 1,536-dimensional embeddings, pgvector retrieval, and source-locked refusal.
- Added the optional Obsidian plugin with SecretStorage, folder-first opt-in, manual sync, safe generated-note writes, deduplication, token revocation, and bounded document ingestion.
- Configured Featherless task routing for Qwen3.5 9B, Qwen3.6 27B, Qwen3 Coder Next, and GPT-OSS 20B within the four-unit plan. Added short-lived catalog-failure caching and weighted local concurrency.
- Configured Groq catalog-validated routes for Llama 3.1 8B Instant, Qwen3.6 27B, GPT-OSS 120B, and GPT-OSS 20B.
- Configured direct Gemini 3.5 Flash generation and Gemini Embedding 001 with ten server-only rotating keys, bounded failover, explicit data-use acknowledgement, and fixed vector dimensions.
- Made AI Gateway explicitly opt-in so an automatic hosting credential cannot silently activate metered OpenAI or Anthropic fallbacks. Grok/xAI and ChatGPT MCP remain disabled.
- Added per-user/provider rate limits, a daily generation-token budget, bounded model/upload time and size, tenant ownership checks, private cache headers, prompt/source separation, schema-bound generation, and dependency overrides for audited packages.
- Verified shared-state MCP reads, low-impact session sync, app-visible proposals, explicit proposal confirmation, deterministic schedule commit, external-resource return verification, mastery update, receipt creation, and follow-up scheduling in local acceptance flows.
- Live-verified Featherless plan access, Groq catalog access, all ten Gemini keys, Gemini embeddings, and structured generation on Featherless, Groq, and Gemini.
- Passed 80 automated tests across 16 files, all eight workspace typecheck/lint targets, the optimized Next.js build, the Obsidian production bundle, and a production dependency audit with no known vulnerabilities.
- Browser-verified desktop and mobile workspace routes, empty states, integration guidance, and the persistent-account login boundary with no horizontal overflow or console errors.
- Confirmed configured secrets exist only in ignored mode-`0600` `.env.local` and do not appear in tracked files or Git history.

## Release state

The work remains local. No repository push or application deployment is part of this pass. Production-domain credentials, backups/restore, external acceptance tests, independent security review, and the owner’s explicit publish approval remain release gates.
