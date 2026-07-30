# Research discovery

Status: **fixture-tested and browser-tested**; live availability depends on provider
configuration and upstream health.

`GET /api/research/discovery` accepts a 2–500 character query, mode (`keywords`,
`title`, `author`, `doi`), source, open-access flag, bounded years, sort, language,
entity filters, and an OpenAlex cursor. Auth,
per-user rate limiting, an eight-second provider timeout, bounded retry for 429/5xx,
and a private ten-minute result cache apply. Components never consume raw provider JSON.

OpenAlex is the default and primary source; Crossref is an optional DOI-metadata
fallback. Both emit `NormalizedScholarlyWork`: provider ID, normalized DOI, title,
authors, year, venue, abstract when available, citations, access URLs, topics,
institutions, source/journal, language, work type, publication date, OA state,
retraction state, version when supplied, retrieval time, and reference/related IDs.
Deduplication prefers
DOI, then normalized title/year, retaining the richer abstract/citation metadata.

`POST /api/research/discovery` validates the complete normalized record, enforces
same-origin auth and project ownership, saves only metadata fields required by the
paper table, and appends provider provenance to the audit event. Duplicate saves are
idempotent.

Deterministic query planning detects DOI, quoted phrases, author syntax, and years,
removes filler text, and applies only a small reviewed synonym dictionary. OpenAlex
relation endpoints expose related works, citing works, and reference resolution.
Entity search covers authors, institutions, sources, and topics. The UI never
fills in an unavailable abstract, author, DOI, or full-text link.
