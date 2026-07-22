# Google Scholar handoff

Status: URL construction **unit- and browser-tested**. Search retrieval is
**intentionally unavailable**.

Continuum provides only a manual link to
`https://scholar.google.com/scholar?q=<encoded query>`. The query is encoded with
`URL`/`URLSearchParams`, opens in a new tab with `noreferrer`, and does not carry
account credentials or Continuum context beyond the user's query.

There is no Scholar scraper, browser automation, cookie import, CAPTCHA bypass,
result parser, hidden API, or Google OAuth flow. Results are not imported
automatically. A user may discover a record manually and then locate it through
OpenAlex/Crossref or add an owned source through the normal ingestion path.
