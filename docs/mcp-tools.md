# MCP contract

Endpoint: `/api/mcp` using the official MCP TypeScript SDK and stateless Streamable HTTP transport.

Every success returns a human summary plus structured data, entity IDs, freshness, evidence IDs, permission information, and an optional next-tool hint.

| Tool | Class | Required scope | Important behavior |
|---|---|---|---|
| `get_current_context` | Read | `memory:read` | Compact active goals, plan, blockers, decisions, learning state, next actions |
| `search_academic_memory` | Read | `memory:read` | Relevant records only; optional goal/project filters |
| `get_goal_state` | Read | `goals:read` | Milestones, progress, risk, blockers, next actions |
| `get_learning_state` | Read | `learning:read` | Multidimensional mastery plus evidence and misconceptions |
| `get_today_plan` | Read | `schedule:read` | Blocks, flexibility, deadlines, free capacity |
| `search_research_library` | Read | `research:read` | Papers, notes, claims, exact evidence passages |
| `get_claim_evidence` | Read | `research:read` | Exact supporting/contradicting passages and IDs |
| `recommend_resource` | Read | `resources:read` | Ranked resource and selection rationale |
| `record_progress` | Write | `memory:write` | Appends a checkpoint event and audit entry |
| `save_decision` | Write | `research:write` | Preserves superseded decisions |
| `save_research_note` | Write | `research:write` | Connects a note to project/source/chunk |
| `create_task` | Write | `goals:write` | Creates structured goal task |
| `propose_schedule_change` | Propose | `schedule:propose` | Deterministic proposal; no external commit |
| `commit_schedule_change` | Write | `schedule:commit` | Rejects without explicit confirmation metadata |
| `update_learning_checkpoint` | Write | `learning:write` | Updates mastery only from assessment evidence |
| `route_specialist_task` | Propose | `routing:invoke` | Used only for genuine specialist/modality/verification needs |

## Resources

`continuum://profile`, `continuum://goals/active`, `continuum://goal/{id}`, `continuum://schedule/today`, `continuum://project/{id}/state`, `continuum://project/{id}/claims`, `continuum://learning/{subject}`, `continuum://memory/recent`.

## Prompts

- `resume-active-project`
- `build-today-plan`

Prompts guide the host; tools and resources remain the source of truth.
