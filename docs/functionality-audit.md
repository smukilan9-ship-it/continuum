# Functionality audit

Legend: **WORKS** (verified live), **WORKS (code)** (reviewed and wired,
not exercised live this pass), **PARTIAL**, **DEMO-WIRED** (functional but
tied to fixture data), **UNVERIFIABLE** (needs external credentials/account),
**FUTURE**.

Verification was done live against the real Neon DB + real providers, as a
freshly registered account (not the demo fixture), except where noted.

## Account & onboarding
| Feature | Entry | Backend | Status | Notes |
|---|---|---|---|---|
| Registration | `/login` | `/api/auth/register` → `createUser` (tx) | **WORKS** | scrypt hash; 201 |
| Login | `/login` | `/api/auth/login` → scrypt verify + lockout | **WORKS** | 200 + session cookie |
| Session | — | `/api/auth/session` → `getSession` | **WORKS** | ~100 ms read, no write-on-read |
| Logout | sidebar | `/api/auth/logout` → `revokeSession` | **WORKS (code)** | revokes token hash |
| Account recovery | Future work | managed verified recovery flow | **DEFERRED** | hackathon accounts use username/password only; users must retain their password |
| New-user empty states | all screens | SSR snapshot | **WORKS** | verified in browser (fresh account) |
| Public registration gate | — | `publicRegistrationEnabled` | **WORKS (code)** | off in prod unless enabled |

## Goals, tasks, projects
| Feature | Backend | Status |
|---|---|---|
| Create goal (app) | `POST /api/state {goal.created}` → `createGoal` | **WORKS** (created `goal_eaf07…`) |
| Create goal (MCP, via proposal) | `propose_goal_change` + app confirm | **WORKS (code)** — confirm is app-only by design |
| Create task / project | `create_task` / `create_project` (ownership-checked) | **WORKS (code)** |
| Record progress | `record_progress` (ownership-checked) | **WORKS (code)** |
| Next-action / Today | `getWorkspaceSnapshot("today")` | **WORKS** (rendered in browser) |
| Milestones, dependencies, energy, blockers | schema + scheduler | **WORKS (code)** — tables + solver present |

## Learning system
| Feature | Backend | Status |
|---|---|---|
| Misconception diagnosis | `/api/ai` (content schema) | **WORKS** (~3.8 s, valid) — fixed this pass |
| Lesson generation | `/api/ai` | **WORKS** (~2 s, valid) — fixed this pass |
| Mastery transitions | `packages/domain` `updateMastery` | **WORKS** (unit-tested; used by resource verify) |
| Evidence-gated mastery (unseen only) | resource verify path | **WORKS (code)** |
| Knowledge/learning state | `load_learning_state` | **WORKS (code)** |
| Local Ollama lesson | browser → loopback Ollama | **DEMO-WIRED** — loopback-validated, but returns fixture `conceptId`/`chunkIds`; needs a running Ollama to exercise |

## Research system
| Feature | Backend | Status |
|---|---|---|
| Project / decision / note creation | `create_project`/`save_decision`/`save_research_note` | **WORKS (code)** — ownership + source checks |
| Source upload + chunking + hashing + dedup | `/api/sources`, `packages/retrieval` | **WORKS (code)** — PDF/UTF-8 validation, content hash, injection marking |
| Embeddings + vector retrieval | pgvector HNSW + lexical fallback | **WORKS (code)** — falls back to lexical if embeddings fail |
| Claims + claim→evidence links | `save_research_claim`, `get_claim_evidence` | **WORKS (code)** — claims stay `unverified`, evidence must be user-owned passages |
| Decisions accepted/superseded | `saveDecision` (supersede tx) | **WORKS (code)** |

## Resource broker (differentiator B)
| Feature | Backend | Status |
|---|---|---|
| Reviewed registry + quality/authority metadata | `curatedResourceRegistry` + `resource_registry` | **WORKS (code)** |
| Native-vs-external ranking | `recommendBestResource` (deterministic) | **WORKS** (unit-tested, 7 tests) |
| Guided redirect (why/where/cost/time/focus/verify) | `recommendResource` payload | **WORKS (code)** |
| start → return → verify lifecycle | `/api/resources` actions | **WORKS (code)** — traced end-to-end in source |
| Evidence-gated mastery + outcome receipt + spaced follow-up | `/api/resources` verify | **WORKS (code)** |

## Scheduler
| Feature | Backend | Status |
|---|---|---|
| Deterministic plan + repair | `packages/domain` scheduler | **WORKS** (5 unit tests) |
| Propose → confirm → commit (separate writes) | `propose/confirm/commit_schedule_change` | **WORKS (code)** — writes the internal schedule only |

## Memory
| Feature | Backend | Status |
|---|---|---|
| Immutable event ledger + current-state records | `memory_events`/`memory_records` | **WORKS (code)** |
| Hybrid semantic + lexical retrieval, ranked, budgeted | `searchMemory` | **WORKS (code)** — lexical works without embeddings |
| Provenance + access log + token budget | `context_access_log`, `compactToBudget` | **WORKS** (returned in `load_context`) |
| Outcome receipts | `sync_session`/`session_receipts` | **WORKS** (created via MCP, read in app) |

## Model routing & providers
| Feature | Status |
|---|---|
| Task-class routing + deterministic scheduling route | **WORKS** (9 unit tests) |
| Fallback across providers, schema validation, budget cap | **WORKS** — now with an overall deadline |
| Independent verifier (second provider) | **WORKS (code)** |
| **Groq** | **WORKS** — carries structured + streaming (gpt-oss for JSON) |
| **Gemini (direct, 10 keys)** | **BROKEN (credentials/model)** — `gemini-3.5-flash` 503 / real models 404; routed around |
| **Featherless** | **BROKEN (credentials/model)** — `/v1/models` 404, configured IDs return empty; routed around |
| **AI Gateway** | **WORKS (code)** — opt-in only |
| Route logging + user-visible reason | **WORKS (code)** — `model_routes`/`model_usage` |

## Integrations
| Feature | Status | Notes |
|---|---|---|
| Claude remote MCP | **WORKS** | full protocol + continuity verified |
| Zotero library indexing | **UNVERIFIABLE** | needs API key; encrypted, paginated code path present |
| NotebookLM | **WORKS (code)** as export/handoff | correctly labeled a handoff (no consumer API) |
| Obsidian plugin | **WORKS (code)** | SecretStorage, folder-first opt-in, safe generated-note writes |
| Ollama (local/private) | **DEMO-WIRED** | browser→loopback, hostname-validated; needs a live Ollama |
| ChatGPT MCP | **FUTURE** | endpoint is standards-based; not a claimed product integration |

## Summary
The two differentiators (cross-assistant continuity, outcome-first resource
redirection) are genuinely implemented and, for continuity, verified live
end-to-end. The model layer works via Groq; Gemini/Featherless are blocked by
credential/model-availability, not code. The remaining UNVERIFIABLE items are
gated purely by external accounts/keys and have reviewed, wired code paths.
