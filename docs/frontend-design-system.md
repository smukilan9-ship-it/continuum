# Frontend design system

Continuum’s UI aims to feel **intelligent, calm, modern, and academically credible** —
not a generic admin dashboard or a wall of Shadcn cards. The system is a light, airy
surface where sky blue drives interaction and progress, cyan hints at AI/live elements,
and navy is reserved for authority (headings, research, key status).

## Design tokens

All tokens live in `:root` in `apps/web/app/globals.css`. Components reference the
semantic names; the legacy variable names are kept as **aliases** so the whole app shifts
from one place.

| Token | Value | Role |
| --- | --- | --- |
| `--primary` | `#0284c7` | Primary actions, active nav, links |
| `--primary-hover` | `#0369a1` | Hover / strong emphasis |
| `--primary-soft` | `#e3f3fe` | Tints, active nav background, callouts |
| `--sky` | `#0ea5e9` | Progress fills, active accents |
| `--accent-cyan` | `#06b6d4` | AI / live-system hints (used sparingly) |
| `--accent-cyan-soft` | `#e0f7fb` | Cyan tint |
| `--dark-blue` | `#0d3a60` | Authority — headings, research, status |
| `--text` | `#142f49` | Body text |
| `--muted-text` | `#566d82` | Secondary text |
| `--page` | `#f5fafe` | Page background (near-white, cool) |
| `--panel` | `#ffffff` | Card / panel surface |
| `--panel-soft` | `#eef6fd` | Subtle inset surface (tiles, metadata) |
| `--panel-strong` | `#d8ebfa` | Progress track background |
| `--border` | `#dae7f1` | Hairline borders |
| `--border-strong` | `#bdd4e6` | Input borders |
| `--success` / `--success-soft` | `#157a55` / `#e6f5ee` | Success |
| `--warning` / `--warning-soft` | `#925222` / `#fff2e6` | Warning |
| `--error` / `--error-soft` | `#b03a44` / `#fdeff0` | Error |
| `--focus-ring` | `rgba(14,165,233,.34)` | Keyboard focus outline |
| `--shadow` / `--shadow-md` | soft navy shadows | Elevation |

Progress bars use a `--primary → --sky` gradient for a vibrant-but-not-neon feel.

## Layout philosophy

- **Sections separated by spacing and typography**, not by a box around every value.
  Metric grids, resource detail grids, and proposal detail lists use gap-separated
  `--panel-soft` tiles instead of hard 1px gridlines.
- **Subtle surfaces over strong borders.** Cards are a single hairline border + a soft
  shadow; nested cards-in-cards are avoided.
- **Clear page hierarchy.** One large `PageIntro` (eyebrow + title + description), a
  strong primary action, then progressively-disclosed detail.
- **Responsive columns.** Two-column layouts (`today-grid`, `research-layout`,
  `code-workspace`) collapse to one column under 840px; the sidebar becomes a drawer and
  a bottom tab bar appears on mobile. No horizontal overflow.

## Motion

Motion is used only for navigation transitions, expanding detail, successful state
changes, and progress feedback. All transitions respect
`@media (prefers-reduced-motion: reduce)`.

## Accessibility

- Visible focus ring on every interactive element (`--focus-ring`).
- Text/background pairs maintain strong contrast; navy and `--muted-text` on white pass
  AA for body text, and white on `--primary`/`--dark-blue` passes AA for buttons.
- Form controls have real `<label>`s; the command palette and dialogs use Radix with
  `sr-only` titles/descriptions.
- Show/hide password, step progress, and disabled states are announced via `aria-*`.

## Key surfaces

- **Auth** (`components/login-form.tsx`) — compact card, one-click demo CTA, Google
  sign-in, tabbed sign-in/create, show/hide password, 6-character helper, inline errors.
- **Onboarding** (`components/workspace/onboarding-flow.tsx`) — a 5-step guided form with
  a progress stepper, per-step validation, localStorage save/resume, and a review step.
- **Today** — one dark-navy “best next action”, soft metric tiles, schedule, and
  “resume where you stopped”; hierarchy over equal-weight boxes.
- **Research** — project cards, an evidence-linked source library, and the current
  accepted decision surfaced inline.
