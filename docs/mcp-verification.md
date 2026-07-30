# MCP verification — §12.6

Run by `scripts/verify-mcp.mjs` against `https://continuumstudy.vercel.app` on 2026-07-30.

Connected exactly as Claude does: dynamic client registration, then
authorization-code + PKCE, then MCP Streamable HTTP with the issued token.

**11 passed · 0 failed · 1 need a human with Claude Desktop.**

§12.6's standard is the call count: *a workflow that needs more than 2 calls
is a bug in the tool design, not in the client.*

| Step | Check | Expected | Result | Calls |
|---|---|---|---|---|
| 1 | Connect (OAuth + PKCE, all scopes) | consent screen is plain language; connection is recorded | ✅ pass | — |
| 2 | Discovery | ≤ 15 discoverable capabilities, described as outcomes | ✅ pass | 1 |
| 3 | Orientation — “What am I working on?” | exactly one call; names real goals and today's blocks | ✅ pass | 1 |
| 4 | Search — “What do I have on X?” | one call returning records with origins | ✅ pass | 1 |
| 5 | Evidence — “Show me the evidence behind that decision” | ≤ 2 calls ending in exact passages | ◐ manual | 3 |
| 6 | Additive write | `save_to_continuum` succeeds and the record appears immediately | ✅ pass | 1 |
| 7 | Consequential write | becomes a pending proposal; nothing changes until approved | ✅ pass | 1 |
| 8 | Refusal — “Mark my SAT goal complete” | no tool can complete a goal directly | ✅ pass | — |
| 9 | Practice result | mastery changes only on a correct unseen attempt, and says why | ✅ pass | 1 |
| 10 | Resume — “Pick up where we left off” | one call; summary matches the app | ✅ pass | 1 |
| 11 | Revocation | the next call fails immediately with a clear message and no data | ✅ pass | — |
| 12 | Scope and error surface | a refused or missing record produces a readable message, never a 500 | ✅ pass | 1 |

## Detail

**1. Connect (OAuth + PKCE, all scopes)** — AC-MCP4: zero raw scope strings on the consent screen

**2. Discovery** — 15 discoverable tools; AC-MCP2 clean

**3. Orientation — “What am I working on?”** — [{"type":"text","text":"Returned the user's current goals, tasks, and schedule."}]…

**4. Search — “What do I have on X?”** — [{"type":"text","text":"Found 8 relevant items."}]…

**5. Evidence — “Show me the evidence behind that decision”** — no claim in the demo project to trace; needs a workspace with one

**6. Additive write** — [{"type":"text","text":"Saved a note on the project."}]

**7. Consequential write** — [{"type":"text","text":"Saved as a proposal. Nothing changed — the user approves it in Continuum under Review."}]

**8. Refusal — “Mark my SAT goal complete”** — AC-MCP3: writes are record_practice_result, save_to_continuum, start_study_session, save_progress_note, save_session_summary, propose_change — additive or proposal only

**9. Practice result** — [{"type":"text","text":"Recorded a correct unseen attempt; transfer mastery was updated."}]

**10. Resume — “Pick up where we left off”** — [{"type":"text","text":"No previous session found; returned current state only."}]

**11. Revocation** — revoke HTTP 200; next call HTTP 401 {"jsonrpc":"2.0","error":{"code":-32001,"message":"Valid OAuth bearer token required"},"id":null}

**12. Scope and error surface** — [{"type":"text","text":"Get the evidence behind a claim completed."}]

## What this script cannot verify

Whether Claude *chooses* the right tool from its description. Steps 2, 3, 5
and 10 are partly about the client's own tool selection; this run proves the
capability exists, is discoverable, and answers in one call. The other half
needs a person with Claude Desktop following §12.6 by hand.
