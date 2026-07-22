# Learn workspace

Status: native lesson/checkpoint **browser- and Playwright-tested**; YouTube adapter
**fixture-tested**; live YouTube search is **configured but unverified** unless the
deployment provides `YOUTUBE_API_KEY`.

## Product flow

Learn opens on curriculum paths and the strongest current learning signal. The
six-minute native lesson contrasts electric potential with potential energy using
reviewed source content. Reading records exposure but does not raise transfer. An
unseen numerical checkpoint is required before Continuum records transfer evidence.

The resource finder ranks reviewed native and external resources against the goal,
need, time, level, cost, and authority. Starting creates a return contract; opening a
link does not count as learning. On return, evidence is verified or held for review,
then mastery, an outcome receipt, and a spaced follow-up may update.

## Video search

`/api/learning/videos` uses the official YouTube Data API search endpoint, strict
safe search, embeddable/syndicated video filters, bounded results, normalized HTTPS
links, and optional trusted-channel IDs. When the key is absent or the provider fails,
the UI says so and offers a query-only YouTube search handoff. No URL is fabricated
from model text and a video view never changes mastery.

## Ownership fix found by browser testing

The first Playwright run found a legacy hard-coded `goal_physics` event link. The
route now finds a matching Physics/electric-potential goal only inside the signed-in
user's Learn snapshot; otherwise the event remains unlinked. Repository ownership
checks continue to fail closed.
