# Research workspace

Status: redesign **browser-tested**; metadata save **Playwright-tested**; OpenAlex and
Crossref adapters **fixture-tested**; Crossref was **browser-verified live** locally;
OpenAlex live calls are **unavailable in this environment** without a key.

Research is project-first. One project switcher controls Overview, Discovery, Papers,
Notes, Claims, Experiments, Decisions, and Drafts. Overview surfaces the next
evidence-producing task, project phase, evidence count, accepted interpretation
boundary, and indexed sources. It does not mix global records into a project.

Discovery normalizes OpenAlex and Crossref into one contract, exposes provider
health, deduplicates, and saves only on explicit action. Saved metadata carries DOI,
authors, year, provider payload in the audit event, and project ownership. Exact
source passages remain distinct from metadata-only paper records.

Claims remain unverified until linked to exact passages. Accepted decisions are
explicit user writes. For OASIS, serial-section spatial association is never
presented as same-cell co-expression; the centralized research prompt repeats that
interpretation boundary.

Zotero remains an optional encrypted connection and is **disconnected** until OAuth/
API credentials are supplied. NotebookLM is an **experimental handoff only**. Google
Scholar is a safe manual search URL, never a scraper. See the provider-specific docs.
