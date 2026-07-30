# How an answer gets grounded

Continuum's one-line claim is that the AI knows your work. This is the path that
has to run for that to be true, and the five ways it silently did not.

All five were found by asking production one question whose answer sat verbatim
in an indexed passage:

> Why can't OASIS claim single-cell co-expression?

The workspace holds a source that answers it exactly. The assistant replied that
OASIS "is a database that provides information on the co-expression of genes
across multiple cells" — a different OASIS, invented — and disclosed *"Answered
from general knowledge — nothing in your workspace matched."*

The disclosure was honest every time. That is the only reason this was findable
at all, and it is worth keeping in mind when reading what follows: each fix
below was necessary, none was sufficient, and four of them changed nothing
observable because a later one was still broken.

## The path

```
message
  → classify              (classify.ts)
  → follow-up shortcut?   (classify.ts · isAnsweredByConversation)
  → retrieval plan        (classify.ts · retrievalPlan)
  → four legs, concurrent (orchestrator.ts)
        page context
        workspace records   load_context
        memory chunks       searchMemory
        source passages     searchSourcePassages   ← the documents
  → provenance             (provenance.ts)
  → prompt                 (prompt-context.ts)
  → output filter          (output-filter.ts)
  → answer + citation chips
```

## The five failures, in the order they were fixed

**1. There was no source leg.** Retrieval covered workspace records, memory
chunks, and files the user had explicitly attached to that message. Nothing
searched `source_chunks`. The indexed documents were reachable only by attaching
a file by hand or standing on that source's Library page. `vectorSearch` had
existed since the beginning with one caller, an internal endpoint.

**2. The lexical fallback searched for the whole question.** `searchResearch`
does a single `ILIKE '%…%'`, so passing it a question asks the database for a
document containing that exact sentence. No document ever contains one. Now:
four longest words, queried separately, interleaved.

**3. `searchResearch` orders passages last and then slices.** Claims, decisions,
notes, *then* passages, `.slice(0, limit)`. Asking it for six results on a term
that also appears in a decision returns six decisions and zero passages. It was
structurally incapable of returning the thing it was being used to return.
There is now a passage-only query, `searchSourceChunksLexical`.

**4. The output filter deleted answers for quoting the source.** The filter
suppresses a reply sharing a long verbatim run with what the model was told —
correct for the system prompt and the output contract, catastrophic once
retrieved passages joined the prompt. An answer that quoted the passage became
indistinguishable from one reciting our instructions and was dropped in full;
the user saw *"I couldn't produce a clean answer for that."* The contract three
lines above the filter asks the model to cite the supplied passage, so the
detector was punishing compliance. `buildAcademicPrompt` now returns
`instructions` — persona plus contract, no retrieved content.

**5. The follow-up shortcut swallowed the question.** Step 2 skips every leg
when a message looks like a bare "why?", because the answer is already on
screen. Its only guard was 80 characters. The question is 47. So it was taken
for a follow-up and *no retrieval ran at all* — which is why the four fixes
above changed nothing. Every diagnostic said retrieval had run and found
nothing: `degraded` was empty, no error was logged, and the request stayed
classified `about_my_work` throughout. What decides it now is what remains once
the opener is stripped: "why?" leaves nothing, "expand on the second one" leaves
"on the second one", a real question leaves its subject.

## Two supporting changes

**The classifier reads the user's own titles.** It used to decide whether the
user's material was relevant without looking at the user's material — the
question names no workspace noun and uses no possessive, so it scored 0.55 on a
guess. OASIS is the title of the asker's own project. A proper noun someone has
named their work after is the strongest available signal, and it costs one small
select to know. Generic words are dropped before they can fire, and matching is
word-boundary, so "oases" does not match "oasis".

**Vector and lexical race.** `embedQuery` is a network round trip. Awaiting it
and only falling back on *failure* means a slow-but-successful embedding spends
the whole deadline, the deadline fires, and the leg returns empty — a latency
spike wearing the costume of an empty library. They now run concurrently; vector
still wins when it arrives.

## What holds the line

- `tests/assistant-orchestrator.test.ts` — the source leg runs, cites what it
  retrieved, and is not short-circuited by a why-question with its own subject.
  Also that a real follow-up and a genuinely general question still cost nothing.
- `tests/assistant-output-filter.test.ts` — a quoted passage survives the filter,
  a recited contract does not, and `instructions` excludes retrieved content.
- `tests/view-contract.test.ts` — the passage query exists, the fallback uses it,
  and `searchResearch` still orders passages last, which is *why* it must not be
  used here.

## The general lesson

Every one of these failed as an empty array. An empty array renders as a
well-designed "nothing here yet", which is indistinguishable from the truth. The
better the empty states, the more invisible this class of bug becomes — so the
tests that matter are the ones asserting a specific thing *is* retrieved, not
that retrieval did not throw.
