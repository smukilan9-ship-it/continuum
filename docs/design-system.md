# Product design system

Status: **browser-tested** at 1440×900 and 390×844 on 2026-07-22. This is the
current product contract; `frontend-design-system.md` preserves earlier token history.

## Principles

Continuum uses one calm academic workspace rather than a dashboard made from
unrelated cards. Navy carries authority, blue marks actions and navigation, pale
blue separates work areas, green is reserved for verified/saved state, and orange
means a review or confirmation is still required. Dense data belongs in strips,
ledgers, tabs, and rows; cards are reserved for a meaningful object or decision.

The hierarchy is: workspace eyebrow, one plain-language `h1`, one explanatory
sentence, then the work surface. Primary actions are scarce. Destructive or
consequential writes use explicit confirmation. Empty, loading, error, provider,
and unconfigured states explain what is true and what the user can do next.

## Layout and responsive behavior

- Desktop: 232 px navigation rail, 60 px top bar, fluid content, 1440×900 audit target.
- Mobile: 390×844 audit target, 44 px minimum interactive controls, safe-area-aware
  five-item bottom navigation, and a More drawer for Research, Memory, Review, and Connections.
- Horizontal viewport overflow is a release blocker. Wide tables and tab rails own
  their local scrolling instead of widening the document.
- Code uses an editor, execution panel, and collapsible lesson rail; Research uses
  a project hero plus flat tabs; Memory uses a current-state summary and focused pack viewer.

## Typography, focus, and motion

The system font stack prioritizes legibility. Monospace is limited to code, runtime
output, IDs, and provenance. Native focus indicators remain visible. Color is never
the only status signal. Animation is short and functional (loading, panel entry,
selection); `prefers-reduced-motion` removes nonessential transitions.

## Evidence

The baseline audit and redesign comparison are in `product-redesign-audit.md`.
Final screenshots and the overflow/touch-target checks are in `visual-qa.md` and
`docs/audit-screenshots/`.
