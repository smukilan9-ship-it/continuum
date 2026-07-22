# MCP context and approved updates

Status: server/tool contracts **unit-tested**; OAuth+PKCE read-after-write
**Playwright-tested live against localhost**; a third-party Claude account connection
is **configured but unverified in this final pass**.

The Streamable HTTP server exposes 33 canonical tools, 31 remotely accessible.
Context additions are:

- `list_context_packs` — metadata only;
- `get_context_pack` — one owned, token-bounded stable pack;
- `get_context_changes_since` — compact delta retrieval;
- `record_approved_update` — a recent explicitly approved note/progress update only.

The `continuum://context-packs` resource lists available packs. OAuth authorization
code + PKCE, dynamic client registration, short-lived scoped tokens, durable grants,
rate limits, origin checks, and immediate revocation protect the endpoint. Tool input
schemas and repository ownership remain authoritative after scope checks.

Consequential writes still use proposals and explicit confirmation. Accepted
research decisions stay app-only. The Playwright Code journey saves a real checkpoint,
authorizes a read-only MCP client, calls `get_context_pack`, and asserts that the
checkpoint is visible in `current_week`; this is not a mocked MCP response.
