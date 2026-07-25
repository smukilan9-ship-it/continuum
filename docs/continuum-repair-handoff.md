# Continuum repair handoff

Completed 2026-07-25. The pre-edit route/state/API/database map, reproduced
root causes, implementation notes, and verification evidence are in
`docs/continuum-functionality-repair-audit.md`.

## Required server environment

Required for shared Featherless access:

- `FEATHERLESS_API_KEY_PRIMARY`
- `FEATHERLESS_API_KEY_SECONDARY`

Recommended explicit production controls (safe defaults are also enforced in
code):

- `FEATHERLESS_FAST_MODEL`
- `FEATHERLESS_REASONING_MODEL`
- `FEATHERLESS_CODE_MODEL`
- `FEATHERLESS_VERIFIER_MODEL`
- `FEATHERLESS_FALLBACK_MODEL`
- `FEATHERLESS_MODEL_ALLOWLIST`
- `FEATHERLESS_CONCURRENCY_UNITS`
- `PER_USER_DAILY_TOKEN_CAP`
- `AI_PER_USER_REQUESTS_PER_MINUTE`
- `AI_PER_USER_REQUESTS_PER_DAY`
- `AI_MAX_INPUT_TOKENS`
- `AI_MAX_OUTPUT_TOKENS`
- `AI_REQUEST_TIMEOUT_MS`
- `AI_GLOBAL_CONCURRENCY_LIMIT`
- `AI_GLOBAL_DAILY_TOKEN_CAP`
- `AI_SHARED_MONTHLY_BUDGET_USD`
- `AI_EMERGENCY_CUTOFF`
- `AI_SAFE_CACHE_TTL_SECONDS`

These variables are server-only. Do not create `NEXT_PUBLIC_` equivalents.
OAuth signing and production persistence continue to require the existing
`OAUTH_SIGNING_SECRET`, `APP_BASE_URL`, and `DATABASE_URL` settings.

## Migration

Run `pnpm db:migrate` before deploying the repaired application. Migration
`packages/db/migrations/0006_ai_gateway_oauth_schedule.sql` adds:

- model-usage feature/cost fields and budget indexes;
- global AI request leases;
- durable OAuth connections;
- flexible/fixed schedule-block state.

The changes are additive and preserve existing rows and identifiers.

## Files changed

Security, AI gateway, and environment:

- `.env.example`
- `apps/web/lib/ai-gateway.ts`
- `apps/web/lib/ai-budget.ts`
- `apps/web/lib/provider-credentials.ts`
- `apps/web/app/api/ai/route.ts`
- `apps/web/app/api/ai/status/route.ts`
- `apps/web/app/api/code/route.ts`
- `apps/web/app/api/mcp/route.ts`
- `apps/web/next.config.mjs`
- `packages/ai/src/featherless.ts`
- `packages/ai/src/policy.ts`
- `packages/ai/src/providers.ts`

OAuth and Connections:

- `apps/web/lib/oauth.ts`
- `apps/web/app/api/oauth/authorize/route.ts`
- `apps/web/app/api/oauth/token/route.ts`
- `apps/web/app/oauth/authorize/page.tsx`
- `apps/web/components/oauth-consent-form.tsx`
- `apps/web/app/api/integrations/route.ts`
- `apps/web/components/integrations-screen.tsx`
- `apps/web/app/connections/page.tsx`

Research, Learn, Plan, Code, and shared UI:

- `apps/web/components/ui.tsx`
- `apps/web/components/continuum-app.tsx`
- `apps/web/components/workspace/research-screen.tsx`
- `apps/web/components/workspace/learn-screen.tsx`
- `apps/web/components/workspace/goals-screen.tsx`
- `apps/web/components/workspace/today-screen.tsx`
- `apps/web/components/workspace/code-screen.tsx`
- `apps/web/app/api/resources/route.ts`
- `apps/web/app/api/schedule/route.ts`
- `apps/web/lib/workspace-routes.ts`
- `apps/web/app/globals.css`
- `packages/domain/src/resources.ts`
- `packages/domain/src/scheduler.ts`

Persistence:

- `apps/web/lib/store.ts`
- `packages/db/src/schema.ts`
- `packages/db/src/repo.ts`
- `packages/db/migrations/0006_ai_gateway_oauth_schedule.sql`
- `packages/db/migrations/meta/_journal.json`

Tests, tooling, and documentation:

- `e2e/continuum.spec.ts`
- `playwright.config.ts`
- `tests/api-wiring.test.ts`
- `tests/embeddings.test.ts`
- `tests/featherless.test.ts`
- `tests/oauth.test.ts`
- `tests/provider-credentials.test.ts`
- `tests/resources.test.ts`
- `tests/routing.test.ts`
- `turbo.json`
- `README.md`
- `REAL_APP_REPORT.md`
- `plan.md`
- `docs/deployment.md`
- `docs/featherless-verification.md`
- `docs/integrations.md`
- `docs/continuum-functionality-repair-audit.md`
- `docs/continuum-repair-handoff.md`
- `docs/screenshots/continuum-repair/*.png`

## Manual test checklist

Security and AI:

- [ ] Sign out, call an AI product route, and confirm it returns 401 without
  contacting a provider.
- [ ] Sign in and exercise Learn, Code feedback, and an MCP generation action;
  confirm each uses the central gateway and records feature/model/token/cost
  usage.
- [ ] Exceed minute, daily, input, output, and concurrency limits and confirm
  the four safe UI error classes.
- [ ] Set `AI_EMERGENCY_CUTOFF=true` and confirm saved work remains usable while
  AI requests stop.
- [ ] Simulate one Featherless 429/provider failure and confirm one healthy-key
  failover for safe bounded work, with no repeated expensive retry.
- [ ] Inspect HTML, network payloads/responses, browser logs, static chunks, and
  source maps for both real key values.

Claude MCP OAuth:

- [ ] Start a fresh Claude connector authorization and confirm Approve enters
  loading immediately and cannot submit twice.
- [ ] Complete code exchange, run an MCP read, return to Connections, and
  confirm the durable connected state and success feedback.
- [ ] Reject, cancel, submit invalid state/PKCE/redirect values, and simulate a
  callback/token failure; confirm safe return or a retryable branded error.
- [ ] Revoke the connection and confirm its grants and connected state are
  removed.

Research:

- [ ] Use “Connect tools” and confirm it opens Connections without a 404.
- [ ] Open Add source from the library; confirm focus starts on the file input,
  Tab stays inside, Escape/backdrop/close work, and dirty dismissal asks before
  discarding.
- [ ] Upload both supported source types and confirm indexing and project
  association complete without a page jump.

Learn:

- [ ] Enter through each landing action and complete the progressive finder.
- [ ] Reject a result with a reason/note and confirm the original goal is
  preserved, the changed preference is shown, and the next ranking differs.
- [ ] Start and return from a resource, then test verified, recorded, and
  insufficient evidence outcomes.
- [ ] Submit `BB10 1520`, confirm section-specific validation, then submit the
  required Reading/Writing and Math structure.
- [ ] Complete verification and confirm the goal/mastery delta, next step,
  Continue learning return, and Review this result details.

Plan:

- [ ] Complete onboarding with fixed commitments, weekday/weekend windows,
  breaks, no-schedule days, and workload.
- [ ] Drag between days, keyboard-resize, edit date/time/title/goal/duration,
  add, duplicate, delete, and toggle fixed/flexible.
- [ ] Create an overlap and an excessive-workload day and confirm warnings.
- [ ] Undo, regenerate one day and one block, discard with confirmation, then
  save and reload the final schedule.
- [ ] Confirm no Google Calendar authorization is requested.

Code and accessibility:

- [ ] Run Python, JavaScript, TypeScript, and SQL; verify output/pass/fail and
  a plain-language runtime error.
- [ ] Confirm Get feedback is manual and local execution never triggers it.
- [ ] Reload/navigate with an unsaved draft and confirm local restoration.
- [ ] Keyboard-test dialogs, off-canvas navigation, focus return, visible focus,
  labels, and tab order at 1440×900, 1024×768, and 390×844.

## Automated coverage

- Unit/integration: 30 files, 207 tests.
- Playwright: 7 end-to-end workflows, including primary/legacy routes, OAuth
  approve/reject/failure paths, Research modal, Learn, editable Plan, Code
  execution, and mobile overflow.
- Quality gates: lint, typecheck, and production build.

## Remaining limitations

- Safe request caching and in-flight deduplication are process-local. Quotas and
  concurrency are database-backed, but multi-instance shared response caching
  would require Redis or another shared cache.
- Estimated AI cost is a policy estimate for budget protection, not provider
  invoice reconciliation.
- Schedule dragging moves a block between days; exact time changes use the
  immediately available edit dialog. A pixel-positioned time-grid drag can be
  added later without changing the saved schedule model.
- Google Calendar remains an optional Connections integration. Continuum does
  not yet push an internally saved draft to an external calendar.
- Browser program runners intentionally remain bounded sandboxes; they are not
  substitutes for full local toolchains or long-running processes.
