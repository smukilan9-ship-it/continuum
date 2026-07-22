# Research discovery

Status: **fixture-tested and browser-tested**; live availability depends on provider
configuration and upstream health.

`GET /api/research/discovery` accepts a 2–500 character query, mode (`keywords`,
`title`, `author`, `doi`), provider, open-access flag, and bounded years. Auth,
per-user rate limiting, an eight-second provider timeout, bounded retry for 429/5xx,
and a private ten-minute result cache apply. Components never consume raw provider JSON.

Both providers emit `NormalizedScholarlyWork`: provider ID, normalized DOI, title,
authors, year, venue, abstract when available, citations, access URLs, topics,
institutions, type, retrieval time, and reference/related IDs. Deduplication prefers
DOI, then normalized title/year, retaining the richer abstract/citation metadata.

`POST /api/research/discovery` validates the complete normalized record, enforces
same-origin auth and project ownership, saves only metadata fields required by the
paper table, and appends provider provenance to the audit event. Duplicate saves are
idempotent. There is no Google Scholar fetch or scraping code path.

Tests cover OpenAlex/Crossref normalization, filters, retry/error states,
deduplication, Scholar URL construction, and the browser discovery/save flow. The
Playwright OpenAlex result is explicitly a contract fixture; its POST save is real.
