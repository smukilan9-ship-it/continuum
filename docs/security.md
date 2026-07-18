# Security and privacy

## Secrets

Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` may enter browser bundles. Service-role, database, provider, OAuth signing, and demo tokens remain server-only.

## MCP authorization

- OAuth authorization code flow requires PKCE S256.
- Access tokens expire after one hour.
- Refresh tokens rotate on use.
- Revocation is checked before tool execution.
- Read and write scopes are distinct.
- Every tool checks its required scope server-side.
- `commit_schedule_change` also requires `confirmedBy` and `confirmedAt` metadata.
- The local demo token path is behind `demo_token` and has no production default.

The checked-in OAuth implementation uses a stateless signed grant plus a development revocation set. Production should persist token hashes and revocation state in `oauth_tokens`, as defined by the Drizzle schema, so revocation remains durable across serverless instances.

## Source isolation and prompt injection

- PDF/text input is size- and MIME-limited.
- Text is normalized, null bytes removed, and known instruction patterns marked.
- Documents are passed to models only as quoted untrusted evidence.
- Document text cannot select or invoke a tool.
- Tools are allowlisted and arguments are Zod-validated.
- Deleted sources are filtered before retrieval.
- Source-locked mode returns an explicit unsupported result when no chunk matches.

## Student privacy

Continuum collects the minimum academic state necessary for the user’s goal. It does not sell data or contain advertising. Users can inspect, correct, obsolete, delete, and export memories. Context packing selects only records relevant to the current objective. Unrelated private projects are excluded by default.

## Academic integrity

Research tools connect claims to evidence, expose uncertainty, compare sources, and critique reasoning. They do not label model-generated scholarship as user-authored work. Generated records store creator, model/provider, prompt version, verification state, and supersession history.
