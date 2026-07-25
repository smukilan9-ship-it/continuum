# Continuum functionality and UX repair audit

Audited before implementation on 2026-07-25.

## Runtime map

- App routes: `/`, `/goals`, `/learn`, `/code`, `/research`, `/memory`,
  `/activity`, and `/integrations` all render `app/workspace-page.tsx`, which
  authenticates the account, reads a user-scoped view snapshot, and mounts
  `components/continuum-app.tsx`.
- Navigation: `lib/workspace-routes.ts` is the canonical route map, while
  `ContinuumApp` keeps a client-side per-view cache and refreshes it through
  `GET /api/state?view=...`.
- Product state: `lib/store.ts` is the shared seam. `NeonStore` delegates to
  `packages/db/src/repo.ts`; the development fallback uses `demo-store.ts`.
  The web app and authenticated MCP endpoint use the same store.
- Persistence: Drizzle models live in `packages/db/src/schema.ts`; migrations
  live in `packages/db/migrations`. Relevant entities are users, profiles,
  sessions, goals, tasks, schedule blocks, projects, sources/source chunks,
  learning states, resource activities, outcome receipts, model routes/usage,
  OAuth grants, integrations, and rate-limit buckets.
- AI: provider selection and Featherless credential health currently live in
  `packages/ai/src/{policy,providers,featherless}.ts`. Product handlers invoke
  them independently from `/api/ai`, `/api/code`, and `/api/mcp`; embeddings
  are also used by sources, retrieval, Zotero, Obsidian, and memory.
- Claude MCP OAuth: metadata advertises `/api/oauth/authorize`,
  `/api/oauth/token`, `/api/oauth/register`, and `/api/oauth/revoke`.
  Authorization codes, access tokens, and refresh tokens are signed in
  `lib/oauth.ts` and backed by `oauth_grants`.
- Research: `research-screen.tsx` uses `/api/research/discovery`,
  `/api/sources`, and `/api/state`.
- Learn: `learn-screen.tsx` uses `/api/learning`, `/api/learning/videos`, and
  `/api/resources`; ranking is deterministic in
  `packages/domain/src/resources.ts`.
- Plan: `goals-screen.tsx` uses `/api/schedule` and `/api/state`; schedule
  validity comes from `packages/domain/src/scheduler.ts`.
- Code: `code-screen.tsx` executes runnable languages in browser workers and
  requests optional model feedback through `/api/code`.

## Reproduced root causes

1. Before this repair, Featherless access was not compliant with the shared-key
   contract. The legacy base variable plus numbered variants were accepted, the Connections
   UI lets a user provide a Featherless key, and `/api/ai` can replace the
   process credential with that user secret. Quotas, timeout, cache, model
   policy, concurrency, and logging are split across handlers, so no single
   gateway can guarantee the limits for every product surface.
2. OAuth Approve is a plain server-rendered form with no client submit state,
   double-submit prevention, retry state, or connection-specific persistence.
   A failed post or callback becomes raw OAuth JSON, while `oauth_grants`
   records only short-lived token artifacts; Connections therefore cannot show
   a durable success state. During the repair, end-to-end testing also caught a
   form-serialization trap: disabling the fieldset for the loading state before
   native serialization removes the clicked `decision` and checked `scope`
   controls. The final client uses a synchronous ref lock plus `aria-disabled`
   styling, so it shows loading without dropping successful controls.
3. Research “Connect tools” hard-codes `/connections`, but the real route is
   `/integrations`; browser reproduction returns the Next.js 404 page.
4. Source Library Add toggles an `inline-form-card` before the project content.
   Rendering it changes page flow and focus/scroll position, so the form can
   appear outside the current viewport. It is not a dialog and has no focus
   trap, Escape behavior, guarded dismissal, or backdrop.
5. Learn exposes its home/finder state through a small top-right segmented
   control, asks all filters simultaneously, and has no rejection model.
   Re-querying calls the same deterministic ranker with unchanged inputs.
   “Start over” clears the workflow immediately, and non-verifiable evidence is
   described as awaiting review even though no human review queue exists.
6. Score-import evidence defaults to zero unless a separate numeric `score`
   parses successfully. Free-form values such as `BB10 1520` therefore become
   an ambiguous preserved record rather than a structure-specific validation
   error. Completion copy does not clearly summarize the mastery delta and
   next action.
7. Plan generates generic availability windows starting from the current time.
   It does not collect wake/sleep, fixed commitments, weekday/weekend capacity,
   break preference, excluded days, or realistic workload. The UI still
   directs users to Google Calendar and the generated proposal is read-only
   except for accept/discard.
8. Code presents implementation terms in the primary UI, places task context
   in a collapsible right rail, labels feedback “AI feedback,” exposes provider
   routing, and includes Run in both the toolbar and empty output. Output,
   tests, feedback, and history compete at the same hierarchy.
9. Shared primitives are incomplete: Radix Dialog is used only by search;
   screens otherwise implement bespoke empty/error/success/loading and native
   `window.confirm` behavior. This causes inconsistent keyboard behavior,
   feedback, and destructive-action handling.

## Baseline verification

- `pnpm test`: 30 files and 201 tests passed before changes.
- Browser: login and the application render without a Next.js error overlay.
- Browser: `/connections` returns 404.
- Browser: Source Add changes the in-flow page and scroll position.
- Browser: OAuth consent renders and submits as an unenhanced form, with no
  visible pending or retry state.

## Implemented resolution

### Server-side AI boundary

- `apps/web/lib/ai-gateway.ts` is now the single authenticated entry point for
  product generation from AI, Code, and MCP handlers.
- The gateway enforces per-user minute and day request caps, input/output token
  ceilings, a hard request deadline, a database-backed global concurrency
  lease, daily user/global token budgets, the shared monthly dollar budget,
  and `AI_EMERGENCY_CUTOFF`.
- Model choice is task-policy driven. Bounded classification, extraction,
  summarization, rewriting-style tutoring, and misconception work use the fast
  route; code and difficult reasoning use reviewed specialist/strong routes.
  At 80% shared-budget consumption, strong routes degrade to the configured
  fast model.
- Usage records now include user, feature, task class, provider, model, input
  and output tokens, fallback state, and estimated cost.
- Featherless health is kept per key. Healthy keys are distributed, provider
  throttling temporarily backs off that key, and only safe bounded structured
  work may retry once on the other key. Expensive or high-stakes calls are not
  repeatedly retried.
- Safe, non-high-stakes structured calls use a per-user hash cache and
  in-flight deduplication. UI responses use the stable error classes
  `service_busy`, `daily_allowance_reached`, `request_too_large`, and
  `model_unavailable`.
- Only `FEATHERLESS_API_KEY_PRIMARY` and
  `FEATHERLESS_API_KEY_SECONDARY` are accepted. The user-credential UI and
  request override were removed.

### OAuth, routes, and shared interaction primitives

- OAuth authorization now performs strict registered redirect, state, resource,
  PKCE S256, signed single-use consent, same-origin, authentication, and
  rate-limit checks. A successful token exchange writes `oauth_connections`;
  Connections reads and revokes that durable record.
- The consent page uses the product design system, plain-English permissions,
  immediate loading, a synchronous double-submit guard, reject/cancel paths,
  recoverable errors, and safe return navigation.
- `/connections` is a compatibility redirect to the canonical
  `/integrations` route. All workspace destinations come from
  `lib/workspace-routes.ts`.
- Source Add is a real Radix dialog with focus trapping, initial focus, Escape,
  backdrop dismissal, a guarded dirty state, and responsive source choices.
- `components/ui.tsx` now provides the shared modal, loading button, empty,
  error, success, segmented-navigation, and confirmation primitives.

### Learn, Plan, and Code

- Learn now opens on one landing page with prominent actions and a progressive
  natural-language finder. Time/access are chips and goal/subject are inferred.
  Results have a fixed content hierarchy, feedback-driven re-ranking, guarded
  goal changes, deterministic evidence validation, explicit verified/recorded/
  insufficient outcomes, and a completion summary that returns to Learn.
- Plan no longer depends on Google Calendar. Intake captures wake/sleep, fixed
  commitments, weekday/weekend availability, priorities, deadlines, session
  and break preferences, excluded days, and workload. The generated draft can
  be dragged, keyboard-resized, edited, added, deleted, duplicated, marked
  fixed/flexible, overlap-checked, workload-checked, undone, selectively
  regenerated, and saved.
- Code has one primary Run control, adjacent Program input, plain-language task
  and completion context, editor-centered layout, Output/Tests/Feedback tabs,
  local execution messaging, manual feedback only, and hidden environment
  details.
- Mobile navigation is inert while closed, background content is inert while
  the drawer is open, Escape restores focus to the opener, and the compact
  search control retains an accessible name.

## Database migration

`packages/db/migrations/0006_ai_gateway_oauth_schedule.sql`:

- adds `feature` and `estimated_cost_usd` to `model_usage`;
- adds usage indexes required by per-user/global budget checks;
- creates `ai_request_leases` for shared concurrency;
- creates durable `oauth_connections`;
- adds `flexible` to `schedule_blocks`.

The migration is registered as entry 6 in
`packages/db/migrations/meta/_journal.json`; omitting that journal entry was
reproduced as the reason Drizzle initially reported success without applying
the new columns/tables.

## Final verification

- `pnpm test`: 30 files, 207 tests passed.
- `pnpm lint`: 8 packages passed with zero warnings.
- `pnpm typecheck`: 8 packages passed.
- `pnpm build`: production Next.js build passed for all 8 packages.
- Playwright: 7/7 workflows passed, including real consent → code → token → MCP,
  approve/reject/invalid-state/failed-callback paths, Research route/modal,
  Learn, editable Plan, Code execution, legacy route redirect, and mobile
  horizontal-overflow checks.
- Production leak audit: built with unique harmless values in both Featherless
  variables. Neither value appeared anywhere under `.next`; neither variable
  name appeared under `.next/static`; and `.next/static` contained no source
  maps.
