# Claude remote MCP contract

Continuum exposes the official MCP SDK over stateless Streamable HTTP at `/mcp`. In production, connect Claude to `https://<continuum-domain>/mcp` as a custom connector. `/api/mcp` remains a compatibility alias. Claude discovers OAuth metadata, registers a public PKCE client, opens the Continuum authorization page, and receives only the scopes approved by the signed-in user.

The Integrations screen shows current client IDs, names, scopes, connection time, expiry, and revocation controls. Revocation is checked before every request.

## Tools

Every tool is named for a question a user would ask, not for the operation
behind it, and each is written so a model can pick the right one from the
description alone. Fifteen are registered; every documented workflow completes
in at most two calls.

| Tool | Class | Required scope | Answers |
|---|---|---|---|
| `find_in_continuum` | Read | `memory:read` | "What do I have about X?" Searches goals, projects, sources, papers, notes, decisions, conversations, and concepts in one call |
| `get_my_current_work` | Read | `memory:read` | "What am I working on?" Active goals, today's blocks, current tasks, recent decisions, and the best next action |
| `open_goal` | Read | `goals:read` | One goal in full: outcome, deadline, progress, milestones, tasks, blockers |
| `open_project` | Read | `research:read` | One project in full: papers, sources, claims, decisions, open questions |
| `read_source_passage` | Read | `research:read` | The exact passage behind a citation, with a stable reference |
| `get_evidence_for_claim` | Read | `research:read` | Supporting and contradicting passages for one claim, with evidence status |
| `whats_changed` | Read | `memory:read` | "Pick up where we left off." Resumes from the last saved session when no time is given |
| `get_study_status` | Read | `learning:read` | What the user knows, which misconceptions are open, and what would move each forward |
| `suggest_next_resource` | Read | `resources:read` | One specific next resource, ranked, with a way to check completion |
| `start_study_session` | Write | `memory:write` | Records a resource handoff so the return can be checked against the task |
| `record_practice_result` | Write | `learning:write` | Records a real attempt; closes its resource activity in the same call |
| `save_to_continuum` | Write | `research:write` | Saves a note, an evidence-linked claim, or an artifact into a project |
| `save_progress_note` | Write | `memory:write` | Appends a progress checkpoint. Cannot mark work complete |
| `save_session_summary` | Write | `memory:write` | Saves what the session accomplished so the next one can resume |
| `propose_change` | Propose | per target | Proposes a goal, task, project, or schedule change for the user to approve |

`propose_change` is measured against the scope its target actually needs —
`schedule:propose` for a schedule change, `research:write` for a project — so a
grant cannot be widened by choosing a different target.

Two tools degrade rather than fail when a grant is narrow: `find_in_continuum`
searches only research if `research:read` was approved, and reports which
sources it searched; `get_my_current_work` omits the schedule without
`schedule:read`.

### Not available to an assistant

`save_decision`, `confirm_proposal`, and `commit_schedule_change` are
standalone-only. Accepting a decision, confirming a proposal, and committing a
schedule are the signed-in user's actions, and an assistant must not be able to
assert that the user approved its own change. Nothing an assistant calls can
mark work complete: `save_progress_note` has no `done` status, and completion
goes through `propose_change`.

### Superseded operations

Thirty-three low-level operations preceded this set — `load_context`,
`get_context_pack`, `list_projects`, `record_approved_update` and the rest —
where six existed only to feed six others, so a real workflow cost three to five
chained calls. They remain callable by name so an in-flight request does not
fail, but are withdrawn from what a client discovers. `route_specialist_task`
was removed outright: it asked the calling model to route its own reasoning back
through Continuum, which spent budget, served no user outcome, and made tool
selection harder.

Tools outside the granted scopes are omitted from the session entirely, reducing
exposure and schema tokens. Successful calls return one concise text summary
plus structured content, and discovery tools carry a `suggestedNext` sentence so
a workflow does not stall.

## Resources and prompts

Stable resources include the profile, active goals, individual goals, today’s schedule, projects and claims, learning state, and recent memory. Their handlers use the same authenticated Store as the standalone app.

Prompts such as `resume-active-project` guide the host to call selector tools first, load only the selected entity, and sync a compact receipt at the end. Prompts are guidance; tools and stored records remain the source of truth.

## Claude setup

1. Deploy Continuum at a public HTTPS origin.
2. Set `APP_BASE_URL` and `MCP_OAUTH_ISSUER_URL` to that exact origin.
3. Set a random `MCP_JWT_SIGNING_SECRET` of at least 32 characters.
4. Apply database migrations and create a Continuum account.
5. In Claude’s custom connector UI, add `https://<origin>/mcp`.
6. Complete Continuum sign-in and approve the minimum needed scopes.
7. In Continuum Integrations, verify that the connection and permissions appear.
8. Test `list_projects` → `load_project` → `sync_session`; reload the app and verify the receipt appears.
9. Revoke the connection in Continuum and confirm the next MCP request is rejected.

Claude custom connectors require a remotely reachable server; localhost must be exposed through an HTTPS development tunnel for host-side testing.

## ChatGPT scope

ChatGPT MCP is intentionally not presented as a working product integration in this release. The protocol choices are designed for future interoperability, but account-side compatibility and UX have not been accepted here. See [ChatGPT future scope](chatgpt-mcp.md).
