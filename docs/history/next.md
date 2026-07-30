# Continuum implementation status

The production implementation pass is complete in source and remains local. Nothing in this checkout has been pushed or published.

## Implemented

- Persistent account, session, user-scoped PostgreSQL, audit, rate-limit, and proposal infrastructure.
- One canonical state shared by the standalone app and OAuth-authorized remote MCP clients.
- Token-budgeted `load_context`, project selection and loading, hybrid memory search, exact research passages, outcome receipts, and low-impact session synchronization.
- Twenty-nine canonical actions; twenty-seven are remote MCP tools. Accepted-decision writes and proposal approval remain signed-in app actions so an assistant cannot approve its own consequential change.
- Reviewed native-versus-external resource ranking, guided handoff, saved return point, evidence capture, verification, mastery gating, outcome receipts, and spaced follow-up scheduling.
- Deterministic schedule proposal and repair, followed by explicit confirmation and a separate commit.
- User-owned PDF/text ingestion, stable passages, source-locked refusal, Gemini/Featherless embeddings, pgvector search, and lexical fallback.
- Optional Obsidian folder sync with one-time revocable tokens and SecretStorage.
- Task-aware Featherless, Groq, and Gemini routing with schema validation, bounded retries, exhaustive configured-provider fallback, rate limits, and daily token budgets.
- Responsive light-blue, navy, and white product shell with real routes, mobile navigation, empty states, search, integration status, and official setup guides.

## Intentionally disabled

- Grok/xAI: no key or route is configured.
- ChatGPT MCP: protocol compatibility remains future scope until an account-side connection passes acceptance testing.
- Vercel AI Gateway: disabled unless the operator explicitly sets `AI_GATEWAY_ENABLED=true` after accepting metered costs.
- Schedule commits update Continuum's own editable planner.

## Local acceptance state

- All workspace packages typecheck and lint.
- The full test suite passes.
- The optimized Next.js and Obsidian builds pass.
- Featherless plan access, Groq catalog access, all ten Gemini keys, Gemini embeddings, and structured generation on Featherless, Groq, and Gemini have passed live local smoke checks.
- Desktop and mobile routes render without horizontal overflow or browser console errors.
- Secret values exist only in ignored `.env.local`, whose mode is `0600`; they are absent from tracked content and Git history.

## External launch gates

These are operator actions, not missing application code:

1. Create separate production credentials and rotate any key ever shared outside the secret store.
2. Configure the chosen HTTPS domain and encrypted production environment variables.
3. Apply migrations, configure backups, and run a restore exercise on the production database.
4. Configure private Blob if original-file retention is promised.
5. Run tenant-isolation, OAuth, MCP revocation, upload, resource-return, and provider-failure acceptance tests against a disposable production-like environment.
6. Connect Claude through the production OAuth consent flow and verify shared-state round trips.
7. Enable provider budgets, usage alerts, log redaction, retention, and incident-response procedures.
8. Complete an independent security review before opening registration publicly.
9. Publish only after the owner explicitly authorizes a push and deployment.
