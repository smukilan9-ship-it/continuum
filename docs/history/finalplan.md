# Continuum — Full Product Audit & Redesign Plan

**Target deployment audited:** https://continuumstudy.vercel.app
**Audit date:** 2026-07-28
**Repo:** `/Users/mukilan/Desktop/promotheus` (branch `feat/product-ready-premium-rebuild`)
**Audience:** the engineer/agent (Opus) executing the redesign.

---

## 0. How to use this document

This document is written so the entire redesign can be executed **without re-inspecting the deployed app**. Every defect below was reproduced against the live deployment; every claim is annotated with how it was verified.

Conventions used throughout:

- **[VERIFIED]** — reproduced live against the deployment during this audit, with the exact request/response or DOM state recorded.
- **[SOURCE]** — determined by reading the repository source; file and line references given.
- **[INFERRED]** — a reasoned conclusion that the implementer should confirm with one cheap check. These are rare and always flagged.

Severity levels:

- **P0** — the feature is broken for every user, every time. Ship the fix first.
- **P1** — the feature works but is misleading, confusing, or silently fails in common cases.
- **P2** — polish, consistency, and refinement.

**A hard constraint that governs this whole plan: no capability may be removed.** Every screen, tab, control, and workflow that exists today must still be reachable after the redesign. Where this plan says "move" or "collapse", it means relocate or progressively disclose — never delete. Section 12 contains an explicit inventory you can check the finished work against.

### Audit method (so you can trust the findings)

The audit was performed by driving the real deployment with Playwright against the seeded demo account (`Explore the demo` on `/login`), plus one throwaway registered account to exercise first-run behaviour. For each screen I loaded the route, interacted with every control, and recorded network traffic, console errors, and DOM state. API-level probes were issued from inside the authenticated browser context so they carried real session cookies.

The throwaway account (`audittest883348`) was created to audit registration/onboarding and was **deleted at the end of the audit** via `POST /api/account/delete` (confirmed `{"deleted":true}`). No other data was written to the production database except the demo account's own normal activity (a Code AI request, an Assistant message, and a schedule draft — all reversible demo-account state).

### Things I checked that turned out to be fine

Recording these so you don't waste time "fixing" non-problems:

- **No horizontal overflow at 390 px** on `/today`, `/code`, `/openalex`, `/research`. [VERIFIED]
- **No console errors or unhandled page errors** on any of the 12 workspace routes. [VERIFIED]
- **Landing page renders correctly** end to end (10,146 px, 11 sections). An all-black frame observed early in the audit was a browser-pane compositing artifact, not a rendering bug. [VERIFIED]
- **No duplicated DOM** on clean page loads. An earlier "duplicate section" reading was a nested-`<details>` selector artifact. [VERIFIED]
- **Landing nav anchors all resolve** — `#features`, `#workflow`, `#security`, `#research`, `#learn`, `#projects`, `#assistant`, `#final-cta` all exist. [VERIFIED]
- **The Zotero library really is empty upstream** (`{"items":[],"total":0}` from the Zotero API for library `21106630`). The empty state is correct behaviour, not a bug. [VERIFIED]
- **Account screen is feature-complete** — data export (an `<a href="/api/account/export">`) and account deletion (a two-stage modal with typed `DELETE` confirmation) are both present and wired. [SOURCE: `account-screen.tsx:62,65,70-71`]
- **The deterministic scheduler produces genuinely good output** — 25 blocks across 7 days with protected fixed commitments, drag handles, and per-block edit affordances. This is one of the strongest parts of the product. [VERIFIED]

---

## 1. What Continuum is today

A single-page academic workspace with 12 views behind one client-side shell.

| View | Route | Sidebar group | Sidebar label |
|---|---|---|---|
| today | `/today` | Workspace | Today |
| assistant | `/assistant` | Workspace | Assistant |
| goals | `/goals` | Workspace | Plan |
| learn | `/learn` | Workspace | Learn |
| code | `/code` | Workspace | Code |
| research | `/research` | Workspace | Research |
| memory | `/memory` | Library | Memory |
| zotero | `/zotero` | Library | Zotero |
| openalex | `/openalex` | Library | OpenAlex |
| activity | `/activity` | Library | Review |
| integrations | `/integrations` | Account | Connections |
| account | `/account` | Account | Account & Security |

[SOURCE: `apps/web/lib/workspace-routes.ts`, `apps/web/components/continuum-app.tsx:42-70`]

**Architecturally important:** navigation does **not** use the Next.js router. `ContinuumApp` keeps `currentView` in React state, calls `window.history.pushState`, and swaps the rendered screen from a per-view cache. [SOURCE: `continuum-app.tsx:117-125`] This is fast, and it is also the direct cause of defect **F-06** below. Any navigation work must respect this design or replace it wholesale.

---

# PART A — FUNCTIONAL DEFECTS

## 2. OpenAlex (priority area)

The user's report was "some features return HTTP 400 and some workflows appear broken." Both are real, and they are **two independent bugs with different root causes**. There is also a third, quieter bug that makes the first two hard to diagnose.

**Net effect today: of the five OpenAlex entity types, Works search is completely dead, and the detail panel and citation graph are dead for all five.** What still works is entity *search* for authors, institutions, sources, and topics — you can get a result list and nothing more. Clicking any result fails.

### 2.1 Evidence table

Every row reproduced live from inside the authenticated session.

| Request | Result | Notes |
|---|---|---|
| `action=search&kind=works&q=quantum annealing` | **502** `{"error":"OpenAlex returned HTTP 400."}` | [VERIFIED] |
| `action=search&kind=works&q=photosynthesis` ×6 consecutive | **502** ×6 | Fully deterministic, not flaky [VERIFIED] |
| `action=search&kind=works&q=cell` (+/- `sort`, +/- `cursor`, +/- filters) | **502** in every combination | Param shape is not the trigger [VERIFIED] |
| `action=search&kind=authors&q=hinton` | **200**, 19 results | [VERIFIED] |
| `action=search&kind=institutions&q=stanford` | **200**, 16 results | [VERIFIED] |
| `action=search&kind=sources&q=nature` | **200**, 25 results | [VERIFIED] |
| `action=search&kind=topics&q=machine learning` | **200**, 25 results | [VERIFIED] |
| `action=detail&kind=works&id=W2741809807` | **502** raw SQL error | [VERIFIED] |
| `action=detail&kind=authors\|topics\|institutions\|sources&id=…` | **502** raw SQL error | All four kinds [VERIFIED] |
| `action=graph&…&direction=references\|cited_by\|related` | **502** raw SQL error | All three directions [VERIFIED] |
| `action=saved` | **200** `{"saved":[]}` | The only fully working action [VERIFIED] |
| `action=search&kind=works&q=a` | **400** "Enter at least two search characters." | Correct validation [VERIFIED] |
| `/api/research/discovery?mode=keywords&provider=openalex&q=…` | **200** every time | **Different client, same upstream** [VERIFIED] |

### 2.2 Defect F-01 (P0) — Works search always fails with upstream HTTP 400

**Reproduce:** Sign in → OpenAlex → keep the default **Works** tab → type any query → Search. A red banner reads `OpenAlex returned HTTP 400.` and zero results render. [VERIFIED]

**What is *not* the cause** (each ruled out experimentally, so don't re-investigate):

- Not the query text — 5 different queries, all fail.
- Not `sort` — fails with and without `sort=citations`.
- Not `cursor` — fails with and without `cursor=*`.
- Not `filter` — fails with and without year/open-access filters.
- Not an invalid API key — a deliberately bogus key returns **401** `{"error":"Invalid or missing API key"}`, not 400, and the other four entity types authenticate fine with the deployment's real key. [VERIFIED via curl]
- Not intermittency — six consecutive identical requests all failed.
- Not the public API rejecting the request shape — the identical URL **without** `api_key` returns 200 with 25 results. [VERIFIED via curl]

**A trap to be aware of:** two early probes appeared to succeed (`q=cell&toYear=2024`). They returned the response header `x-continuum-cache: fresh` — they were **stale cache rows** in `external_api_cache` from an earlier working period, not live successes. `cachedOpenAlex` serves cached payloads before ever contacting OpenAlex. Any verification of this fix must use a novel query string or clear the cache, or you will fool yourself exactly as this audit nearly was. [VERIFIED]

**What the evidence points to.** The request that fails is `GET /works?search=…&per_page=…&cursor=*[&filter][&sort]&api_key=…`. The requests that succeed are (a) the same shape against `/authors`, `/institutions`, `/sources`, `/topics`, and (b) `/works` with `filter=` and **no** `search=` (proven indirectly: the `detail` and `graph` actions call `/works?filter=…` and get *past* the OpenAlex call — they fail later, at the database step in F-02). So the failing combination is specifically **`search=` on `/works` while authenticated with this deployment's `api_key`**. [VERIFIED]

The other OpenAlex client in this codebase issues `search=` against `/works` and **succeeds** every time. The differences in how it builds the request are:

| | `lib/openalex.ts` (**fails**) | `lib/scholarly.ts` `OpenAlexProvider` (**works**) |
|---|---|---|
| page-size param | `per_page` | `per-page` |
| `select` projection | *absent* | `select=id,doi,display_name,…` |
| cursor | always `cursor=*` | only when paging |

[SOURCE: `lib/openalex.ts:226-235` vs `lib/scholarly.ts:249-289`]

The most probable upstream cause is the **missing `select` projection**: without it, `/works` returns every field including `abstract_inverted_index` and `referenced_works` for 25 records, which is the heaviest possible response on the premium endpoint. [INFERRED] But do not spend time proving this — the fix below makes the question moot, and step 1 of the fix will print the real reason on the first attempt.

#### Fix F-01

**Step 1 — stop swallowing the upstream error (do this first; it is 5 lines and it turns every future OpenAlex bug from a guess into a fact).**

In `lib/openalex.ts`, `requestOpenAlex` already parses the OpenAlex JSON body and then throws it away:

```ts
const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
if (response.ok) return payload;
…
throw new Error(`OpenAlex returned HTTP ${response.status}.`);
```

[SOURCE: `lib/openalex.ts:96-102`]

OpenAlex returns a descriptive body on errors (`{"error": "...", "message": "..."}`). Include it:

```ts
const detail = [payload.error, payload.message].filter((v) => typeof v === "string").join(" — ");
throw new OpenAlexUpstreamError(
  response.status,
  detail || `OpenAlex returned HTTP ${response.status}.`,
);
```

Log `{ status, detail, path, params_without_api_key }` server-side. **Never** log or return `api_key`.

**Step 2 — delete the duplicate client.** This codebase has two OpenAlex HTTP clients. One is broken, one is proven working, and they will keep drifting. Make `lib/scholarly.ts`'s `OpenAlexProvider` the single client and re-express `lib/openalex.ts`'s five functions (`searchOpenAlex`, `openAlexDetail`, `openAlexWorksForEntity`, `openAlexCitationGraph`, plus entity-kind support) on top of it. Concretely:

- Add `searchEntities(kind, query, limit, cursor)` to `OpenAlexProvider` covering all five kinds (it already has an entity-search method used by `/api/research/discovery?entityType=`).
- Every `/works` request must send the `select` projection and `per-page` (hyphen), matching the shape that is proven to work.
- Send `cursor` **only** when actually paging; do not hardcode `cursor=*` on a first page.
- Keep `lib/openalex.ts`'s caching layer (`cachedOpenAlex`, `external_api_cache`) — that part is sound and worth preserving; just have it wrap the unified client.

**Step 3 — make the API key optional.** `requireApiKey` throws when no key is present [SOURCE: `lib/openalex.ts:78-82`], but the OpenAlex public API works fine without one — verified in this audit. Change the contract to:

- If a user/env key exists → send `api_key`.
- If not → omit `api_key` and send a polite-pool `mailto` (`CROSSREF_MAILTO` is already read for the `user-agent` at `lib/openalex.ts:92`).
- Only surface "Connect an OpenAlex API key" as an *optional enhancement* prompt, never as a hard block.

This also gives you an instant mitigation: if the real 400 turns out to be key-scope-related, unauthenticated requests keep the feature alive.

**Step 4 — fix the retry loop.** The `catch` block re-runs on *every* error including the non-retryable 4xx that the `try` block itself threw, so a hard 400 is attempted three times with backoff before failing:

```ts
throw new Error(response.status === 429 ? … : `OpenAlex returned HTTP ${response.status}.`);
} catch (error) {
  lastError = …;
  if (attempt < 2) continue;   // ← retries the 400 it just threw
}
```

[SOURCE: `lib/openalex.ts:98-106`] Retry only on 429/5xx/network errors; rethrow 4xx immediately.

**Step 5 — never cache-mask a failure.** Add `x-continuum-cache` to what the UI can see in a debug affordance, and ensure a stale-but-successful cache row can't hide a currently-broken upstream. Show a subtle "cached · updated 2h ago" chip on results served from cache.

**Acceptance:** Works search returns results for a **novel** query string (one never previously cached). Authors/institutions/sources/topics continue to return results. Force a failure (temporarily bad key) and confirm the banner shows the real OpenAlex message.

### 2.3 Defect F-02 (P0) — Every entity detail and the whole citation graph fail on a broken SQL query, and leak the raw database error into the UI

**This is the most serious defect in the product.** It is both a total feature outage and an information-disclosure bug.

**Reproduce:** OpenAlex → Topics tab → search `machine learning` (returns 118 results fine) → click any result. A red banner appears containing raw SQL, `$1…$26` placeholders, the internal user id `user_demo`, and 25 DOIs. The detail panel never renders. [VERIFIED — screenshot captured]

Actual on-screen text (truncated):

```
Failed query: select library_type, library_id, item_key, title, doi, source_id
from zotero_items where user_id = $1 and deleted = false and lower(doi) = any(($2, $3, $4,
$5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
$24, $25, $26)) params: user_demo,10.1107/s0108767307043930,10.1002/jcc.21334,…
```

**Root cause** [SOURCE: `lib/openalex.ts:286-295`]:

```ts
const result = await getDatabase().execute(sql`
  select library_type, library_id, item_key, title, doi, source_id
  from zotero_items
  where user_id = ${userId} and deleted = false and lower(doi) = any(${dois})
`);
```

`dois` is a JavaScript array. Drizzle's `sql` template expands an array into a **comma-separated parameter list**, not a single array parameter. The emitted SQL is therefore `any(($2, $3, …, $26))` — a Postgres *row constructor*, not an array — which `any()` rejects. Confirmed by the single-DOI case producing `any(($2))` and the 25-DOI case producing `any(($2 … $26))`. [VERIFIED]

**Blast radius** — `zoteroMatches()` is called unconditionally by both the `detail` and `graph` branches of the route [SOURCE: `app/api/openalex/route.ts:69,83`], so it takes down:

- entity detail for **all five** entity kinds;
- the citation graph in **all three** directions (references / cited_by / related);
- the "Highly cited works" list on author/institution/source/topic pages;
- the **Save** button (it lives inside the detail panel, which never renders — so saving an entity is unreachable, which is why `action=saved` returns an empty list);
- the URL rewrite to `/openalex/{kind}/{id}` (it runs *after* the failed fetch, so deep links are never produced by the UI).

The function only escapes when the DOI list is empty — which is why an occasional DOI-less work appears to work.

#### Fix F-02

**Fix the query.** Only `sql` is re-exported from the db package [SOURCE: `packages/db/src/index.ts:5`], so either also export `inArray` from `drizzle-orm` and use it, or build a correct list in raw SQL:

```ts
import { getDatabase, sql } from "@continuum/db";

export async function zoteroMatches(userId: string, doiValues: string[]) {
  const dois = doiValues.map(normalizeDoi).filter((doi): doi is string => Boolean(doi)).slice(0, 100);
  if (!dois.length) return [];
  const list = sql.join(dois.map((doi) => sql`${doi}`), sql`, `);
  const result = await getDatabase().execute(sql`
    select library_type, library_id, item_key, title, doi, source_id
    from zotero_items
    where user_id = ${userId} and deleted = false and lower(doi) in (${list})
  `);
  return result.rows;
}
```

`dois` is already lower-cased and capped at 100 by `normalizeDoi`/`slice`, so `in (…)` is safe and index-friendly here.

**Make this failure non-fatal.** A Zotero cross-reference is a *nice-to-have enrichment*. It must never be able to take down scholarly browsing. Wrap the call:

```ts
const matches = await zoteroMatches(user.id, dois).catch((error) => {
  logger.warn("zotero_match_failed", { userId: user.id, error });
  return [];
});
```

Apply this at both call sites (`route.ts:69` and `route.ts:83`). Do this **even after** fixing the query — it is the difference between "a secondary lookup degraded" and "the OpenAlex tab is dead".

**Stop leaking internal errors to the client.** The catch-all returns `error.message` verbatim with a 502 [SOURCE: `app/api/openalex/route.ts:103-106`]. Replace with a mapped, safe response:

```ts
} catch (error) {
  logger.error("openalex_request_failed", { userId: user.id, action, kind, error });
  if (error instanceof OpenAlexUpstreamError) {
    return NextResponse.json(
      { error: "OpenAlex could not complete this request.", detail: error.publicDetail, code: "openalex_upstream" },
      { status: 502 },
    );
  }
  return NextResponse.json(
    { error: "Something went wrong loading scholarly data. Your saved work is unaffected.", code: "internal" },
    { status: 500 },
  );
}
```

**Audit the rest of the codebase for the same pattern.** Any route that does `error instanceof Error ? error.message : …` and returns it to the client can leak database internals the same way. `/api/openalex` POST has the identical shape at line 141. Sweep all of `app/api/**` for `error.message` in a `NextResponse.json` and apply the same mapping. Treat this as part of the same fix, not a follow-up.

**Acceptance:** Clicking any result of any entity kind renders the detail panel. All three citation-graph directions load. No response body under any failure contains SQL text, parameter placeholders, table names, internal user ids, or stack traces.

### 2.4 Defect F-03 (P1) — Two contradictory empty states render at once on failure

When Works search fails, the page shows the error banner **and** "Search the public scholarly graph to begin." **and** "Select an entity to inspect its identifiers…" simultaneously — two empty states plus an error, all disagreeing. [VERIFIED: `emptyStates=2` alongside `errorBanner=1`]

Cause: the empty state renders on `!works.length && !results.length && busy !== "search"` with no awareness of `error` [SOURCE: `openalex-screen.tsx:182`].

**Fix:** make the results pane a single state machine with exactly one visible branch — `idle → loading → error → empty → results`. The detail pane must show a neutral placeholder (not an invitation) whenever the list pane is in `error`. See §7 for the shared state-machine spec.

### 2.5 Defect F-04 (P1) — Failure leaves stale results and a stale URL

`loadDetail` sets `selected` **before** awaiting the fetch, and only calls `setDetail`/`replaceState` after success [SOURCE: `openalex-screen.tsx:53-69`]. On failure the header still shows the previously-selected entity while the body shows an error, and the URL never advances to `/openalex/{kind}/{id}`.

**Fix:** derive the header from `detail`, not from `selected`. On error, clear `detail` and restore the URL. Push the URL only after a successful load.

### 2.6 Defect F-05 (P1) — Save is unreachable, and there is no saved-entities view

`action=saved` is implemented server-side and returns `{"saved":[]}` [VERIFIED], but:

- the **Save** button only exists inside the detail panel, which currently never renders (F-02);
- **nothing in the UI ever calls `action=saved`** — there is no list of saved entities anywhere [SOURCE: `openalex-screen.tsx` has no `saved` fetch].

So even once F-02 is fixed, a user can save an entity and never see it again.

**Fix:** add a **Saved** tab alongside the five entity tabs, backed by `action=saved`. Show a filled/unfilled bookmark state on every result card (not just in the detail panel) so saving is a one-click action from the list. Support unsave from the list. Add an empty state: "Nothing saved yet — bookmark a work, author, or topic to keep it here."

### 2.7 Defect F-06 (P1) — Browser Back from a deep OpenAlex link lands on Today

**Reproduce:** Open `/openalex/works/W2741809807` (renders OpenAlex correctly). Click **Learn** in the sidebar. Press browser Back. The URL returns to `/openalex/works/W2741809807` but **the screen shows Today**. [VERIFIED]

Cause: `viewFromPath` is an exact-match map lookup falling back to `"today"`:

```ts
const pathToView = new Map(workspaceViews.map((v) => [workspacePath[v] as string, v]));
function viewFromPath(pathname: string) { return pathToView.get(pathname) ?? "today"; }
```

[SOURCE: `continuum-app.tsx:32-35`] `/openalex/works/W…` is not a key, so `popstate` resolves it to Today. The server route for that path exists and renders OpenAlex correctly [SOURCE: `app/openalex/[entity]/[id]/page.tsx`] — the bug is purely in the client-side `popstate` handler.

**Fix:** resolve by path prefix, not exact match:

```ts
function viewFromPath(pathname: string): WorkspaceView {
  const exact = pathToView.get(pathname);
  if (exact) return exact;
  const segment = `/${pathname.split("/").filter(Boolean)[0] ?? ""}`;
  return pathToView.get(segment) ?? "today";
}
```

Then have the OpenAlex screen read the entity id from the path on `popstate`, not only on mount, so Back/Forward moves between entities rather than dumping the user out of the section. This matters generally: **any** view that deep-links (Research projects, Learn lessons, Assistant conversations — see §5) will hit the identical bug. Fix it once, here.

### 2.8 Defect F-07 (P2) — Filters exist in the API but not in the UI

`/api/openalex` accepts `fromYear`, `toYear`, and `openAccess` for works [SOURCE: `route.ts:89-93`], and the UI never sends them — it hardcodes `sort: "citations"` and offers no controls [SOURCE: `openalex-screen.tsx:86`]. Meanwhile Research → Discovery exposes a full filter row for the *same* upstream data.

**Fix:** surface year range, open-access toggle, and a sort selector (Relevance / Most cited / Newest) in the OpenAlex search bar. Reuse the exact filter components from Research → Discovery so the two scholarly surfaces behave identically (see §5.3 on unifying them).

---

## 3. Other functional defects

### 3.1 F-08 (P1) — "7.2h scheduled" displayed above a visibly empty week

**Reproduce:** Sign in as demo → Plan → Week. The toolbar reads **"7.2h scheduled · 14 active tasks"**, while every one of the seven day columns shows only an "Open" placeholder. [VERIFIED]

Cause: the demo's 9 schedule blocks are dated **2026-07-21 → 2026-07-27**, but "today" is 2026-07-28, so the grid renders 28 Jul – 3 Aug and every block falls *before* the window. The `committedMinutes` stat sums **all** blocks regardless of date [SOURCE: `goals-screen.tsx:330`], while the grid filters to the visible week. The two numbers can therefore never agree once blocks age out.

This is the single most damaging first-impression bug after OpenAlex: the flagship planning screen looks broken on the demo account that judges and new users see first.

**Fix (three parts, all needed):**

1. **Scope the stat to the rendered window.** `committedMinutes` must sum only blocks within the currently displayed week. Label it "this week" explicitly: `7.2h scheduled this week`.
2. **Add week navigation.** The grid is hardcoded to a rolling 7 days from today with no way to move. Add ‹ / › week arrows and a "Today" button. This alone would have made the stale blocks discoverable rather than invisible.
3. **Re-seed the demo data relative to `now()`.** The demo fixture writes absolute dates, so the demo decays a little more each day. `packages/db/src/seed-demo.ts` already has a `daysFromNow()` helper — use it for `scheduleRows` so the demo always shows a populated current week. Add a "past weeks" affordance so historical blocks remain reachable.

### 3.2 F-09 (P1) — Onboarding promises a first-week schedule it often doesn't deliver, and never says so

**Reproduce:** Register a new account → complete all 5 onboarding steps → "Create my plan". Result: 1 goal, 4 milestones, 7 tasks, and **0 schedule blocks**. Plan then shows "0h scheduled" and an empty week. [VERIFIED on a fresh account]

The review step explicitly promises: *"Continuum will create a goal, milestones, actionable tasks, and a first-week schedule — deterministically."* [SOURCE: `onboarding-flow.tsx:246`]

The server *does* attempt scheduling and records a precise status — `committed`, `empty` (`"No study windows could hold the generated tasks."`), or `deferred` (with the thrown reason) — and returns it as `schedule: scheduleStatus` [SOURCE: `app/api/onboarding/route.ts:120-146`]. **The client discards the entire response body**; `submit()` only checks `response.ok` and then calls `onRefresh()` [SOURCE: `onboarding-flow.tsx:110-113`]. The user is never told scheduling failed or why.

**Fix:**

1. Consume the response. Branch the completion screen on `schedule.status`:
   - `committed` → "Your first week is scheduled — N blocks." → CTA **Open Plan**.
   - `empty` → "We built your plan, but your stated availability couldn't fit these tasks." → CTA **Adjust availability** (opens the Plan availability modal prefilled).
   - `deferred` → "Your plan is ready. We'll schedule it in a moment." → CTA **Build my week**.
2. Soften the promise on the review step to "…and, where your availability allows, a first-week schedule."
3. Show the created plan as the outcome — goal, milestone count, task count, next action — instead of silently dropping the user onto a generic Today screen.

### 3.3 F-10 (P1) — Plan creation takes ~20 s with almost no feedback

Clicking "Create my plan" took **>20 s** in one measured run before the UI advanced. [VERIFIED] The only feedback is the button label changing to "Building your plan…" [SOURCE: `onboarding-flow.tsx:265`]. On a slow connection this reads as a hang, and there is no cancel.

**Fix:** replace the button-label change with a full-panel progress state naming the real steps, driven by the work the server actually does (create goal → milestones → tasks → schedule): "Creating your goal ✓ / Breaking it into milestones ✓ / Generating tasks… ". Disable navigation during the write, set a client timeout with a retry path, and make the operation idempotent-safe to retry (the route already guards against duplicate goal creation [SOURCE: `route.ts:62`]).

### 3.4 F-11 (P1) — Changing language silently reinterprets your code, producing nonsense errors

**Reproduce:** Code → replace the starter with `while True:\n    pass` → switch Language to **SQL** → Run. Output: `Error: near "while": syntax error`. Same with JavaScript (`Unexpected identifier 'True'`) and TypeScript (`'(' expected`). [VERIFIED all three]

Cause: `switchLanguage` only swaps in starter code when the current source is pristine (`sourceIsStarter`); once you've typed anything, it keeps your source, changes the file extension, and changes the runtime [SOURCE: `code-screen.tsx:248-259`]. Preserving user code is the right instinct — doing it silently across an incompatible runtime is not.

**Fix:** keep **one buffer per language**. Switching language switches buffers (your Python stays Python, your SQL stays SQL); the file tab strip shows which buffers exist. This preserves work *and* never reinterprets it. If a buffer for the target language doesn't exist yet, seed it with that language's starter. This composes naturally with the multi-file model already in `session.files`.

### 3.5 F-12 (P1) — SQL runtime errors leak a webpack stack trace to the learner

**Reproduce:** Code → SQL → run invalid SQL. The Errors pane shows:

```
Error: near "while": syntax error at a.handleError
(https://continuumstudy.vercel.app/_next/static/chunks/6796.a0af92c80…)
```

[VERIFIED]

A minified bundle URL is meaningless to a Class-12 student and undermines the "understand why it works" promise. Python errors, by contrast, are handled well — clean tracebacks plus a working "Go to line N" button. [VERIFIED]

**Fix:** in the SQL branch of the browser runner, capture `error.message` only and drop the JS stack. Route the full stack to the existing **Technical details** disclosure (which already exists and is the right home for it [SOURCE: `code-screen.tsx:669`]). Parse SQLite errors into line/column where available so "Go to line" works for SQL as it does for Python.

### 3.6 F-13 (P2) — Native `window.prompt` / `window.confirm` for file operations

Creating, renaming, and deleting files use native browser dialogs [SOURCE: `code-screen.tsx:275,289,306`], confirmed live (`confirm:Delete main.ts? This removes it from your saved Continuum wo…`). [VERIFIED] The app has its own `Modal` component, used correctly for file import. Native dialogs are unstyled, unbrandable, block the main thread, can't be tested, and are suppressed entirely in some embedded contexts.

**Fix:** replace all three with the existing `Modal`. Inline-rename on the tab (double-click to edit) is better still for rename.

### 3.7 F-14 (P2) — Two "Run" buttons with different scopes

The toolbar has **Run**, and the Input & Output panel has **Run with this input** [SOURCE: `code-screen.tsx:516,583`]. Both execute the same program with the same stdin. The console empty state even says *"use the single Run button in the top bar"* — acknowledging the ambiguity in copy rather than fixing it. (This ambiguity was concrete enough to break the audit's own automation.) [VERIFIED]

**Fix:** one Run control in the toolbar. In the I/O panel, the button becomes **Apply input & run**, or is dropped in favour of the input textarea feeding the single Run.

### 3.8 F-15 (P2) — Two differently-labelled buttons open the same modal

"Build my week" (toolbar) and "Set availability" (banner) both call `setOnboardingOpen(true)` [SOURCE: `goals-screen.tsx:330,332`]. [VERIFIED] Worse, the "Build your week in Continuum / Set availability" banner **stays visible even while an editable draft is on screen**, still inviting the user to do the thing they just did. [VERIFIED — see `plan-draft.png`]

**Fix:** one primary action, **Build my week**. Show the availability banner only when no draft and no committed blocks exist for the visible week; hide it once a draft is present.

### 3.9 F-16 (P2) — Review queue shows four identical proposals

The demo Review queue contains four byte-identical "Commit the generated academic plan" proposals (22 blocks, 3 unscheduled, same timezone), differing only by timestamp. [VERIFIED — 6 matching nodes on screen]

**Fix:** two changes. (a) Deduplicate at write time — if an identical pending proposal exists, update its timestamp instead of inserting a new row. (b) In the UI, group same-kind pending proposals and show only the newest expanded, with "3 earlier versions" collapsed and a bulk **Reject superseded** action.

### 3.10 F-17 (P2) — Account session list is unbounded

The demo account renders **50 session rows**, each with its own "Sign out" button. [VERIFIED] There is no pagination, grouping, or cap [SOURCE: `account-screen.tsx:64` maps the full array].

**Fix:** show the 5 most recent, group the rest under "N older sessions" (collapsed), and always pin the current session to the top with a distinct marker. The existing "Sign out other sessions" bulk action is the right escape hatch — keep it prominent.

### 3.11 F-18 (P2) — Assistant conversation list is unusable

The demo shows ~14 conversations all titled `Give me one concise next a…` — every one truncated to an identical prefix. [VERIFIED] There is no way to tell them apart, and no rename.

**Fix:** title conversations from the **assistant's first response topic** rather than the user's raw first message; fall back to the message only if no topic can be derived. Show a relative timestamp and a one-line preview of the last message. Add rename and delete. Group by Today / This week / Earlier.

### 3.12 F-19 (P2) — Research has two permanently empty tabs

**Experiments** and **Drafts** are hardcoded `EmptyTab` placeholders with no backing feature at all [SOURCE: `research-screen.tsx:329,333`]. [VERIFIED — both render only static copy] Two of eight tabs are dead ends, which is a meaningful part of why Research feels unfinished.

**Fix (keeping the capability, per the no-removal constraint):** do not delete them. Move both into a single **"Coming next"** area at the bottom of the Research overview, clearly labelled as planned, so the tab bar carries only working destinations. If either is close to shipping, prefer shipping a minimal version: Drafts in particular is one `research_notes`-style table away from being real.

### 3.13 F-20 (P2) — Theme toggle has three states and appears to do nothing

The control cycles system → light → dark. Starting from "system" while the OS is already light, the first click produces **no visible change**. [VERIFIED: `light -> light -> dark`]

**Fix:** show the *resolved* theme in the control (icon = what you'll get), and either surface all three states explicitly (segmented Light / Dark / System) or drop to a two-state toggle with System available in settings.

### 3.14 F-21 (P1) — Tablet breakpoint breaks the Code screen

At **834 × 1112** (iPad portrait), `/code` has horizontal overflow (`scrollWidth 882 > clientWidth 834`) — the only route of the three tested that does. [VERIFIED] Visually: the mobile bottom nav overlaps the output panel, a large dead void sits under the editor, and the console is pushed far below the fold.

**Fix:** see §9. The 834 px range currently falls between the desktop three-pane layout and the mobile stack, and is served well by neither.

---

# PART B — UX / UI REDESIGN

## 4. The core diagnosis

The app is feature-rich and the underlying engineering is genuinely strong — the deterministic scheduler, the browser code runner, the memory model, and the audit trail are all real, working, and better than most of what ships at this scale. **The problem is not capability; it is that every capability is presented at the same volume, all at once.** Four specific, fixable patterns cause the "cluttered and overwhelming" feeling:

**Pattern 1 — 12 flat destinations, no hierarchy of importance.** The sidebar shows all 12 views at once in three groups whose labels ("Workspace", "Library", "Account") describe *storage*, not *what you're trying to do*. A new user has no signal about where to start. Today, Assistant, Plan, Learn, Code, and Research are all peers, even though Today is the intended entry point.

**Pattern 2 — every page spends its most valuable space on a marketing hero.** Every screen opens with the same `PageIntro`: an uppercase eyebrow, a huge editorial headline, and a two-line description. On Research the actual tab content starts **~650 px down the page**. These headlines ("Evidence, not browser tabs.", "A week that respects real life.", "Write it. Run it. Understand why it works.") are excellent *landing page* copy and pure overhead on the 30th visit — they cost a full screen of vertical space on every navigation, every day.

**Pattern 3 — flat feature dumps instead of progressive disclosure.** Learn presents 4 action cards + a continue card + a signal panel + 3 path cards + a full concept map + question banks + video search + recent activity as one continuous scroll, with no primary action. Connections renders every integration card expanded simultaneously. Code shows toolbar + advanced settings + task guidance + file tabs + editor + 4-tab output panel before you've done anything.

**Pattern 4 — inconsistent interaction vocabulary.** The same *kind* of action is expressed three different ways: modal (file import, availability, password), inline expanding card (new goal, new task, record decision), and native browser dialog (file create/rename/delete). Tabs are styled differently in Research (underline), Plan (pill), Memory (segmented), Code output (underline+icon), and OpenAlex (pill+icon).

The redesign below addresses these four patterns directly, and **preserves every existing capability**.

---

## 5. Information architecture

### 5.1 Regroup the sidebar around intent, not storage

Keep all 12 destinations. Change the grouping and the labels so the groups answer "what am I doing?".

```
┌─────────────────────────────┐
│  continuum                  │
│                             │
│  ▸ Today            ← home  │   (ungrouped, visually primary)
│                             │
│  WORK                       │
│    Assistant                │
│    Plan                     │
│    Learn                    │
│    Code                     │
│    Research                 │
│                             │
│  SOURCES                    │
│    Library        ← merged  │   (Zotero + OpenAlex + saved)
│    Memory                   │
│                             │
│  ────────────────────────   │
│    Review          ⑷        │
│    Connections              │
│    Account & Security       │
│                             │
│  ⌘K Jump to anything        │
│  [M] Mukilan                │
└─────────────────────────────┘
```

Rationale for each change:

- **Today becomes visually primary and ungrouped** — it is the intended daily entry point and should not look like a peer of Account.
- **"Workspace" → "Work"**, **"Library" → "Sources"** — the second group holds *where knowledge comes from*, which is what unites Zotero, OpenAlex, and Memory.
- **Zotero + OpenAlex merge into one "Library" destination** with tabs (see §5.2). This is the single biggest declutter available: two of twelve sidebar items currently point at two halves of the same job (find and keep sources), and one of them (Zotero) is empty for most users.
- **Review, Connections, and Account drop below a divider** as utility destinations. Review keeps its pending-count badge (already implemented [SOURCE: `continuum-app.tsx:230`]).
- Net: **12 destinations → 11**, with the six daily ones clearly separated from the five occasional ones. Nothing is removed.

### 5.2 Merge Zotero + OpenAlex into "Library"

One destination, three tabs:

| Tab | Content | Backed by |
|---|---|---|
| **Discover** | The OpenAlex entity search (Works/Authors/Institutions/Sources/Topics), filters, results, detail panel, citation graph | `/api/openalex` |
| **Saved** | Saved OpenAlex entities + saved papers | `action=saved` (fixes F-05) |
| **Zotero** | Connected libraries, collections, items, attachments | `/api/connections/zotero` |

Cross-links between them are the point: a Discover result that matches a Zotero item by DOI shows a "In your Zotero" chip (this is exactly what `zoteroMatches` was written to do — once F-02 is fixed it finally becomes visible). A Zotero item with a DOI gets a "View citation graph" action into Discover.

When Zotero isn't connected, the Zotero tab shows a single connect card rather than occupying a whole sidebar slot with an empty screen.

### 5.3 Resolve the Research ↔ OpenAlex overlap

Right now **Research → Discovery** and the **OpenAlex** screen search the same upstream corpus with different code, different UI, different filters, and different reliability (Discovery works; OpenAlex Works search is dead). Users cannot tell which to use.

Give them distinct, honest jobs:

- **Library → Discover** = open-ended exploration. Browse the graph, follow citations, save things you like. Not tied to a project.
- **Research → Discovery** = project-scoped acquisition. Same search component, but every result carries **Save to {project}** and the header states which project you're filing into.

Implement both with **one** `<ScholarlySearch>` component (search bar, entity tabs, filter row, result cards, detail panel) taking a `mode: "explore" | "collect"` prop and an optional `projectId`. This kills the duplicated UI, guarantees the two surfaces behave identically, and means F-01/F-07 get fixed once.

### 5.4 Replace per-page heroes with a compact page header

Delete `PageIntro`'s hero treatment from all 12 workspace screens and replace it with a single dense header bar:

```
┌──────────────────────────────────────────────────────────────┐
│  Research  ·  OASIS — cross-marker spatial association  ▾     │
│  19 papers · 2 sources · 2 claims · 3 decisions   [＋ New] [⋯]│
└──────────────────────────────────────────────────────────────┘
```

- Title = the section name, already present in the top bar's `location-label`; merge the two so it isn't duplicated.
- Second line = the live stats that currently sit in a separate card.
- Primary action right-aligned; secondary actions behind `⋯`.
- Height target: **≤ 96 px** (vs ~250 px today).
- Keep the descriptive sentence — move it into a `?` popover next to the title so the explanation stays available without costing daily space. **The copy is not deleted, just demoted.**

Expected gain: **~150–200 px of vertical space recovered on every screen**, which is most of what makes the app feel crowded. On Research this alone lifts the tab bar above the fold.

### 5.5 Make deep links real

Only OpenAlex currently rewrites the URL for sub-state, and it does so with `replaceState` (no history entry) and only on success. Adopt one pattern everywhere:

| State | URL |
|---|---|
| Research project + tab | `/research/{projectId}/{tab}` |
| Library entity | `/library/{kind}/{id}` |
| Learn lesson | `/learn/{conceptId}` |
| Assistant conversation | `/assistant/{conversationId}` |
| Code file | `/code?file={fileId}` |

Use `pushState` for user-initiated navigation so Back works, and fix `viewFromPath` per **F-06** so prefix routes resolve to the right view. This makes every view shareable and bookmarkable and makes the browser's own controls trustworthy.

---

## 6. Screen-by-screen redesign

### 6.1 Code — complete rethink (highest-priority redesign)

**What works today and must be preserved:** Python/JS/TS/SQL execution in-browser (Python cold start measured at ~160 ms, execution 16 ms — genuinely fast); a 5 s timeout that terminates cleanly and explains itself well; excellent Python error handling with a working "Go to line N"; test cases with pass/fail; run history with restore; AI feedback streaming from `/api/code`; multi-file and ZIP import with real path-traversal and symlink hardening; checkpoint-to-memory. All of this stays.

**What's wrong is the layout and the sequencing.** The screen presents seven stacked chrome elements before the editor: hero (~150 px) → toolbar → Advanced settings → Task guidance → file tabs → file explorer → editor header. On a 900 px viewport the editor gets roughly a third of the height, and the output panel — the thing you actually look at after clicking Run — is a narrow right column. On tablet it breaks outright (F-21).

#### Target layout (desktop ≥ 1100 px)

```
┌────────────────────────────────────────────────────────────────────────┐
│ Code · main.py          Python ▾        [▶ Run ⌘↵]  [Tests 1]  [⋯]     │  56px
├──────────┬─────────────────────────────────────┬───────────────────────┤
│ FILES    │  1  scores = [72, 88, 91, 64, 85]   │  ▸ Console            │
│ main.py  │  2  cutoff = int(input() or "80")   │  ─────────────────    │
│ helper.py│  3  selected = [s for s in scores…] │  Selected: [88,91,85] │
│          │  4  print(f"Selected: {selected}")  │  Average: 88.0        │
│ + New    │                                     │                       │
│          │                                     │  ✓ Ran in 16ms        │
│ ─────────│                                     │                       │
│ TASK  ▸  │                                     │  [Explain] [Test it]  │
│ ⚙ Setup ▸│                                     │                       │
└──────────┴─────────────────────────────────────┴───────────────────────┘
   200px              flexible (min 480px)              420px (resizable)
```

Specific changes:

1. **Delete the hero.** Recovers ~150 px directly into the editor.
2. **One toolbar row, 56 px.** File name, language, Run, and a `⋯` overflow holding Import file, Check sample, Download, Copy, Reset workspace. **Ask Assistant** moves into the output panel's Assistant tab, where it belongs (it currently just switches that tab anyway [SOURCE: `code-screen.tsx:515`]).
3. **Advanced settings and Task guidance move into the left rail** as collapsed disclosures. They are currently full-width `<details>` blocks between the toolbar and the editor — prime real estate for things opened once a session.
4. **Always show the file rail** (currently only appears at `files.length > 1` [SOURCE: `code-screen.tsx:550`], so the layout jumps when you add a second file). Show it always, with "+ New file".
5. **Remove the duplicate file list.** There is both a tab strip *and* an explorer rail when multiple files exist [SOURCE: `code-screen.tsx:545-550`]. Keep the rail; drop the tab strip.
6. **Editor minimum height 480 px**, output panel default 420 px and resizable (the resizer already exists and works — keep it).
7. **Per-language buffers** (fixes F-11).
8. **One Run button** (fixes F-14).

#### The compiler/run experience

This is the heart of the tab and deserves explicit sequencing.

**Run states — the panel must show exactly one:**

| State | Display |
|---|---|
| idle | "Run your program to see output." + `⌘↵` hint |
| preparing | Skeleton + "Starting Python…" (only if > 300 ms, to avoid a flash on the common fast path) |
| running | Live output streaming + elapsed timer + **Stop** |
| success | Output, exit code, duration, next actions |
| error | Error-first layout (below) |
| timeout | Explanation + "Increase limit" shortcut into Advanced settings |

The existing `statusLabel` map already covers these states well [SOURCE: `code-screen.tsx:190-192`] — keep it, and drive the visual states from it.

**Error-first layout.** When a run fails, the panel should lead with the *fix*, not the dump:

```
┌────────────────────────────────────────┐
│ ⚠ IndexError on line 2                 │   ← parsed, human-readable
│ list index out of range                │
│                                        │
│ x has 3 items, but you asked for [99]. │   ← plain-language explanation
│                                        │
│ [Go to line 2]  [Explain this error]   │   ← both already implemented
│                                        │
│ ▸ Full traceback                       │   ← collapsed by default
└────────────────────────────────────────┘
```

"Go to line N" already works for Python [VERIFIED] — extend the same parsing to SQL and JS/TS (F-12).

**Tests.** Promote to a first-class panel: a summary row (`2 of 3 passing`), per-test rows with inline expected-vs-actual **diff** (currently expected and actual are two separate `<pre>` blocks the user must compare by eye [SOURCE: `code-screen.tsx:586`]), and "Run all tests" always visible.

**Assistant panel.** Keep the excellent "run first so feedback uses real output" guard. Reduce the three starter groups (Understand / Fix & review / Check) from five buttons to a context-sensitive row: after an error, lead with **Explain this error**; after a pass, lead with **Review my code**.

#### Tablet (768–1099 px)

Two panes, not three: collapse the file rail into a dropdown next to the filename; editor above, output below, split ~55/45, both resizable. This is the range that is currently broken (F-21).

#### Mobile (< 768 px)

Editor and output as a **segmented switch**, never stacked — today they stack, so the output sits below a full-height editor and the bottom nav overlaps it. [VERIFIED]

```
┌──────────────────────┐
│ main.py      Python ▾│
│ [ Editor | Output ]  │  ← segmented control
├──────────────────────┤
│  (selected pane,     │
│   fills viewport)    │
├──────────────────────┤
│      [ ▶ Run ]       │  ← sticky, above bottom nav
└──────────────────────┘
```

Auto-switch to Output on Run. Drop the `⌘↵` hint on touch devices. Ensure the sticky Run bar clears the bottom nav (`padding-bottom: env(safe-area-inset-bottom)`).

### 6.2 Research

Keep all eight tabs' capabilities; restructure the shell.

- **Compact header** per §5.4, with the project switcher inline in the title.
- **Fold the stats card into the header** (`19 papers · 2 sources · 2 claims · 3 decisions`), saving ~120 px.
- **Reduce the tab bar from 8 to 6** by grouping, without losing anything:
  `Overview · Discovery · Library (Papers + Notes) · Claims · Decisions · Drafts`
  Experiments and Drafts move per **F-19**.
- **Overview becomes a real dashboard**: next milestone, latest decision, unresolved questions, recent activity — each linking into its tab.
- **Discovery** uses the shared `<ScholarlySearch>` in `collect` mode (§5.3), with the destination project stated in the header.
- **Empty project state**: the "Create your first research project" state already exists and is good [VERIFIED]. Extend it with two or three template projects (Literature review / Lab notebook / Methods validation) to remove the blank-page problem.

### 6.3 Learn

Learn has the most content and the least hierarchy: 4 action cards, a continue card, a signal panel, 3 path cards, a concept map, question banks, video search, and recent activity — all at one volume.

Restructure into three bands:

**Band 1 — one primary action.** A single card: *"Continue: Electric potential vs potential energy — 6 min"* with one primary button. The other three actions (Find a resource / Review weak areas / Return to active resource) become secondary text links beneath it. Today all four compete as equals, and one ("Return to an active resource") is permanently disabled with "No active resource right now" — a dead control at the top of the page. Hide disabled actions rather than showing them greyed.

**Band 2 — your paths.** The three active-goal cards, unchanged.

**Band 3 — tools, in tabs rather than stacked:**
`Concept map · Question banks · Videos · Activity`

The concept map is a genuinely strong feature currently buried below the fold — as a tab it becomes discoverable. Keep both its Mind map / Grouped outline views (both work [VERIFIED]).

**Mastery display.** The current signal panel shows `100% understanding` in a ring next to `Exposure 88% / Transfer 100% / Retention 100%` and the label "Mastered" — while the same concept is tagged **"Misconception to fix"** in the adjacent card. [VERIFIED] These contradict. Show one honest composite state with the sub-scores in a tooltip, and never render a "Mastered" badge on a concept carrying an open misconception.

### 6.4 Assistant

The strongest screen already — real streaming, context transparency ("Used context · 1"), mode selection, and Obsidian sync status. Fixes needed:

- Conversation titles and grouping (**F-18**).
- **Explain the context chip.** "Context · 1" is precise and meaningless to a new user. On click, show what was retrieved and why. This is Continuum's core differentiator and it is currently a two-character label.
- **Mode selector needs descriptions.** Continuum Auto / Fast / Deep Reasoning / Coding / Document Analysis are bare options; add one-line descriptions in the dropdown.
- **Empty state should teach.** For a new user, replace the blank thread with 3–4 starter prompts drawn from their actual goals ("What should I study next?", "Explain my weakest concept").
- Move **Review memory** and the delete (trash) icon into a `⋯` overflow — destructive and rare actions shouldn't sit in the primary header.

### 6.5 Today

Closest to right already. Two changes:

- Make **Best next action** unambiguously the primary element — it competes with "At a glance" today.
- The action card exposes a raw internal id: *"Spaced follow-up generated after verified resource activity `activity_d61e36a01a9e4275aa1c3368`."* [VERIFIED] Never show raw ids in user copy; put it behind the technical disclosure.

### 6.6 Plan

- Fix the scheduled-hours contradiction and add week navigation (**F-08**).
- Resolve the duplicate availability actions (**F-15**).
- **Improve week-grid readability.** In the generated draft, block titles wrap to 5–6 lines in narrow columns ("Run the dense-null candidate on the two completed LL477 H-DAB bundles"). [VERIFIED] Truncate to two lines with a tooltip and full text on click.
- Keep the draft → edit → save flow exactly as is; it is excellent.

### 6.7 Connections

Every integration card renders expanded simultaneously, producing a very long page. Collapse to one row per integration (logo, name, status chip, connect/manage) and expand on click. Group as: **Assistants** (Claude/MCP) · **Sources** (Zotero, OpenAlex, YouTube) · **Notes** (Obsidian) · **Local** (Ollama). Keep every provider and every control.

### 6.8 Review, Memory, Account

- **Review** — deduplicate proposals (**F-16**); make the audit trail filterable by event type.
- **Memory** — strong as-is. Add a "What is this?" popover explaining canonical memory vs transcripts.
- **Account** — cap the session list (**F-17**).

---

## 7. Empty, loading, and error states

Today these are inconsistent: some screens have well-crafted empty states (Zotero, Research papers, Code console), some have none at all (Research with no project shows just a hero; Plan with no blocks shows bare "Open" placeholders), and OpenAlex shows two contradictory empty states plus an error simultaneously (**F-03**).

**Adopt one state machine for every data-backed region:**

```
idle → loading → (empty | error | ready)
```

Exactly one branch renders at a time. Build three shared components and use them everywhere:

**`<EmptyState icon title body action?>`** — always name a next action. Not "No data" but "No saved papers yet" + **Discover papers**.

**`<LoadingState variant="skeleton|spinner">`** — skeletons that match the shape of the content for lists and cards; spinner only for indeterminate in-place work. Suppress below 300 ms to avoid flashing. Replace the current three-dot `screen-loading` used for whole screens with per-region skeletons so the shell stays stable.

**`<ErrorState title body retry? detail?>`** — three required properties:
1. **Plain language.** "We couldn't reach OpenAlex" — never a raw upstream string, never SQL.
2. **A way forward.** Retry, or a link to the setting that fixes it.
3. **Reassurance where true.** "Your saved work is unaffected."
Technical detail goes in a collapsed disclosure, and must be safe to display (see F-02).

**Specific gaps to fill:** Research with no project; Plan with no blocks in the visible week (distinguish "nothing scheduled" from "nothing scheduled *this week*" and offer week navigation); Learn with no active path; Memory with no results; Library → Saved with nothing saved; Assistant with no conversations; every offline/network-failure path.

---

## 8. Visual design system

The visual language — near-black/cream base, lime accent, large editorial type, generous radii — is distinctive and worth keeping. The problems are consistency and density, not taste.

### 8.1 Spacing

Adopt a 4 px base scale and use it exclusively: `4, 8, 12, 16, 24, 32, 48, 64`.

| Context | Value |
|---|---|
| Icon ↔ label | 8 |
| Inside a card | 16 (compact) / 24 (standard) |
| Between cards | 16 |
| Between sections | 32 |
| Page gutters | 24 (mobile) / 32 (tablet) / 48 (desktop) |
| Page header → content | 24 |

Reduce page top padding from ~48 px to 24 px. Cap main content at `max-width: 1440px` and centre it — the current full-bleed layout stretches cards uncomfortably on wide screens.

### 8.2 Type scale

Six sizes only. The current scale runs from 64 px landing headlines down to 11 px metadata, with page headlines around 40 px inside the app.

| Token | Size / weight | Use |
|---|---|---|
| `display` | 40/600 | Landing only |
| `title` | 24/600 | Page header |
| `heading` | 18/600 | Card and section headings |
| `body` | 14/400 | Default |
| `small` | 13/400 | Secondary |
| `caption` | 12/500 | Metadata, uppercase labels |

Minimum body size **13 px**; nothing below 12 px. Line height 1.5 for body, 1.25 for headings.

**Retire the uppercase eyebrow** (`SCHOLARLY GRAPH`, `CONNECTED LIBRARY`, `ACTIVE PROJECT`) from workspace screens — it adds a line of text and no information when the sidebar already shows the section. Keep it on the landing page.

### 8.3 Colour

Keep the existing palette; tighten its application into semantic roles.

| Role | Use |
|---|---|
| `--accent` (lime) | **Primary action only — one per screen region** |
| `--ink` / `--muted` | Text |
| `--surface` / `--surface-raised` | Backgrounds |
| `--line` | Borders |
| `--success` / `--warning` / `--danger` | Status only |

The lime is currently used for the active nav item, primary buttons, the Today avatar, badges, and section accents at once, so it no longer signals "the thing to click". Restrict it to primary actions plus the active nav state.

**Status colours must never be the only signal** — always pair with icon and text (matters for the run outcomes, test pass/fail, and connection status chips).

**Contrast:** audit all text against WCAG AA (4.5:1 body, 3:1 large). The muted-on-surface combinations in card metadata are the likely failures. Note that a recent commit ("Harden animated text contrast") already moved in this direction — extend it to the workspace screens.

### 8.4 Components

**Standardise tabs.** Five different tab styles exist today (Research underline; Plan pill; Memory segmented; Code output underline+icon; OpenAlex pill+icon). Adopt two, by role:

- **Section tabs** (switch major content): underline, 14 px, 16 px gap, animated indicator, count badges allowed.
- **Segmented control** (switch a view of the same content, e.g. Mind map / Grouped outline): pill group, 13 px.

**Standardise buttons.** `primary` (one per region) · `secondary` (outlined) · `quiet` (text) · `danger` (text, red). Heights 36 (default) / 32 (compact) / 44 (touch). Every icon-only button needs an `aria-label`.

**Standardise overlays by weight** — and apply the rule consistently, which is the fix for Pattern 4:

| Weight | Pattern |
|---|---|
| Confirm / short form | `Modal` (existing component) |
| Create / edit a record | Inline expanding card (as Plan's "Create a goal" already does) |
| Contextual detail | Side sheet |
| Destructive confirm | `Modal` with typed confirmation |
| **Never** | `window.alert/confirm/prompt` |

**Cards:** one radius (12 px), one border (`1px solid var(--line)`), elevation only for overlays.

### 8.5 Motion

150 ms ease-out for hover/press; 200 ms for panels; 250 ms for modals. Respect `prefers-reduced-motion`. No entrance animation on data that just loaded — it delays comprehension.

---

## 9. Responsiveness

Breakpoints: **< 768** mobile · **768–1099** tablet · **1100–1439** desktop · **≥ 1440** wide.

The 768–1099 band is the broken one today (**F-21**). Per-screen behaviour:

| Screen | Mobile | Tablet | Desktop |
|---|---|---|---|
| Code | Editor/Output segmented switch; sticky Run | Editor above, output below; file rail → dropdown | 3 panes |
| Library / OpenAlex | List → detail drill-in (full-screen detail, back button) | 40/60 split | List + detail |
| Research | Tabs scroll horizontally; single column | Single column | Two-column overview |
| Plan week | One day at a time, swipe between days | 3-day view | Full 7-day |
| Assistant | Conversation list in a drawer | Collapsible list | List + thread |

Rules that apply everywhere:

- Touch targets ≥ 44 px.
- Sticky action bars must clear the bottom nav — reserve `56px + env(safe-area-inset-bottom)`.
- No horizontal page scroll at any width (currently true at 390 px [VERIFIED], false for `/code` at 834 px [VERIFIED]).
- Wide tables and code blocks scroll inside their own `overflow-x: auto` container, never the page.
- Hide keyboard-shortcut hints (`⌘↵`, `⌘K`) on touch devices.
- The mobile bottom nav currently exposes Today / Assistant / Learn / Code / More [SOURCE: `continuum-app.tsx:72`] — keep, but ensure "More" opens the full grouped nav from §5.1.

---

## 10. Onboarding, first-run, and discoverability

### 10.1 The first-run gap

Onboarding renders **only on Today, and only when the user has zero goals** [SOURCE: `today-screen.tsx:21`]. Every other route is fully reachable before onboarding. A new user who lands on `/code`, `/research`, or `/learn` — via the sidebar, a bookmark, or a shared link — gets the full complex UI with no data and no guidance. Measured on a fresh account: `/research` renders 291 characters of content and **zero** empty states. [VERIFIED]

**Fix:**

1. **Make onboarding a route** (`/welcome`) rather than a conditional inside Today. Redirect any workspace route to `/welcome` until onboarding completes, with a **Skip for now** escape that sets a flag and lets power users explore.
2. Give every screen a genuine zero-state that explains its job and offers one action (§7).

### 10.2 Onboarding flow fixes

The 5-step flow (About you → Your goal → Your time → How we help → Review) is well-built: validation is correct, a draft persists to `localStorage`, and the step rail is clear. [VERIFIED end-to-end] Fixes:

- **Hide the disabled Back button on step 1.** It renders disabled rather than hidden [SOURCE: `onboarding-flow.tsx:262`]. [VERIFIED: `backDisabled: true` on step 0]
- **Explain why each answer matters** — one line per step tying the input to a concrete outcome.
- **Real progress during plan creation** (**F-10**).
- **Honest completion state** reflecting `schedule.status` (**F-09**).
- **Land on a tour, not a blank app.** After plan creation, show a 3-step coach-mark tour: *Today = your next action* → *Plan = your week* → *⌘K = jump anywhere*. Dismissible, resumable from Account.

### 10.3 Discoverability

- **Promote ⌘K.** It works well (fuzzy-matches goals, tasks, projects, receipts [VERIFIED]) but is advertised only by a small sidebar button. Surface it in the empty states and the tour.
- **Add contextual help.** A `?` in each page header opening a short "what this section is for" popover — the natural home for the descriptive copy removed from the heroes (§5.4).
- **Surface keyboard shortcuts.** `⌘↵` (run) and `⌘K` exist; add `?` to open a shortcut sheet.
- **Make Review's badge meaningful.** The pending count is implemented; ensure it appears in the mobile nav too.

---

## 11. Implementation sequence

Ordered so the app is demo-safe as early as possible.

### Phase 1 — Stop the bleeding (P0, ~1 day)

1. **F-02** — fix `zoteroMatches` SQL; make it non-fatal; stop leaking raw errors; sweep `app/api/**` for the same `error.message` leak pattern.
2. **F-01 step 1** — surface the real OpenAlex upstream error.
3. **F-01 steps 2–4** — unify onto `OpenAlexProvider`, add `select`/`per-page`, make the API key optional, fix the retry loop.
4. **F-08** — scope the scheduled-hours stat to the visible week; re-seed demo schedule data relative to `now()`.

*Exit criteria:* Works search returns results for a never-before-cached query; every entity kind opens a detail panel; all three graph directions load; no response body contains SQL or internal identifiers; Plan's header stat matches what the grid shows.

### Phase 2 — Correctness and trust (P1, ~2 days)

5. **F-06** prefix-based `viewFromPath` + deep links (§5.5).
6. **F-03/F-04/F-05** OpenAlex state machine, saved-entities tab, error recovery.
7. **F-09/F-10** onboarding schedule status + real progress.
8. **F-11/F-12** per-language buffers; clean SQL errors.
9. **F-21** tablet layout fixes.

### Phase 3 — Structure (~3 days)

10. Compact page headers across all 12 screens (§5.4) — the single highest-impact declutter.
11. Sidebar regrouping (§5.1); merge Zotero + OpenAlex into Library (§5.2).
12. Shared `<ScholarlySearch>` component (§5.3).
13. Shared `<EmptyState>` / `<LoadingState>` / `<ErrorState>` and rollout (§7).

### Phase 4 — Code tab rebuild (~3 days)

14. Three-pane layout, toolbar consolidation, left rail (§6.1).
15. Run-state machine and error-first output.
16. Tests panel with diffs; Assistant panel context-sensitivity.
17. Tablet and mobile layouts.

### Phase 5 — Screen refinement (~3 days)

18. Learn three-band restructure (§6.3); Research shell (§6.2); Assistant conversations (§6.4); Connections collapse (§6.7); Today, Plan, Review, Account fixes.

### Phase 6 — System polish (~2 days)

19. Spacing, type, colour, component standardisation (§8).
20. Responsive pass (§9).
21. Onboarding route, tour, contextual help (§10).
22. Accessibility: contrast audit, focus order, `aria-label`s on icon buttons, keyboard traps in modals, reduced-motion.

---

## 12. Capability preservation checklist

Verify every item still works after the redesign. **Nothing in this list may be dropped.**

**Today** — greeting; best-next-action with reasoning; At-a-glance stats; schedule summary; Build my week; latest checkpoint; resume link.

**Assistant** — streaming chat; conversation list; new/archive; mode selector (Auto/Fast/Deep/Coding/Document); context chip; "Use my API key"; file attach; Review memory; delete; Obsidian sync status; private-workspace indicator.

**Plan** — Week/Goals/Backlog views; New task; New goal; availability modal; draft generation; per-block edit/move/resize; Undo; Add block; Save final schedule; Discard draft; protected commitments; scheduled-hours and active-task stats.

**Learn** — Continue learning; Find a resource; Review weak areas; Return to active resource; current-signal panel (exposure/transfer/retention); active paths; concept map with Mind map + Grouped outline; node detail with mastery/confidence/attempts/prerequisites/unlocks; Open lesson; Ask as question; question banks + upload; video search; recent activity.

**Code** — Python/JS/TS/SQL execution; editor-only languages; file name + language switch; Run; Stop; Rerun; Check sample; timeout selection (5/10/30 s); task guidance; multi-file create/rename/duplicate/delete; ZIP import; single-file import; syntax check; download; copy; Console / Input & Output / Assistant / Tests panels; test CRUD; run history + restore; AI feedback with Continuum/Ollama providers; starter prompts; checkpoint save; reset workspace; panel resize/collapse; Go to line; technical details.

**Research** — project switcher; New project; Connect tools; Add source; Record decision; project stats; Overview, Discovery, Papers, Notes, Claims, Experiments, Decisions, Drafts; discovery search with mode/provider/sort/year filters; save paper to project; source library with delete; decision ledger.

**Library (Zotero + OpenAlex)** — entity search across Works/Authors/Institutions/Sources/Topics; result lists with pagination (Load more); entity detail with identifiers, metrics, abstract; citation graph (references/cited_by/related); highly-cited works; Zotero DOI match indicator; Save/unsave; saved list; external links; Zotero library selector, collections, item list, search, pagination, item detail.

**Memory** — Overview / Context packs / History; semantic + lexical search; current-state panel; goals, projects, learning signals, preferences, decisions, deadlines, open questions; recent progress; Export all; receipts and audit history link.

**Review** — proposal queue with Confirm/Reject; proposal detail (blocks, timezone, unscheduled ids); AI-assistance rationale; durable audit trail; counts.

**Connections** — Claude/MCP with OAuth and scoped tools; revoke; Zotero; Obsidian with sync + conflict compare; OpenAlex, YouTube, Groq, Gemini, Featherless credentials; Ollama local config; Refresh.

**Account** — username; change password; data export; active sessions with per-session revoke; sign out others/all; delete account with impact review, typed confirmation, and Obsidian note choice.

**Global** — ⌘K palette; theme toggle; toasts; mobile bottom nav; sidebar collapse; sign out.

---

## 13. Verification checklist

Run these against the deployment after implementation.

**OpenAlex**
- [ ] Works search returns results for a query string never used before (cache-bypassing).
- [ ] Authors, institutions, sources, and topics search still return results.
- [ ] Clicking a result of each of the five kinds renders the detail panel.
- [ ] References, cited-by, and related all load.
- [ ] No response body contains `Failed query`, `select `, `$1`, a table name, or an internal user id.
- [ ] Save works; saved entities appear in the Saved tab; unsave works.
- [ ] `/library/works/W2741809807` deep-links; Back returns to Library, not Today.
- [ ] Year, open-access, and sort filters change results.

**Code**
- [ ] Python, JS, TS, SQL each run and produce correct output.
- [ ] Switching language preserves each language's own buffer.
- [ ] Runtime, syntax, and timeout errors each show error-first guidance; "Go to line" works in all four languages.
- [ ] No stack trace or bundle URL appears outside Technical details.
- [ ] File create/rename/delete use in-app modals, never native dialogs.
- [ ] Exactly one Run control.
- [ ] No horizontal overflow at 390, 834, 1280, 1920.

**Plan / onboarding**
- [ ] Header hours match the blocks visible in the current week.
- [ ] Week navigation works; past weeks reachable.
- [ ] A fresh account reaches a populated plan, and the completion screen states the real schedule outcome.
- [ ] Plan creation shows step-by-step progress.

**Global**
- [ ] Every data region shows exactly one of idle/loading/empty/error/ready.
- [ ] Every empty state names a next action.
- [ ] Back/forward work from every deep link.
- [ ] All 12 destinations reachable; §12 checklist passes in full.
- [ ] Axe reports no critical violations; all text meets WCAG AA.
- [ ] No console errors on any route.
