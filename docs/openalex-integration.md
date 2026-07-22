# OpenAlex integration

Status: adapter contract **fixture-tested**; UI contract **Playwright-tested**; live
OpenAlex is **unavailable locally** because `OPENALEX_API_KEY` is not configured.

`OpenAlexProvider` calls the official Works API. Keyword search uses `search`; title
and author use documented filters; DOI mode requests the DOI work; related work uses
`related_to`. Requests include the server-only API key, a bounded `per-page`, and a
field `select`. Year and open-access filters are translated to OpenAlex filters.

The adapter reconstructs abstracts from the inverted index and normalizes IDs, DOI,
authorships, venue, year, citations, OA/full-text links, topics, institutions, type,
references, and related works. It never exposes the API key to the browser.

Unconfigured, timeout, rate-limit, and upstream failures become typed provider
states rather than fake empty success. A real deployment must set
`OPENALEX_API_KEY`; no Google OAuth is used. The release suite avoids claiming a
live call: unit fixtures verify the official response contract and Playwright uses a
named normalized fixture before exercising the real authenticated save endpoint.
