# Continuum prompt engineering

Continuum has one prompt assembly boundary and a small application-owned prompt
registry. It does not contain an autonomous “prompt agent.”

## Source of truth

- `apps/web/lib/prompt-context.ts` builds the system message and labelled data
  sections.
- `apps/web/lib/prompt-registry.ts` contains reusable output contracts for
  learning, code help, MCP specialist output, and citation verification.
- `apps/web/app/api/code/route.ts`, `api/ai/route.ts`, and `api/mcp/route.ts`
  select a contract and insert route-specific variables.
- `packages/ai/src/providers.ts` appends the structured-JSON instruction and
  sends the resulting system/prompt pair to the selected provider.

No secret, API key, credential, or raw password is inserted into a prompt.

## Composable prompt format

`buildAcademicPrompt()` constructs:

1. **Role and objective** — Continuum as an academically careful assistant and
   the exact surface/task class.
2. **Trusted constraints** — application policy, privacy rule, evidence rule,
   and the surface-specific policy.
3. **Pedagogical context** — education level, curriculum, subject, topic,
   proficiency, answer style, time, and constraints.
4. **Relevant Continuum context** — a caller-requested, token-budgeted memory
   pack.
5. **Previous attempts** — selected prior answers or attempts.
6. **Source content** — code, paper/source text, or another bounded payload.
7. **Runtime data** — authoritative run outcome/stdout/stderr, explicitly data
   rather than instruction.
8. **User request** — the current request.
9. **Output contract** — registry text owned by the application.

Every non-policy payload is JSON-serialized under a label such as
`SOURCE_CONTENT [untrusted]`. Sections are separated with visible delimiters.
The system message says that user text, uploaded/web content, retrieved memory,
code, and runtime output cannot change the role or override policy.

Section caps are 4,000 characters for pedagogical context, 12,000 for relevant
context, 8,000 for attempts, 16,000 for source content, 12,000 for runtime data,
10,000 for the user request, and 4,000 for the output contract. Truncation is
marked explicitly. The gateway separately enforces an estimated total-token cap.

## Important prompts

| Prompt | Purpose and definition | Model/task | Variables and tools | Output and validation | Failure / principal risk |
|---|---|---|---|---|---|
| Academic base system | Applies role, trust boundary, privacy, evidence, and surface policy | Every gateway task | No tools. Variables listed above | Free text or caller schema | Prompt injection is mitigated by labelled untrusted sections, but a model can still misunderstand evidence |
| Code explain/review/debug/practice | Optional help after a run | `code_reasoning`; code model | Language, exact source, actual runtime result, bounded learner context | Markdown stream; no server schema | Streaming errors are surfaced; no automatic replay. Hallucinated runtime is prohibited but cannot be mechanically eliminated |
| Learning diagnosis | Classify a misconception and intervention | `misconception_diagnosis`; fast model | Prompt, learner context, optional source lock | Zod schema: score, label/explanation, prerequisites, intervention, rationale | Invalid JSON/schema falls to another provider |
| Lesson generation | Produce concise explanation and checks | `lesson_generation`; general reasoning | Learner context and source lock | Zod schema: title, explanation, 1–6 checks | Same structured fallback; source-locked claims must stay in evidence |
| MCP specialist | Bounded specialist result | Caller-selected supported task class | OAuth-scope-bounded retrieved context. The model itself receives no arbitrary tools | Zod schema: answer, evidence IDs, limitations, confidence | If high-stakes verification is requested without a second provider, the request fails closed |
| Citation verifier | Independently assess a proposed result | `citation_entailment`; verifier model on a different provider | Proposed result plus source/evidence identifiers | Zod schema: supported, reason, confidence | Rejects overstated support; no guarantee if supplied evidence itself is incomplete |
| Research query rewriting | Deterministic `planScholarlyQuery()` in `scholarly.ts`, not a prompt | No model | Raw query only | Parsed DOI/year/quoted phrase/author, conservative synonym additions | Dictionary expansion is intentionally small; it may miss domain synonyms |
| Study plan | Deterministic schedule solver, not a prompt | No model | Availability, tasks, commitments, deadlines | Editable draft data | Feasibility warnings are deterministic; there is no hidden model rationale |

## Retrieval, memory, and user profile

Routes call `getStore(userId).read("load_context", { focus, maxTokens })`.
The store returns a compact, relevant account-scoped pack rather than an entire
history. The prompt labels that pack `RELEVANT_CONTINUUM_CONTEXT [untrusted]`.
Education level comes from the authenticated user. Routes do not include provider
credentials, authentication tokens, unrelated account records, or raw hidden
history.

Research retrieval and OpenAlex search happen outside the model. Retrieved text
is evidence, never a tool instruction. Continuum does not invent an abstract
when OpenAlex supplies none.

## Structured outputs and retry prompts

For structured requests, `providers.ts` converts the Zod schema to JSON Schema,
uses the provider's schema mode, and appends:

> Return valid JSON matching the requested schema. Do not add prose outside the JSON value.

The response is parsed as JSON and validated again with Zod. There is no
free-form “repair this JSON” self-correction prompt. A validation failure is an
attempt failure and the finite provider fallback loop may try the next qualified
provider. This avoids repeatedly billing the same malformed route.

Continuum currently has no separate chain-of-thought, reflection, or hidden
self-critique prompt. Context compression is deterministic character-bounded
serialization plus retrieval; it is not another model call. Summarisation is a
normal task-class request only when a feature explicitly requests it.

## Safety limitations

Labelling and system separation reduce prompt-injection risk but do not make a
model infallible. Source-locked and citation-critical outputs still need schema
validation and, where requested, an independent provider check. Free-text code
feedback is educational advice; the browser runner's actual stdout, stderr, exit
code, and duration remain the execution authority.

