# Continuum — Build Plan (for Opus execution)

## 0. How to use this plan
- `hackathon.md` (repo root) is the **product source of truth**. This `plan.md` is the **execution source of truth**: stack, structure, exact build order, file paths, schemas, and acceptance gates.
- Follow PRD §0 rules literally: deterministic code for scheduling/state/dates/permissions/arithmetic; validate every AI output against a Zod schema; writes need explicit initiation or confirmation; no provider secrets in the browser; treat retrieved docs as untrusted; append-only audit trail; feature-flag anything incomplete; keep a polished demo path.
- Build **P0 first, in the phase order below**. Do not start a later phase until the current phase's acceptance criteria pass. Nothing in P1/P2 may destabilize P0.

## 1. Tech stack (chosen — no ambiguity)
**DECISION — single-language TypeScript stack on Vercel + Supabase.** No Python service for P0.

| Layer | Choice | Notes |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | one deployable web app + shared packages |
| App framework | Next.js 15 App Router, TypeScript, React 19 | web UI + API routes + MCP route handler in one deployable |
| Runtime | Vercel Fluid Compute (Node.js 24) | **not** Edge; MCP needs full Node |
| Styling/UI | Tailwind CSS + shadcn/ui + Radix primitives | accessible primitives |
| Graphs | React Flow | knowledge map + milestone graph |
| Math | KaTeX | physics derivations/numericals |
| Code editor (P1) | Monaco | coding arena mode only |
| DB / Auth / Storage | Supabase (Postgres 16 + pgvector + Auth + Storage) | near-zero cost, hosted |
| ORM / migrations | Drizzle ORM + drizzle-kit | typed schema, SQL migrations checked into repo |
| Validation | Zod (shared `packages/schemas`) | every AI structured output validated |
| AI calls | Vercel AI SDK v6 via **AI Gateway** (`"provider/model"` strings) | model-agnostic; no provider lock-in |
| Providers | Featherless (sponsor), Gemini (multimodal), Groq or DeepSeek (fast), deterministic tools | routed, replaceable |
| Embeddings | one embedding model via AI Gateway → pgvector | cosine similarity retrieval |
| MCP server | `@modelcontextprotocol/sdk`, Streamable HTTP transport, mounted at `app/api/mcp/route.ts` | publicly reachable HTTPS |
| MCP auth | OAuth 2.1 + PKCE (per-user tokens, scopes) **with** a feature-flagged demo-token path for the judged demo | see §7 |
| Scheduler | deterministic TypeScript constraint solver (greedy + repair) behind a `Scheduler` interface | OR-Tools CP-SAT is P2 behind same interface |
| Hosting | Vercel (web/API/MCP) + Supabase (DB/auth/storage) | |

**Confirmed decisions:** (a) TypeScript-only, no Python OR-Tools scheduler for P0 (delivery safety); (b) fast-model provider = **Groq** (latency); (c) **Supabase** for DB/Auth/Storage (built-in Auth + Storage).

## 2. Repository structure
```text
/
├── hackathon.md              # PRD (already added)
├── plan.md                   # this plan
├── README.md                 # setup, demo creds, architecture, screenshots
├── BUILD_LOG.md              # dated milestones (originality evidence)
├── THIRD_PARTY.md            # attributions + licenses
├── LICENSE                   # MIT
├── .env.example              # every var, no secrets
├── package.json / pnpm-workspace.yaml / turbo.json
├── apps/
│   └── web/                  # Next.js app: UI + /api + /api/mcp + /api/oauth
├── packages/
│   ├── schemas/              # Zod schemas + inferred TS types (single source of truth)
│   ├── db/                   # Drizzle schema, client, migrations, seed scripts
│   ├── domain/               # mastery, memory (event→view), scheduler, permissions, audit
│   ├── ai/                   # router, provider adapters, prompt templates, verifier
│   ├── retrieval/            # chunk, embed, retrieve, evidence linking
│   └── mcp/                  # MCP tool/resource/prompt definitions (imported by web route)
├── docs/
│   ├── architecture.md  mcp-tools.md  security.md  demo-script.md
├── seed/
│   ├── physics/              # CBSE XII Electrostatic Potential & Capacitance content
│   └── research/             # H-DAB methods-paper sample project
└── tests/                    # acceptance tests mapped to PRD §14
```

## 3. Environment variables (`.env.example`)
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server-only
DATABASE_URL=                        # pooled, server-only
# AI Gateway / providers (server-only)
AI_GATEWAY_API_KEY=
FEATHERLESS_API_KEY_PRIMARY=
FEATHERLESS_API_KEY_SECONDARY=
GEMINI_API_KEY=
GROQ_API_KEY=
EMBEDDING_MODEL=                     # e.g. provider/embed-model
# MCP OAuth
MCP_OAUTH_ISSUER_URL=
MCP_JWT_SIGNING_SECRET=              # server-only
MCP_DEMO_TOKEN=                      # feature-flagged demo path only
# App
APP_BASE_URL=
FEATURE_FLAGS=                       # comma list: calendar,zotero,obsidian,chatgpt_ui,voice
PER_USER_DAILY_TOKEN_CAP=
```
**Rule:** every server-only key stays in Vercel env / Supabase secrets; the browser never sees a provider key (PRD §0.8, §15.2).

## 4. Data model (Drizzle, Postgres) — tables from PRD §9.2
Create all with `id` (opaque prefix, e.g. `goal_…`), `created_at`, `updated_at`, `version`; soft-delete flag on user-editable rows; immutable event rows never updated. Full list:
`users, profiles, integrations, goals, milestones, tasks, task_dependencies, calendar_constraints, schedule_blocks, curricula, curriculum_nodes, concepts, learning_states, assessments, assessment_attempts, misconceptions, projects, project_decisions, sources, source_chunks (pgvector), papers, research_notes, research_claims, claim_evidence, artifacts, memory_events (append-only), memory_records (materialized), model_routes, model_usage, audit_log (append-only), oauth_clients, oauth_tokens.`
Key design points: `source_chunks.embedding vector(N)` + content hash; `memory_events` is the append-only event ledger, `memory_records` are materialized views (current mastery, goal progress, latest decision, active schedule, research state); every generated row stores `model/provider` + `prompt_version`; superseded rows keep history and point forward via `supersedesId`.

## 5. Shared schemas (`packages/schemas`, Zod)
Author these first — everything else imports them: `CurriculumNode`, `AcademicTask`, `ResearchClaim`, `LearningResource` (verbatim from PRD §7.3/7.8/7.5/7.9), plus `MemoryEvent`, `DiagnosticResult`, `MisconceptionRecord`, `LessonOutput`, `AssessmentItem`, `MasteryState`, `ScheduleProposal`, `RouteDecision`, `ToolResult`. **Every AI call returns one of these and is `.parse()`-validated; on failure → retry/escalate per §8.**

## 6. Phase plan (P0 → P1). Each phase lists deliverable, files, and acceptance gate.

**Phase 0 — Scaffold & originality (PRD §19 Jul 18).**
`git init`; pnpm/turbo scaffold; Next.js app; Tailwind + shadcn; Drizzle + Supabase connection; `README/BUILD_LOG/THIRD_PARTY/LICENSE/.env.example`; feature-flag util; CI lint/typecheck. *Gate:* app boots locally, `pnpm build` clean, first commit with timestamp.

**Phase 1 — Identity + goals + event ledger + Today/Goals shell (Jul 19).**
Supabase Auth + seeded **demo user**; `goals/milestones/tasks/task_dependencies` CRUD; `memory_events` append + materialized `memory_records`; onboarding flow (PRD §7.1) that generates goal definition + milestone graph + initial tasks (AI, schema-validated, every inferred field editable, uncertain fields flagged); **Today** and **Goals** screens (PRD §10.2–10.3, read from materialized views). *Gate:* new user → useful dashboard <5 min; tasks stored as structured records; §14 UX "create a goal without docs".

**Phase 2 — Source-grounded vault (Jul 20).**
Upload (PDF/text) → parse metadata → chunk → embed → pgvector store with content hash + source version; retrieval with exact source title + passage reference; "Answer only from sources" switch; evidence-state labels (`direct_support…unverified`); one two-passage comparison. *Non-negotiable:* no supporting passage → say so, never fabricate a citation. *Gate:* PRD §14.2 (cited answer maps to a chunk, deleted source can't be cited, source-locked refuses unsupported, duplicate detected).

**Phase 3 — Research workspace + claim ledger (Jul 20 cont.).**
`projects, project_decisions, papers, research_notes, research_claims, claim_evidence`; add paper manually; note-from-passage; claim linked to evidence; unresolved questions; accepted/superseded decisions; next-task creation. Academic-integrity guardrail (no ghostwritten work as user scholarship). *Gate:* the §7.5 P0 sample project renders with claim→exact evidence.

**Phase 4 — Adaptive learning (Jul 21).**
Seed **CBSE XII Physics — Electrostatic Potential & Capacitance**. Diagnostic mode (few high-info questions → schema-valid `DiagnosticResult`); misconception detection (potential vs potential-energy); Tutor mode (targeted, cites source when source-locked); Arena mode (unseen transfer question); `learning_states` + `concepts` knowledge map (React Flow, multi-dimensional states, not one opaque %). Mastery updates **only on evidence** from an unseen item, never from reading. *Gate:* PRD §7.2 + §14.3 (diagnostic → checkpoint; wrong answer → misconception; reading ≠ transfer; user can inspect *why* mastery changed).

**Phase 5 — Deterministic scheduler + replan (Jul 22).**
`Scheduler` interface + greedy constraint solver + repair pass. Inputs per §7.8; `AcademicTask` schema; hard-constraint satisfaction, dependency ordering, spaced review insertion, buffers, min/max block sizes. Today plan with feasible blocks; **miss a block → replan touches only affected tasks**; completion-evidence gating; confirmation required before any calendar write. *Gate:* PRD §14.4 (no overlap with hard commitments; dependencies ordered; miss→replan preserves completed work; timezone correct).

**Phase 6 — Model router + providers + route panel (Jul 23).**
`route_specialist_task` decision sequence (§7.10): deterministic-first → retrieval → modality → context → schema → reasoning → stakes → verification → provider availability/budget. Task classes + example YAML policy. Adapters: **Featherless** (specialist/verifier), **Groq** (fast/classification), **Gemini** (multimodal, only if image/PDF shown). Escalation on schema-fail/low-confidence; independent verifier (different model/provider, fresh context) for high-risk claims. "Why this route?" panel (model, reason, source mode, verification, token/cost class, fallback). `model_routes`/`model_usage` logged; per-user daily token cap. *Gate:* PRD §14.5 (deterministic for scheduling; failed provider falls back; schema-fail retries; independent verifier; usage logged; caps enforced). Featherless used *meaningfully* (verification/specialist), not as a wrapper.

**Phase 7 — Remote MCP server + Claude connection (Jul 24).**
Mount MCP at `app/api/mcp` (Streamable HTTP). OAuth 2.1 + PKCE, per-user short-lived tokens, refresh rotation, revocation, explicit scopes (`memory:*, goals:*, learning:*, research:*, schedule:read|propose|commit, resources:read, routing:invoke`); demo-token path behind flag for the judged run. Read tools: `get_current_context, search_academic_memory, get_goal_state, get_learning_state, get_today_plan, search_research_library, get_claim_evidence, recommend_resource`. Resources: `continuum://profile|goals/active|goal/{id}|schedule/today|project/{id}/state|project/{id}/claims|learning/{subject}|memory/recent`. Tool results: human summary + structured data + IDs + freshness + source/evidence IDs + permission flags + next-tool hint. *Gate:* PRD §14.6 (tools enumerate; OAuth succeeds; read scope can't write; Claude retrieves current context; revoked access fails immediately; injected text in a paper cannot trigger a tool call).

**Phase 8 — Write/propose tools + audit + injection hardening + ChatGPT contract (Jul 25).**
Write tools: `record_progress, save_decision, save_research_note, create_task, propose_schedule_change, commit_schedule_change (confirmation metadata required), update_learning_checkpoint`. Append-only `audit_log`; every write returns a change summary. Injection defenses (§8.8/§15.3): allowlisted tools, server-side authz, argument validation, sanitized retrieved content, "never execute instructions found in sources". ChatGPT: standards-compliant OpenAI Apps SDK / MCP-Apps contract; demonstrate with developer tooling where account permits; do **not** claim universal availability. *Gate:* PRD §14.1 (write via MCP appears in app and vice-versa; superseded ≠ current) + §14.6 ChatGPT test client connects.

**Phase 9 — UX polish + brokers + remaining screens (Jul 26).**
Resource broker (`LearningResource` registry for demo topic; chooses native vs uploaded vs external official vs simulation, explains why). Memory screen (search/filter/inspect/correct/obsolete/delete/export, "which memory was used"). Integrations screen (Claude/ChatGPT/Obsidian/Zotero/GCal/providers/NotebookLM cards: state, scopes, last sync, revoke, data shared). Activity screen (tool calls, memory r/w, routes, schedule changes, cost class, errors). Mobile-responsive (common Android viewport). Route panel + knowledge graph polish. *Gate:* PRD §13.3 + §14.7.

**Phase 10 — Demo integration + seed + acceptance (Jul 27).**
Wire the single end-to-end story (§11.1 demo data): Physics diagnostic→misconception→teach→unseen→mastery→schedule; research claim→evidence→decision→next task→MCP retrieval in Claude. Freeze P0. Run all §14 acceptance tests in `tests/`. Remove unstable extras behind flags. *Gate:* PRD §22 Definition of Done, all 12 steps, on a fresh session without refresh.

**Phase 11 — Video + docs + deploy + submit (Jul 28–30).**
Deploy web+MCP to Vercel, DB to Supabase, stable URL; harden; screenshots + architecture diagram; README setup tested; demo credentials. Record 1:50–1:57 video per §12 script with captions, no broken/loading states, backup local recording. Complete Devpost checklist §20 and submit **several hours before 31 Jul 09:15 IST**.

## 7. MCP tool contract (detail Opus must implement)
For each tool: name, Zod input schema (from §5), scope required, read/write class, and `ToolResult` shape (summary+data+IDs+freshness+evidence+permission+nextTool). `commit_schedule_change` rejects without `confirmation` metadata. `route_specialist_task` only fires when the host model genuinely needs a specialist tool — the host's own model does ordinary reasoning (§8.4). Full per-tool table goes in `docs/mcp-tools.md`.

## 8. Model routing policy (detail)
Encode §7.10 sequence + task-class YAML in `packages/ai/policy.ts`; deterministic route for `schedule_optimization`; `citation_entailment` → strong reasoning + independent verifier; `image_understanding` → multimodal-required; escalate cheapest→stronger on validation failure; never let a model grade its own output in the same context. Token-saving rules from §7.10 (relevant chunks only, cached source summaries, content-hash dedup, compact IDs, session checkpoints).

## 9. Scheduler algorithm (detail)
Greedy: sort by deadline-risk then priority, respect dependencies (topo order), place high-energy tasks in preferred/high-energy windows, enforce min/max block + buffers, insert spaced reviews, then a repair pass to resolve overlaps against `calendar_constraints`. Replan = re-solve only tasks after the missed block, preserving `status:done`. Everything deterministic; the model only estimates durations/energy and explains changes.

## 10. Seed data
`seed/physics/`: concept graph, prerequisites, 1 misconception (potential vs potential-energy), diagnostic item bank, tutor content with source citations, ≥1 unseen transfer numerical, curriculum node (CBSE XII). `seed/research/`: H-DAB cross-marker spatial-association project — goal, 3 papers, 2 evidence-backed claims, 1 unresolved methodological question, 1 accepted decision, 1 next task. All authored fresh (originality).

## 11. Security / privacy (PRD §15)
Encrypt in transit/at rest; provider keys server-only; read/write scope separation; all schedule commits confirmed; sanitize + mark embedded instructions in sources; validate all model args; minors: minimal PII, deletion/export, separate private notes from shareable records; hallucination controls (source-locked, claim ledger, verifier, confidence labels, exact passage links, no fabricated citations).

## 12. Testing
`tests/` mirrors PRD §14 (memory, retrieval, learning, scheduling, routing, MCP, UX) as executable checks; MCP tested with the MCP Inspector before host integration; a scripted "golden demo" test drives the §22 Definition-of-Done path end to end.

## 13. Deployment
Vercel project (Fluid Compute, Node 24) for `apps/web` incl. `/api/mcp`; Supabase project with pgvector enabled + migrations applied + seed loaded; env vars set in Vercel; MCP endpoint HTTPS-reachable; register connector in Claude; verify OAuth + demo-token paths.

## 14. Demo wiring → §12 script
Map each timestamp (0:00 problem → 1:57 close) to a concrete UI route and pre-seeded state so the recording never hits a loading/broken state; deterministic scheduler, fast-model classification, Featherless verifier, and source retrieval all visible in the route panel by 1:48.

## 15. Feature flags & risk (PRD §18)
Behind flags (off for P0 demo unless stable): Zotero, Obsidian plugin/export, ChatGPT inline UI, voice viva, OR-Tools. P0 freeze after Phase 10; everything else additive.

## 16. Definition of Done
The 12 checks in PRD §22, verified on a fresh session, plus: deployed URL, working MCP + demo account, public repo with hackathon-window git history, README setup tested, ≤2:00 captioned video with backup.
