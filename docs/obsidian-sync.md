# Obsidian sync

Status: local plugin is **implemented and build-verified**; installation inside the
user's Obsidian desktop is **not verified in this environment**.

Obsidian is a local mirror, not Continuum's database. The plugin uses Obsidian
SecretStorage for its token, requires HTTPS except loopback development, defaults to
manual sync and one chosen folder, and caps every file at 10 MB. Whole-vault scope is
explicit opt-in.

Push indexes readable user-owned files through Continuum's authenticated ingestion
path. Generated Continuum files are excluded from the push loop. Pull incrementally
mirrors stable packs into `Continuum/Context Packs/<stable-id>.md`, compares generated
content, skips unchanged files, and reports created/updated/skipped counts. A target
must carry `continuum_generated: true`; an ordinary note is never overwritten.

The generated Markdown contains stable pack ID, timestamp, privacy, token estimate,
provenance, policy, and compact JSON. Postgres remains canonical for ownership,
transactions, retrieval, auditing, MCP, and revocation. Install/build details remain
in `apps/obsidian-plugin/README.md` and `docs/obsidian.md`.
