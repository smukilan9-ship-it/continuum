# Continuum final completion report

Date: 2026-07-27
Production alias: `https://continuumstudy.vercel.app`
Final deployment: `dpl_8aBz1fyeJw8c96hFXzgBkLrq9fk7`

## A. Completed implementation

- Replaced the Obsidian mirror with a revisioned, bidirectional synchronization
  protocol and an Obsidian desktop plugin.
- Added automatic Assistant-memory export after explicit review and approval.
- Added open native username/password registration, password change, session
  management, account export, and account deletion.
- Removed Google OAuth routes, UI, environment configuration, documentation,
  and identity storage.
- Added Zotero API v3 library, collection, item, attachment, PDF-link,
  incremental-sync, and Continuum-linking contracts and UI.
- Added OpenAlex works, authors, institutions, sources, topics, references,
  citations, related works, caching, saved entities, citation graph, and Zotero
  matching.
- Added bounded image/scanned-PDF question extraction, region/diagram
  retention, provenance, editable review, practice, grading, and resume.
- Rebuilt Assistant and Code workspaces while preserving direct, model-free
  browser execution.

## B. Obsidian architecture and verification

The public server never accesses a vault filesystem. Neon stores canonical
records, versions, durable operations, conflicts, and sync settings. The local
Obsidian plugin watches the user-selected folders, authenticates with a scoped
token stored in Obsidian SecretStorage, and pulls/pushes over HTTPS.

Each note carries a stable record ID and sync ID plus schema, type, pseudonymous
owner fingerprint, local/server/common revisions, content hash, timestamps,
origin, and deletion state. Operations have durable IDs, idempotency keys,
attempt counts, retry time, errors, completion, and bridge acknowledgement.
Conflicts preserve both bodies and paths and support Continuum, Obsidian,
manual merge, duplicate-both, and postpone resolutions. Deletes are tombstones;
the default vault behavior writes a timestamped backup and archives the note.

Path input is normalized and rejects absolute paths, empty segments, traversal,
and NULs. The plugin limits synchronized notes to Markdown, excludes its backup
tree, limits note size, detects duplicate sync IDs, and stores no bearer token
in plugin data.

Real-vault evidence used Obsidian 1.12.7 and:

`/Users/mukilan/claude-memory/claude-memory`

- Continuum create produced a real structured Markdown memory.
- An Obsidian edit reached Neon and advanced all revisions.
- External rename was coalesced into one `rename` operation; no delete or
  duplicate was produced.
- A simultaneous stale edit produced a preserved conflict and blocked record.
- Production conflict resolution accepted the explicit Obsidian version.
- A fresh create/delete test archived the local note, retained a timestamped
  backup, acknowledged one delete operation, and ended at local/server/common
  revision 2 with no blocked state.
- Restart, closed-app edit discovery, queue persistence, and repeated sync were
  exercised in the desktop app.

## C. Zotero architecture and live verification

Zotero uses a dedicated API key encrypted per user on the server. The browser
receives capability and masked-connection metadata, never the key. API v3
contracts cover personal and permitted group libraries, collections/nesting,
top-level and collection item traversal, search/filter/sort/pagination,
attachments, stored-file metadata, Zotero Web/API links, incremental library
versions, tombstones, and idempotent upserts. Items can be linked to Continuum
projects, concepts, notes, and OpenAlex works using DOI-first deduplication.

Real-account evidence is limited. The pre-rotation immutable deployment
successfully authenticated and completed a live personal-library sync
(`scanned=0`, `indexed=0`, `hasMore=false`), proving the connected account but
also proving that the accessible personal library was empty. The final
production deployment cannot decrypt that earlier ciphertext after the
encryption key was rotated; the UI now reports this precisely and requires a
replacement dedicated Zotero key. No real group-library or stored-PDF item was
available for strongest-environment verification.

## D. OpenAlex expansion

The product supports global multi-entity search and dedicated details for
works, authors, institutions, sources, and topics. Work details expose
authorships, abstract reconstruction, DOI, OA status/locations, references,
citing works, related works, topics, concepts, retraction state, and a bounded
citation graph. Responses are cached with entity-aware TTLs; saved entities and
Zotero matches are user-scoped.

Real direct OpenAlex evidence:

- Works search 1.761 s; work detail 2.597 s; citing works 1.002 s.
- Verified 13 references, 10 related works, 63,943 citing count, abstract
  inverted index, green OA status, and five locations on the selected work.
- Author search/detail: 0.414/0.711 s.
- Institution search/detail: 1.036/0.847 s.
- Source search/detail: 0.918/0.969 s.
- Topic search/detail: 0.602/0.664 s.
- Retracted and closed-access edge responses were also verified.

## E. Authentication lifecycle

Google OAuth is removed. The hackathon release uses open username/password
registration, password history, session listing and revocation,
current-password change, JSON export, and confirmed deletion. No email address
or delivery provider is required.

Email verification and self-service password recovery are explicitly deferred
until after the hackathon. Users are warned to retain their password.

Production verification on 2026-07-28 created a disposable username, received
an authenticated session, signed out, signed back in with the same password,
and deleted the account. The observed status sequence was
`201 / 200 / 200 / 200 / 200`; `/api/health` remained HTTP 200 `ready`.

## F. Image question extraction

PNG, JPEG, WebP, and scanned PDF inputs are signature-, pixel-, page-, and
size-bounded. Extraction creates cached page/region records, associates
retained diagram crops, treats OCR/vision text as untrusted evidence, and
records whether answers were extracted, user-provided, inferred, or
unavailable. The review UI allows prompt, answer, explanation, type, choices,
and difficulty edits before saving. Practice, source-grounded grading,
attempt persistence, and resume are verified. Fine-grained split/merge editing
of detected regions is not implemented.

## G. Verification evidence

### Real external verification

- Obsidian desktop vault: create, edit, rename, conflict, resolution,
  tombstone, backup, archive, revisions, and bridge acknowledgements.
- OpenAlex live API: all core entity types and work graph fields listed above.
- Zotero: authenticated live personal sync through the immutable pre-rotation
  deployment; library empty.
- Production OAuth: callback received, state preserved, token exchanged, MCP
  initialized, callback form allowed, and popup relationship allowed.

### Production-build verification

- Vercel deployment `dpl_3voeD87CxSC1dinCVvG7YM8GsnyM` is READY and aliased.
- 41 static/dynamic application pages generated; all server functions built.
- OAuth CSP includes HTTPS/loopback `form-action`; COOP is `unsafe-none`.

### Automated tests

- Unit/contract: 226/226 tests across 35 files.
- Typecheck: 8/8 packages.
- Lint: 8/8 packages, zero warnings.
- Build: 8/8 packages.
- Browser E2E: 13/13 journeys in one uninterrupted 4.8-minute run.

The browser suite uses real Neon persistence and real browser/WASM execution.
OpenAlex discovery and Ollama are protocol-faithful mocks in their respective
UI-contract tests; direct OpenAlex was separately live-tested.

## H. Security report

| Severity | Component / impact | Fix and verification | Remaining risk |
|---|---|---|---|
| Critical | Claude OAuth could remain on `Connecting…` | Exact redirect handling, HTTPS-capable `form-action`, `unsafe-none` COOP; production loopback verifier passes end to end | Claude service-side outages remain external |
| High | Obsidian could miss type-mapped edits or misread external rename as delete | Managed-folder expansion, delayed delete coalescing, stable-ID relocation, path-preserving conflict resolution; real vault edit/rename/delete passed | Full OS/filesystem diversity is not exhaustively tested |
| High | Simultaneous sync edits could overwrite | Common-base revisions, version history, blocked conflict, explicit resolution | Structured auto-merge is intentionally conservative |
| High | Old Zotero ciphertext became unreadable after key rotation | Explicit reconnect error; key remains server-only | User must replace the Zotero key |
| Medium | Self-service account recovery is not in the hackathon scope | Login UI states the limitation and accounts can change passwords while signed in | Add managed verified recovery before broad public launch |
| Medium | First Assistant message could be hidden by stale session load | Sequence invalidation and created-session load suppression; E2E passes | None known |
| Medium | Test/runtime state could select stale Code content | State-aware E2E interactions; direct execution unchanged | Persisted user code remains intentionally durable |
| Medium | Image content could inject instructions | Bounded parser, untrusted-content labeling, no tool/key access | OCR/model extraction can still require user correction |

Platform Gemini, Featherless, and Groq credentials remain server environment
variables. Server routes open only the selected request-scoped credential.
Browser storage, HTML, API responses, screenshots, and source code contain no
platform secret. User BYOK is Assistant-only, encrypted, scoped to that user,
and never mutates process-global environment state.

## I. Performance report

Final integrated browser sample:

| Metric | Result |
|---|---:|
| Code page ready | 1,026 ms |
| Editor ready | 2,059 ms |
| Trivial JavaScript median (3 runs) | 207 ms |
| Trivial execution timeouts | 0/3 |
| File preview ready | 194 ms |
| Repeat navigation | 151 ms |

The optimized build reports 126 kB first-load JavaScript and 103 kB shared.
Production probes measured 0.331 s TTFB for OAuth metadata, 1.395 s for login,
and 0.592 s for the intentionally failing health check. These are samples, not
production p95/SLO measurements.

## J. Account-deletion evidence

Deletion first marks `deletion_requested_at`, removes private Blob paths for
source uploads, project artifacts, and image-extraction assets, then deletes in
foreign-key-safe order:

- AI/audit: `model_usage`, `model_routes`, `ai_request_leases`, `audit_log`.
- OAuth/auth: `oauth_tokens`, `oauth_grants`, `oauth_connections`,
  `auth_tokens`, `password_history`, `app_sessions`, `user_credentials`.
- Integrations: `integration_tokens`, `integrations`, Zotero libraries,
  collections, and items.
- Sync: conflicts, operations/background jobs, versions, records, synchronized
  documents, and settings.
- Assistant/code/questions: sessions, messages, workspaces, banks, attempts,
  and image extractions.
- Research/files: evidence, claims, notes, decisions, papers, artifacts,
  chunks, sources, projects, saved external entities.
- Memory/learning: proposals, access log, chunks, records, receipts, events,
  activities, misconceptions, attempts, and mastery state.
- Planning: schedule blocks, dependencies, tasks, milestones, constraints, and
  goals.
- Identity: profile and user row last.

Export covers the same user-visible classes but excludes secrets, password
material, token hashes, ciphertext, leases, and raw session tokens. Unit and
route contracts verify deletion order and preservation-vs-local-delete choice.
A destructive live deletion was not performed on the connected real account.

## K. Files changed

Major additions include migration `0008_completion_systems.sql`, Assistant,
OpenAlex, account lifecycle, question-image and Obsidian sync routes/screens,
the sync engine, account export/deletion, Zotero/OpenAlex
adapters, Obsidian domain schema/plugin, and production OAuth verifier.

Major modifications include authentication, provider routing, Store/repository
schema, Learn/Code/Assistant/Connections UI, security headers, deployment
configuration, E2E journeys, integration docs, and security documentation.
Google OAuth routes and helper code were removed.

## L. Setup and migration

1. Migration `0008_completion_systems.sql` is already applied to Neon; nine
   migration journal entries are present.
2. Replace the Zotero credential with a new dedicated read key; then run
   personal/group/collection/attachment/PDF live verification.
3. Install `apps/obsidian-plugin` in the vault, copy a fresh `ctm_obs_…` token,
   run “Pair using token from clipboard,” select mappings/deletion behavior,
   and complete initial sync.
4. Keep `MCP_JWT_SIGNING_SECRET`, `SESSION_PRIVACY_SALT`, and
   `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY` distinct and sensitive in Vercel.
5. Claude callback allowlisting must use:
   `https://claude.ai/api/mcp/auth_callback` and
   `https://claude.com/api/mcp/auth_callback`.

## M. Remaining limitations

1. Email verification and self-service password recovery are future work.
2. The existing Zotero key must be replaced after encryption-key rotation.
   Real groups, non-empty collections, attachments, and stored PDFs were not
   available for live proof.
3. Obsidian was deeply exercised on one macOS vault, not the requested full
   cross-platform 30-case matrix.
4. Image region split/merge review is absent.
5. Account deletion is contract-tested but was not destructively run on the
   connected real account.
6. Production performance is sampled, not measured as p95 under load.

The first item is an explicit hackathon scope decision. The remaining items are
known verification or product-completeness gaps.

## N. Final verdict

**Hackathon shippable**

The Claude OAuth infinite connection loop is fixed and production-verified,
the core application passes all automated gates, and public username/password
registration requires no external email service. A broader public launch
should add managed recovery and complete the remaining Zotero and cross-platform
verification work.
