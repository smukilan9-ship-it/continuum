# Fresh-user end-to-end flow (verified live)

Date: 2026-07-21 · Against the real Neon DB, real providers (Gemini/Groq/
Featherless), and the real remote MCP server. **No Maya, no seed fixture, no
mocked success states.**

## One command

```bash
pnpm dev                 # terminal 1 — needs DATABASE_URL + provider keys in .env.local
pnpm e2e:flow            # terminal 2 — drives the full flow on a brand-new account
# or against a deployed preview:
BASE_URL=https://<preview>.vercel.app node scripts/e2e-flow.mjs
```

`scripts/e2e-flow.mjs` registers a fresh account, runs all 15 steps through the
same public APIs a real user hits (plus a real OAuth+PKCE MCP handshake),
generates its own test PDF in-memory, and **asserts persisted state at each
step**. It exits non-zero if any step fails.

## Verified output (15/15)

```
PASS   1. Register fresh account -> user_db92309497054225848fb97a
PASS   2. Onboard -> 4 milestones, 7 tasks
PASS   3. Initial 7-day schedule committed -> 5 blocks
PASS   4. Upload PDF -> 1 chunk(s), embeddings stored
PASS   5. Grounded retrieval cites "electric-potential.pdf · passage 1"
PASS   6. Unanswerable question declined (no fabricated citation)
PASS   7. Broker selected external resource "Charges and Fields" (PhET · University of Colorado Boulder)
PASS   8. Guided task + checkpoint verification contract
PASS   9. Return + pass unseen verification
PASS  10. Mastery updated -> practicing (understanding 0.78)
PASS  11. Outcome receipt + spaced follow-up scheduled
PASS  12. Persisted in app (1 receipt, 1 mastery state)
PASS  13. MCP (real OAuth, PKCE) retrieves the same goal
PASS  14. MCP records approved progress update (receipt @ 2026-07-21T19:09:55.603Z)
PASS  15. MCP write appears immediately in the standalone app
```

## Step-by-step (what each step proves)

| # | Step | API | Assertion |
|---|------|-----|-----------|
| 1 | Register | `POST /api/auth/register` | 201, real `user_id`, scrypt hash, session |
| 2 | Onboard (deep intake) | `POST /api/onboarding` | goal + ≥3 milestones + ≥4 tasks with estimates + a dependency chain (diagnostic first), persisted |
| 3 | Initial plan | (onboarding, deterministic scheduler) | a committed 7-day schedule + a concrete next action |
| 4 | Upload source | `POST /api/sources` (multipart PDF) | 201, ≥1 chunk, `embeddingStatus: stored` (pgvector) |
| 5 | Grounded retrieval | `POST /api/retrieval` | `vector` mode, exact citation `file · passage N`, `direct_support` |
| 6 | Unanswerable guard | `POST /api/retrieval` | 0 citations; declines to make an unsupported claim |
| 7 | Broker recommends | `POST /api/resources {action:start}` | selects a real external resource (PhET) over native, with alternatives |
| 8 | Guided activity | (recommendation payload) | exact completion instructions + a verification contract |
| 9 | Return + verify | `POST /api/resources {action:return/verify}` | unseen checkpoint; correct answer passes, wrong answer does **not** (evidence-gated) |
| 10 | Mastery update | (verify response) | `updateMastery` raises understanding only on valid evidence |
| 11 | Receipt + reschedule | (verify response) | outcome receipt written + spaced follow-up block scheduled |
| 12 | Persistence | `GET /api/state?view=learn` | mastery + receipt visible on reload |
| 13 | MCP read | OAuth register → authorize(+PKCE) → token → `tools/call list_goals` | Claude retrieves the same goal as the fresh user |
| 14 | MCP write | `tools/call sync_session` | approved progress update, receipt with provenance + timestamp |
| 15 | Continuity | `GET /api/state?view=memory` | the MCP write appears immediately in the app |

## Notes

- **Idempotent onboarding:** re-running `POST /api/onboarding` for a user who
  already has a goal returns `already_onboarded` and never creates a duplicate
  plan (verified separately).
- **Object storage:** the original PDF binary upload to Vercel Blob is
  best-effort and bounded — under `next dev` its patched fetch can leave the
  upload hung, so the route degrades storage to `unavailable` and ingestion
  proceeds (the blob store itself works; verified in isolation and on Vercel).
  The searchable index (chunks + embeddings) never depends on it.
- **MCP dev bypass:** the static development token path is gated to
  `NODE_ENV !== "production"`; this run used a real OAuth authorization-code +
  PKCE grant for the fresh user, not the bypass.

## Automated coverage (CI-safe, `pnpm test` — 125 tests)

- `tests/onboarding.test.ts` — deterministic planner: diagnostic-first
  milestones, acyclic dependency chain, bounded estimates, confidence scaling,
  goal-type phases, determinism.
- `tests/mcp.test.ts` — tool contract + scope enforcement + a shared-state
  **read-after-write** continuity assertion.
- Plus the existing retrieval, resources, scheduler, learning, routing, health,
  oauth, and connection suites.

`pnpm e2e:flow` is the live counterpart that exercises the real stack.
