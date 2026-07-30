# §19 acceptance — what was checked, and how

Every criterion in `redesign.md` §19, with the thing that actually verifies it.
Where a criterion is only partly mechanical, the manual half is named rather
than folded into a tick.

Reproduce the mechanical half with:

```bash
pnpm test && pnpm typecheck && pnpm build
node scripts/verify-release.mjs             # §19.1, §19.7, §19.10 — needs a dev server
pnpm test:e2e                               # §19.2, §19.4, §19.8
npx lhci autorun                            # §19.9 — needs a production build on :3010
node scripts/verify-mcp.mjs <deployment>    # §19.5
```

---

## 19.1 Every route

`scripts/verify-release.mjs` drives 19 routes × 2 themes × 3 widths (320/375/1440)
and asserts, for each: no horizontal scroll, exactly one `<h1>`, no banned
terminology in the rendered DOM, and one accent-filled element. The per-route
acceptance criteria (AC-M1…M8, AC-L1…L5, AC-H1…H5, AC-A1…A10, AC-G1…G5,
AC-P1…P3, AC-PL1…PL4, AC-LN1…LN5, AC-B1…B5, AC-LB1…LB3, AC-Z1…Z3, AC-RV1…RV3,
AC-CX1…CX3, AC-CN1…CN3, AC-ST1…ST3, AC-S1…S4, AC-O1) are carried by the Vitest
suite and the nine Playwright journeys.

**Labelled loading state and a usable error state** are asserted per component
in `tests/components/` rather than per route; `LoadingState` and `ErrorState`
are single components, so the assertion lives where the behaviour does.

## 19.2 Every major workflow

| | Workflow | Where |
|---|---|---|
| W1 | New user → populated goal page | `journey-new-user` |
| W2 | Judge → demo workspace in **1 click** | `journey-new-user` (asserts the single click) |
| W3 | Ask → cited answer → open the record | `journey-ask` |
| W4 | Find a paper → save → see it on the goal | `journey-research` |
| W5 | Start studying a weak concept | `journey-study` |
| W6 | Run code → output, no scrolling | `journey-build` |
| W7 | Build and save a week in ≤ 5 interactions | `journey-plan` — counts the interactions |
| W8 | Connect Zotero in one dialog, test before save | `journey-zotero` |
| W9 | Approve a proposal in ≤ 2 clicks | `journey-review` |
| W10 | Cross-tool continuity | `journey-continuity` |

The **timing** halves of W1 (≤ 90 s) and W3 (first token < 1.5 s) are in
`docs/performance-baseline.md`, not in the journeys — a wall-clock assertion on
a laptop under load is a flake generator, and the budget is measured directly.

## 19.3 Every integration

Claude/MCP is `scripts/verify-mcp.mjs` plus the §12.6 procedure in
`docs/mcp-verification.md`. Zotero's one-dialog, test-before-save contract is
`journey-zotero`. OpenAlex's "Working — no setup needed" and the shared status
vocabulary are `journey-connections`, which asserts every card's status is one
of the seven allowed words. The OpenAlex 400/429/5xx messages are
`tests/openalex.test.ts`. Ollama's diagnostics, including the Safari case, are
`tests/connection.test.ts`.

**Not script-checkable:** whether Obsidian sync states read as plain language to
a person, and whether a real Zotero library syncs. Both need the actual product
on the other end.

## 19.4 Assistant

`tests/assistant-quality.test.ts` runs the 20-prompt table against the real
route, orchestrator and output filter, stubbing only the model gateway: zero
reasoning leaks, zero identifier leaks. `tests/assistant-output-filter.test.ts`
carries the production leak verbatim as a fixture.
`tests/assistant-orchestrator.test.ts` asserts the refusals — no retrieval for
chitchat, no scope name as provenance, an excluded record stays excluded, a wide
search stops and asks. Provenance IDs resolving is `journey-ask`. Zero
checkboxes in the context UI is asserted in both the journey and the component
test.

## 19.5 MCP

AC-MCP1…MCP7 are `tests/mcp.test.ts` (exact inventory, every input schema, and
that a union-schema tool registers with a real shape — the bug that made
`save_to_continuum` dead for every client). The 12-step procedure is recorded in
`docs/mcp-verification.md`.

**Step 5** — trace a decision to its evidence end to end — and **whether Claude
chooses the right tool from its description** both need a person with Claude
Desktop. The tool chain is verified to exist and answer.

## 19.6 Landing page

AC-M1…M8 in `journey-new-user` and the release sweep: height at 1440 is 5,479px
against a 6,500 ceiling, the demo is one click, and every claim on the page is
backed by a screenshot captured from the running product by
`scripts/capture-marketing.mjs`.

## 19.7 Responsive

`e2e/responsive.spec.ts` covers the 320–1920 ladder: no horizontal scroll at any
width, **explicit bounding-box assertions that no two Plan day columns and no
two blocks within a day overlap** (the C6 guard), the Plan grid staying inside
its own column, touch targets ≥ 44px below 900px, and no visible text under
12px.

**Not covered:** the iOS on-screen keyboard never obscuring the composer. That
needs a real iOS device; `env(safe-area-inset-bottom)` and `dvh` are used, and
nothing verifies them here.

## 19.8 Accessibility (WCAG 2.2 AA)

`e2e/accessibility.spec.ts` runs axe over 18 routes × 2 themes × 2 widths at
**zero violations of any impact**, plus explicit checks for sequential heading
order, dialog focus trap and restore, Escape closing only the topmost layer, a
visible focus ring on every interactive element, reduced motion removing
transitions, the console announcing a finished run through a live region, and
every status being carried by text rather than colour alone.

Six product bugs were fixed to get there, listed in the §18 merge commit. The
one worth repeating: no dialog restored focus on close, because Radix restores
to its own `Dialog.Trigger` and none of ours render one.

## 19.9 Performance

`docs/performance-baseline.md`. Two figures are over budget and both are stated
there rather than rounded down.

## 19.10 Visual consistency

`tests/design-tokens.test.ts` asserts no literal colour outside `globals.css` in
any of the 17 co-located stylesheets, that `globals.css` is under 600 lines
(554), and that every `var(--x)` a module references actually resolves.
`landing.css` is deleted. The release sweep asserts one accent-filled element
per screen and zero banned terminology in the rendered DOM.

**Not mechanical:** "one component per pattern" and "sentence case throughout"
are reviewed by reading, not asserted. Four surface levels and radius ≤ 14px are
enforced by the token set having no fifth surface and no radius above `--r-xl`.
