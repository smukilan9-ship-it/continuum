# MCP verification

Verified live against the running dev server (`/api/mcp`, alias of `/mcp`)
with the real Neon database. Transport: MCP Streamable HTTP, stateless
(a fresh server is constructed per request).

## Setup used for verification

Local development accepts a static demo bearer token that maps to a fixed
user (non-production only; disabled when `NODE_ENV=production`):

```
Authorization: Bearer continuum-demo-2026
Accept: application/json, text/event-stream
Content-Type: application/json
```

The demo identity is `MCP_DEMO_USER_ID` (default `user_maya`) with all
canonical scopes. For the continuity test below it was pointed at a real
registered account so the same user could be read through the app UI.

### Connecting a real MCP host (Claude)
Production uses OAuth, not the demo token:

- Endpoint: `https://<your-domain>/mcp`
- Discovery: `/.well-known/oauth-protected-resource/mcp` and
  `/.well-known/oauth-authorization-server`
- Required env: `APP_BASE_URL`, `MCP_OAUTH_ISSUER_URL` (HTTPS), a strong
  `MCP_JWT_SIGNING_SECRET`.
- Flow: the host performs dynamic client registration → authorization-code +
  PKCE → receives only the scopes the user approved. Revoke under
  **Connections** in the app.
- Claude currently registers `https://claude.ai/api/mcp/auth_callback`.
  `https://claude.com/api/mcp/auth_callback` is the documented successor.
  Bare `https://claude.ai` or `https://claude.com` values are not callback
  URIs and must not be substituted for these exact paths.

## Protocol results

| Call | Result |
|---|---|
| `initialize` | 200; capabilities `{tools, resources, prompts, logging}`, serverInfo `continuum 1.0.0` |
| `tools/list` | **27 tools** |
| `resources/list` | **7 resources** |
| `tools/call list_goals` | returns the account's goals from Postgres |
| `tools/call load_context` | returns compacted current-state pack with provenance |
| `tools/call sync_session` (write) | saved an outcome receipt; returned its id |
| `tools/call route_specialist_task` | correct answer in ~4 s via Groq, with `assistance`/verification metadata |

Registered tools (canonical names):
`load_context, list_projects, load_project, list_goals, load_goal,
load_learning_state, load_schedule, search_memory, search_research,
get_claim_evidence, get_source_passage, recommend_resource,
load_outcome_receipt, sync_session, record_progress, save_artifact,
save_research_note, save_research_claim, record_learning_evidence,
propose_goal_change, propose_project_change, propose_task_change,
propose_schedule_change, commit_schedule_change, start_resource_activity,
complete_resource_activity, route_specialist_task`.

> Note on names: the audit brief lists illustrative names like
> `get_current_context`, `get_goal_state`, `search_academic_memory`,
> `get_today_plan`, `search_research_library`. Those exact strings are
> **aliases the store resolves** but are not the registered tool names; the
> equivalent registered tools are `load_context`, `load_goal`,
> `search_memory`, `load_schedule`, `search_research`. Approval-only
> operations (`confirm_proposal`, accepted-decision writes) are intentionally
> **not** remotely exposed.

## Cross-assistant continuity — verified BOTH directions over HTTP

This is the headline differentiator. It was proven end-to-end, not asserted.

**MCP write → app read.** A `sync_session` checkpoint written through MCP:
```
[MCP]  sync_session → receipt_6832edd37a2841de91c6590d
[APP]  GET /api/state?view=memory (with the user's session cookie)
       → FOUND: receipt_6832… "CONTINUITY PROOF: wrote this checkpoint through MCP"
```
It is also visible in the app UI ("Latest checkpoint" on Today).

**App write → MCP read.** A goal created through the app API:
```
[APP]  POST /api/state {type:"goal.created", ...} → goal_eaf07bd1832945d3924a74db
[MCP]  list_goals → contains goal_eaf07bd1… "Reverse continuity goal"
```

Both surfaces resolve `getStore(userId)` to the same `NeonStore` /
`NeonRepository`, so the shared state is real, not seeded.

## Security properties confirmed
- No token → `401` with a correct `WWW-Authenticate: Bearer ... resource_metadata=...`.
- Tools are filtered by granted scope before registration.
- Origin allowlist (`serviceOrigin`, `APP_BASE_URL`, `claude.ai`,
  `claude.com`, plus
  `MCP_ALLOWED_ORIGINS`); disallowed origins get `403`.
- Per-`{user,client}` rate limiting; token issuer/audience/resource
  validation and immediate revocation checks (`oauthGrantUnavailable`).
- Every tool executes against user-scoped repository queries.

## OAuth callback verification

The consent approval is exercised in a Chromium browser against a real
callback listener. Continuum preserves OAuth `state`, issues a PKCE-bound code,
and completes the cross-origin 303 callback hop. The OAuth consent routes use a
route-scoped CSP that permits registered HTTPS callbacks (and loopback
callbacks for development); the rest of the app retains `form-action 'self'`.
