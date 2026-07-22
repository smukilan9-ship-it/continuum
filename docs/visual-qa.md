# Visual QA

Status: **browser-tested** on localhost, 2026-07-22.

Every route was captured at 1440×900 and 390×844: Login, Today, Plan, Learn, Code,
Research, Memory, Review, and Connections. Baseline captures, contact sheets, and
redesign passes are stored in `docs/audit-screenshots/`.

## Findings and outcomes

- Baseline: consistent palette and shell, but mobile bottom navigation overlaid long
  content, several controls were below 44 px, long workspaces were card-heavy, and
  Plan/Code/Research/Memory lacked a task-specific information hierarchy.
- Rebuilt: mobile controls and search are at least 44 px, bottom navigation/content/
  toast use safe-area spacing, Code has a three-pane workbench, Plan a weekly board,
  Research project tabs, Memory current-state/packs, and Review a flat ledger/timeline.
- Today's four boxed metrics became a compact state ledger. Review's repeated cards
  became a trust strip plus route ledger and audit timeline. Connections uses honest
  disconnected/experimental labels.
- Document `scrollWidth <= clientWidth` at both widths on the rebuilt routes. Wide
  local controls own their overflow. No clipped primary action was observed.
- Focus, empty, loading, error, provider-unconfigured, and confirmation states were
  exercised. The design is judged from screenshots and interaction, not test status.

Representative final files include `code-js-output-pass1-1440x900.png`,
`learn-redesign-home-390x844.png`, `plan-redesign-week-390x844.png`,
`research-redesign-discovery-390x844.png`, `memory-context-packs-390x844.png`,
`review-redesign-390x844.png`, and `connections-redesign-390x844.png`.
