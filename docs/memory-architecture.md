# Memory architecture

Status: persistence/retrieval/context packs **unit-, integration-, browser-, and
Playwright-tested** against the configured Postgres store.

Postgres is canonical. User-scoped tables hold goals, tasks, schedule, projects,
papers, sources/chunks, claims/evidence, notes, decisions, learning states, resource
activities, receipts, memory events/records/chunks, audit log, and OAuth grants.
Repository ownership checks run before references are accepted.

Memory has three layers:

1. Current structured state for exact product behavior.
2. Compact outcome receipts and append-only audit/event provenance.
3. Sanitized lexical/vector chunks for relevance retrieval; raw transcripts are not
   copied wholesale.

Stable packs expose the smallest useful handoff: `current_week`,
`current_misconceptions`, `goal:<id>`, and `project:<id>`. Each includes private-account
metadata, record/token estimates, provenance, freshness, Markdown/JSON formats, and
the MCP tool name. `maxTokens` deterministically trims arrays until the estimate is
within budget. Unrelated project history is omitted.

The Memory UI presents current goals/projects, learning evidence, preferences,
accepted decisions, deadlines/questions, and recent outcomes first. Raw receipts and
events are an optional History view. Search combines semantic and lexical relevance
with a token budget and logs access. Delta retrieval returns changes after a cursor.
