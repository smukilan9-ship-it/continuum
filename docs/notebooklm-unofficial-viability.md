# NotebookLM (unofficial Python API) — viability check

**Scope:** a narrowly-scoped viability investigation only. No integration was
implemented, no package was added to Continuum's dependencies, no authentication
flow was modified, and no OASIS or other private material was uploaded anywhere.

**Date inspected:** 2026-07-22
**Investigator note:** research + documentation review only. The disposable smoke
test was **not attempted** — see §3 for the safety reasoning.

---

## 1. Date and versions inspected

| Item | Value (as observed 2026-07-22) |
| --- | --- |
| Primary candidate | [`teng-lin/notebooklm-py`](https://github.com/teng-lin/notebooklm-py) |
| Version | v0.7.x–v0.8.x line (README shows v0.7.3, dated 2026-06-30; `python-api.md` references v0.8.0+ semantics) |
| Activity | ~1,900 commits, actively developed |
| License | **MIT** |
| Python support | 3.10 ≤ Python ≤ 3.14 |
| Service note | Google rebranded NotebookLM → **"Gemini Notebook"** (~July 2026); the same underlying consumer service, and the library reportedly drives it unchanged |
| Official option | [Gemini Notebook **Enterprise** API](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-notebooks) — **Preview / Pre-GA** |

## 2. Sources and repositories examined

- [`teng-lin/notebooklm-py`](https://github.com/teng-lin/notebooklm-py) — README, `docs/python-api.md`, `docs/rpc-development.md`, `CLAUDE.md` (primary unofficial consumer client; first to reverse-engineer the NotebookLM `batchexecute` protocol).
- [`icebear0828/notebooklm-client`](https://github.com/icebear0828/notebooklm-client) — standalone JS/Node CLI & library over the same reverse-engineered "Boq RPC"; browser + pure-HTTP transports.
- [`LocalKinAI/notebooklm-go`](https://pkg.go.dev/github.com/LocalKinAI/notebooklm-go) — Go port re-implementing the same protocol understanding.
- [`adrianwedd/notebooklm-automation`](https://github.com/adrianwedd/notebooklm-automation) — automation toolkit (export, artifacts, multi-format export to Obsidian/Notion/Anki).
- [Gemini Notebook Enterprise API docs](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-notebooks) — official REST surface.

All non-`teng-lin` consumer projects depend on the **same** undocumented `batchexecute`
RPC endpoints and therefore share the same fundamental breakage/ToS risk profile; they
are not independent mitigations.

## 3. Smoke-test result — not attempted (by design)

A disposable smoke test was **not run**. Every documented authentication path for the
unofficial client requires authenticating a **real Google account**:

- **Interactive Playwright login** (default) — drives a real Google sign-in, i.e.
  entering Google credentials (and likely passing bot/anti-automation checks).
- **Cookie import** — copying an existing browser session's cookies/session state.
- **"Master-token" auth** — still derived from an authenticated Google web session.

All three violate the guardrails set for this investigation and Continuum's operating
rules: do not enter account credentials, do not copy browser cookies/session state, and
do not bypass Google's bot detection. The task's own instruction is explicit here:
> "If authentication requires copying browser cookies or session state, document that
> fact and stop before handling real credentials unless a safe local login method is
> explicitly supported."

There is **no safe unauthenticated local login path**, so the correct action is to stop
before authentication. Consequently every capability below is marked **documented only**
— none was verified live from this environment.

## 4. Supported-capability matrix

Legend: **Verified live** (exercised here) · **Documented** (library docs describe it,
not exercised here) · **Unverified** · **Failed**.

| # | Capability (Continuum need) | Unofficial `notebooklm-py` | Status |
| --- | --- | --- | --- |
| 1 | Authenticate a user | Playwright login / cookie import / master-token | **Documented** |
| 2 | List notebooks | `client.notebooks.list()` | **Documented** |
| 3 | Create a notebook | `client.notebooks.create(title)` (idempotent on retry) | **Documented** |
| 4a | Add PDFs / files | `client.sources.add_file(...)` | **Documented** |
| 4b | Add copied text | `client.sources.add_text(...)` | **Documented** |
| 4c | Add websites / URLs | `client.sources.add_url(...)` | **Documented** |
| 4d | Add YouTube links | via source-add (URL); "where supported" | **Documented** |
| 4e | Add Google Drive files | `client.sources.add_drive(...)` | **Documented** |
| 5 | Check source-processing status | `client.sources.wait_until_ready(..., timeout)` → `SourceTimeoutError` | **Documented** |
| 6 | Ask grounded questions | `client.chat.ask(notebook_id, question)` | **Documented** |
| 7 | Receive citations / source refs | `chat.ask` returns citation metadata (**exact structure not specified in docs**) | **Documented (shape unverified)** |
| 8 | Study artifacts — study guide / quiz / flashcards / audio / report / mind map / infographic | `artifacts.generate_study_guide` / `generate_quiz` / `generate_flashcards` / `generate_audio` / `generate_report` / `generate_mind_map` / `generate_infographic` (no explicit "FAQ" method; report/study-guide overlap) | **Documented** |
| 9 | Poll long-running generation jobs | `artifacts.wait_for_completion(...)`, `research.wait_for_completion(...)` | **Documented** |
| 10 | Download generated artifacts | `download_audio` / `download_video` (+ MP3/MP4/PDF/PNG/CSV/JSON/MD) | **Documented** |
| 11 | Delete notebooks / sources | `notebooks.delete(...)`, `sources.delete(...)` | **Documented** |
| 12 | Operate from Node/Next.js via isolated Python service/subprocess | Python library + CLI + "agent skill"; wrappable behind a subprocess/microservice | **Documented / architecturally feasible** |

The library also exposes notes, mind-maps, labels, settings, sharing, a structured
exception hierarchy (`NotFoundError`, `WaitTimeoutError`, `RPCError`,
`NonIdempotentRetryError`), and idempotency helpers — a notably mature surface for an
unofficial client. **Maturity of the wrapper does not change the instability of the
underlying transport** (see §6).

## 5. Security and privacy risks

- **Per-user Google authentication.** Each Continuum user would have to authenticate
  their **own** account, and the only mechanisms are interactive personal-account access or
  handing over browser cookies/session state. Continuum storing or brokering those
  cookies/tokens is a serious credential-custody and privacy liability.
- **Session/cookie custody.** Auth artifacts (cookies, CSRF token, session id, any
  "master token") are long-lived Google session material. They must never be committed,
  logged, or printed, and storing them server-side broadens the blast radius of any
  Continuum compromise to the user's whole Google account.
- **Data egress.** Sending sources to NotebookLM ships user content to a Google consumer
  product. For OASIS this is explicitly out of scope (unpublished research); any handoff
  must be opt-in, per-item, and consent-gated — never automatic.
- **No printed secrets.** Any future adapter must guarantee cookies/tokens are never
  emitted to logs or docs.

## 6. Operational and maintenance risks

- **Undocumented transport.** Built on Google's internal `batchexecute` RPC with
  6-character obfuscated RPC IDs (e.g. `wXbhsf`). The README states plainly: *"APIs may
  break — Google can change internal endpoints anytime,"* and *"Rate limits apply."*
- **Breakage likelihood: high.** Any NotebookLM/Gemini-Notebook frontend change can
  silently break method IDs or payload shapes. This is a *when*, not *if*, dependency.
- **Bot-detection fragility.** Automated login is exactly what Google's anti-automation
  systems target; accounts can be challenged or restricted.
- **ToS/AUP exposure.** Automating a consumer Google product via undocumented endpoints
  is at odds with typical Google terms; this is a real (non-technical) risk to weigh.
- **No SLA, no support.** "Use at your own risk"; not affiliated with Google.

## 7. Official Enterprise API comparison

The official [Gemini Notebook Enterprise API](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-notebooks) is a different product with different constraints:

- **Availability:** **Preview (Pre-GA)** — "as is", limited support, terms subject to change.
- **Documented operations:** notebook **management** — `notebooks.create`, `get`,
  `listRecentlyViewed`, `batchDelete`, `share`; add data sources; plus audio-overview /
  podcast generation methods documented separately.
- **Not documented as available:** the **chat / grounded-Q&A** workflow and the broader
  study-artifact generation (study guides, quizzes, flashcards) that Continuum's learning
  loop would actually consume. So even the official API does **not** currently cover
  Continuum's core need.
- **Setup burden / cost:** requires Gemini Notebook Enterprise setup, **licenses**, a
  Google Cloud project number, region selection (US/EU/Global), and the
  "Cloud Gemini Notebook User" IAM role per shared user — an org-level, paid, gated path
  unsuitable for individual student users.

**Do not conflate the two:** Enterprise ≠ a stable consumer API. Enterprise is
management-oriented, licensed, and preview; the consumer automation is undocumented.

## 8. Integration architecture (proposed, NOT implemented)

If pursued **experimentally and locally only**, the isolated boundary should be:

```
Continuum Next.js app
        ↓  (feature flag: NOTEBOOKLM_ADAPTER=experimental, off by default)
feature-flagged integration boundary  (typed request/response contract)
        ↓  (localhost only; subprocess or 127.0.0.1 microservice)
local Python adapter  (thin FastAPI/CLI wrapper)
        ↓
unofficial notebooklm-py client  (undocumented batchexecute RPC)
```

- **Process boundary:** a separate local Python process (subprocess or a `127.0.0.1`
  FastAPI sidecar). Never in the Next.js runtime; never exposed publicly.
- **Minimal endpoints:** `POST /notebooks` (create), `POST /notebooks/:id/sources`
  (add), `GET /notebooks/:id/sources/:sid` (status), `POST /notebooks/:id/ask`
  (grounded Q&A + citations), `POST /notebooks/:id/artifacts` (generate),
  `GET /jobs/:jobId` (poll), `DELETE /notebooks/:id`. Nothing else.
- **Credential/session storage:** auth artifacts kept **outside the repo**, in a
  user-scoped local file with strict permissions (or OS keychain); encrypted at rest;
  never committed, logged, or returned in API bodies.
- **Timeouts + job polling:** every call time-boxed; long-running generation uses the
  library's `wait_for_completion(..., timeout)` with a hard ceiling and cancellation.
- **Circuit breaker:** trip on repeated `RPCError` / auth failures and stop calling for a
  cooldown, exactly like Continuum's existing provider breakers.
- **Audit logging:** log *that* a NotebookLM call happened and its outcome — **never**
  cookies/tokens/source contents.
- **User consent + data deletion:** per-item, explicit opt-in before any upload; a
  documented "delete the NotebookLM notebook" path; deleting in Continuum should offer to
  delete the mirrored NotebookLM notebook.
- **Fallback:** if the adapter is disabled, unauthenticated, or broken, Continuum's
  **native** research/learning flows continue unaffected. **No NotebookLM failure may
  break Continuum's native workflows.**
- **UI label:** "Experimental — unofficial integration," alongside the existing honest
  Connections copy.

Continuum already ships the native equivalents this would duplicate: source ingestion,
chunking, vector retrieval, grounded citations, study-material generation, and the
resource broker. NotebookLM should therefore be at most an **optional handoff /
experimental adapter**, which is exactly how the current Connections screen frames it
("Personal NotebookLM does not expose a general account-connection API… will not pretend
it is connected").

## 9. Estimated implementation effort (if ever pursued)

- Local Python sidecar (FastAPI wrapper over `notebooklm-py`, ~6 endpoints), health +
  circuit breaker: ~2–3 days.
- Feature-flagged Next.js boundary + typed client + consent UI + audit logging: ~2–3 days.
- Secure local credential custody + a safe, documented login UX (still user-driven Google
  auth): ~2–4 days, and the **hardest** part — this is where the ToS/privacy risk lives.
- Ongoing maintenance: **unbounded / reactive** — expect periodic breakage on NotebookLM
  frontend changes. This recurring cost is the main argument against production use.

## 10. Final go / no-go verdict

**Verdict: `experimental local adapter only` — NOT production-viable.**

- The unofficial client is impressively complete and would technically satisfy
  capabilities 1–12 **as documented**, but it rides undocumented `batchexecute` RPCs that
  "can break anytime," needs per-user Google credential/cookie custody, and carries
  ToS/bot-detection risk.
- The official **Enterprise** API is Preview, licensed/org-gated, and does **not** yet
  document the chat/artifact workflow Continuum needs — so "wait for an official consumer
  API" is the right long-term posture, but Enterprise is not a present substitute.
- Continuum's **native** ingestion → retrieval → grounded-citation → study-material stack
  already covers the need without any of this risk.

**Recommendation (confirms the expected default):** keep NotebookLM as an **optional,
feature-flagged, local-only experimental adapter / handoff** — never a required
production dependency, never in the request path of native research or learning, and only
behind explicit per-item user consent. Revisit only if Google ships a **stable, official,
consumer** chat+artifact API. This matches how the Connections screen already represents
NotebookLM today.
