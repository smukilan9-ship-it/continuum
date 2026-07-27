# Obsidian sync

Status: the local plugin and revisioned bidirectional synchronization protocol
are **implemented, build-verified, and exercised in a real macOS vault**.

Obsidian is a local mirror, not Continuum's database. The plugin uses Obsidian
SecretStorage for its token, requires HTTPS except loopback development, defaults to
manual sync and one chosen folder, and caps every file at 10 MB. Whole-vault scope is
explicit opt-in.

Each managed note carries stable record and sync IDs, local/server/common
revisions, content hashes, origin, and deletion state. Push and pull use durable
idempotent operations with retry metadata and bridge acknowledgement. External
renames retain identity, while deletions become tombstones. Generated Continuum
files are excluded from overwrite loops and ordinary notes are never replaced.

Concurrent stale edits create a blocked conflict that preserves both bodies and
paths. Resolution choices include Continuum, Obsidian, manual merge,
duplicate-both, and postpone. The default deletion policy creates a timestamped
backup and archives the local note.

Postgres remains canonical for ownership, transactions, revisions, retrieval,
auditing, MCP, and revocation. The real-vault completion pass covered create,
edit, rename, simultaneous conflict, explicit resolution, delete/archive,
restart, closed-app edit discovery, queue persistence, and repeated sync. Full
cross-platform filesystem coverage remains future verification work. Install
and build details remain in `apps/obsidian-plugin/README.md` and
`docs/obsidian.md`.
