# Demo walkthrough (2–4 minutes)

A canonical path for demonstrating Continuum to judges. Seed first:

```bash
pnpm seed:demo
pnpm dev
```

Then open the app and follow the steps. Everything below is real, seeded state — no mock
screens.

## The story

You are **Mukilan**, a Class 12 CBSE student. Continuum is your academic operating system:
it remembers your goals, your research, your misconceptions, and the evidence behind every
claim — and it shares that context with the AI tools you already use.

## Steps

1. **Sign in.** On `/login`, click **“Try the demo”** (or type `demo` / `demo123`). One
   click lands you on **Today**, signed in through normal authentication.

2. **Today — your priorities.** The “best next action” is a timed SAT geometry drill.
   At a glance: 4 active goals, 10 open tasks, 3 projects, 3 receipts. The schedule shows
   your next committed block, and “resume where you stopped” flags an external resource
   you started.

3. **Plan (Goals) — SAT progress.** Open **Plan**. The SAT goal reads *Raise SAT score
   from 1520 to 1570+*, **42%**, due **Oct 3, 2026**, with a task list showing one task
   already **done** (error-log review) and one **in progress**. The weekly plan
   shows fixed commitments protecting study time.

4. **Learn — SQL verified checkpoint.** Open **Learn** / **Memory**. The SQL unit shows a
   **verified checkpoint** on `commit()` / `rollback()` and a **resolved misconception**
   (“changes persist without commit()”), plus an active SAT misconception (arc-length vs
   sector-area).

5. **Research — OASIS.** Open **Research**. The **OASIS** project shows its purpose,
   2 sources / 3 decisions / 3 notes, and — surfaced inline — the key decision:
   *“Cross-marker spatial association must never be presented as same-cell co-expression.”*
   The source library lists the **ihc.md technical reference**, the **VALIS ANHIR
   benchmark**, and the SQL notes.

6. **Grounded question with citations.** Ask a grounded question over the sources, e.g.
   *“Why does OASIS not claim single-cell co-expression across serial sections?”* The
   answer is drawn from the indexed passages and returns **real citations**
   (`ihc.md · passage 1`, `passage 2`) with `retrievalMode: "vector"` — grounded, not
   generated. (Sources are embedded at seed time.)

7. **Sources.** The source library shows each source’s title, type, and indexed status,
   citation-ready, with a delete action — without a boxed tile per metadata field.

8. **Verification & receipts.** The SQL and SAT **outcome receipts** capture what was
   completed, decisions, misconceptions, and next actions. A verified Khan Academy
   resource activity (82%) demonstrates the external-resource → return-check → mastery
   loop.

9. **Memory.** Open **Memory**. Durable events, receipts, indexed sources, and the current
   learning state are searchable — grouped as decisions, misconceptions, progress,
   preferences, and research findings, not raw logs.

10. **Reset any time.** If you edited data mid-demo, run `pnpm seed:demo` to restore the
    account to its canonical state before the next run.

## Talking points

- **One memory across tools.** The same goals, sources, and decisions are available in the
  app and to any authorized MCP assistant.
- **Evidence over vibes.** Claims stay `unverified` until linked to a user-owned passage;
  grounded answers cite exact passages and refuse when nothing matches.
- **Honest research.** The OASIS project encodes real methodological guardrails (no
  same-cell co-expression from serial sections; similarity-only registration; a
  fail-closed certification gate) drawn from the actual `ihc.md` reference.
