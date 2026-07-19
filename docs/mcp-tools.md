# Claude remote MCP contract

Continuum exposes the official MCP SDK over stateless Streamable HTTP at `/api/mcp`. In production, connect Claude to `https://<continuum-domain>/api/mcp` as a custom connector. Claude discovers OAuth metadata, registers a public PKCE client, opens the Continuum authorization page, and receives only the scopes approved by the signed-in user.

The Integrations screen shows current client IDs, names, scopes, connection time, expiry, and revocation controls. Revocation is checked before every request.

## Canonical tools

| Tool | Class | Required scope | Behavior |
|---|---|---|---|
| `load_context` | Read | `memory:read` | Token-budgeted current state plus relevant memory; full history stays searchable |
| `list_projects` | Read | `research:read` | Concise project selector for the host to display |
| `load_project` | Read | `research:read` | One project with decisions, tasks, sources, receipts, and relevant memories |
| `list_goals` | Read | `goals:read` | User-owned goal selector |
| `load_goal` | Read | `goals:read` | One goal with tasks and linked projects |
| `load_learning_state` | Read | `learning:read` | Evidence-backed multidimensional mastery |
| `load_schedule` | Read | `schedule:read` | Committed user-owned Continuum blocks, optionally time-bounded |
| `search_memory` | Read | `memory:read` | Hybrid semantic/lexical retrieval with optional goal/project/type filters |
| `search_research` | Read | `research:read` | Real notes, decisions, claims, sources, and exact passages |
| `get_claim_evidence` | Read | `research:read` | Claim, evidence status, passage, hashes, versions, and timestamps |
| `get_source_passage` | Read | `research:read` | Exact stored passage by source/chunk ID |
| `recommend_resource` | Read | `resources:read` | Reviewed native-versus-external decision and guided return contract |
| `load_outcome_receipt` | Read | `memory:read` | Latest or selected compact session result |
| `sync_session` | Write | `memory:write` | Saves durable session outcomes without copying a raw conversation |
| `record_progress` | Write | `memory:write` | Updates an owned task and optional evidence |
| `save_artifact` | Write | `research:write` | Links artifact metadata to an owned project |
| `save_research_note` | Write | `research:write` | Saves a note linked to an optional accessible passage |
| `save_research_claim` | Write | `research:write` | Saves an assistant claim as unverified with exact passage links |
| `save_decision` | Standalone action | — | User records an accepted decision in Continuum; not registered remotely |
| `record_learning_evidence` | Write | `learning:write` | Updates transfer only for correct unseen assessment evidence |
| `propose_goal_change` | Propose | `goals:write` | Creates an expiring creation/change proposal |
| `propose_project_change` | Propose | `research:write` | Creates an expiring creation/change proposal |
| `propose_task_change` | Propose | `goals:write` | Creates an expiring creation/change proposal |
| `propose_schedule_change` | Propose | `schedule:propose` | Records a plan/change without mutating schedule blocks |
| `confirm_proposal` | Standalone action | — | User confirms in Continuum Activity; not registered remotely |
| `commit_schedule_change` | Write | `schedule:commit` | Applies a separately confirmed internal schedule proposal; no calendar claim |
| `start_resource_activity` | Write | `memory:write` | Saves a guided resource handoff before the user leaves |
| `complete_resource_activity` | Write | `memory:write` | Records return/evidence without granting mastery |
| `route_specialist_task` | Invoke | `routing:invoke` | Uses a server provider only for a justified specialist or verification task |

There are 29 shared action definitions and 27 can be registered as remote MCP tools. `save_decision` and `confirm_proposal` are deliberately standalone-only so an assistant cannot assert that the user approved its own high-impact change. Tools outside the granted scopes are also omitted from that MCP session, reducing exposure and schema tokens. Successful calls return one concise text summary and structured content rather than duplicating a full JSON dump in text.

## Resources and prompts

Stable resources include the profile, active goals, individual goals, today’s schedule, projects and claims, learning state, and recent memory. Their handlers use the same authenticated Store as the standalone app.

Prompts such as `resume-active-project` guide the host to call selector tools first, load only the selected entity, and sync a compact receipt at the end. Prompts are guidance; tools and stored records remain the source of truth.

## Claude setup

1. Deploy Continuum at a public HTTPS origin.
2. Set `APP_BASE_URL` and `MCP_OAUTH_ISSUER_URL` to that exact origin.
3. Set a random `MCP_JWT_SIGNING_SECRET` of at least 32 characters.
4. Apply database migrations and create a Continuum account.
5. In Claude’s custom connector UI, add `https://<origin>/api/mcp`.
6. Complete Continuum sign-in and approve the minimum needed scopes.
7. In Continuum Integrations, verify that the connection and permissions appear.
8. Test `list_projects` → `load_project` → `sync_session`; reload the app and verify the receipt appears.
9. Revoke the connection in Continuum and confirm the next MCP request is rejected.

Claude custom connectors require a remotely reachable server; localhost must be exposed through an HTTPS development tunnel for host-side testing.

## ChatGPT scope

ChatGPT MCP is intentionally not presented as a working product integration in this release. The protocol choices are designed for future interoperability, but account-side compatibility and UX have not been accepted here. See [ChatGPT future scope](chatgpt-mcp.md).
