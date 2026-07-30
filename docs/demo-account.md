# Demo account

A single, disposable, fully-populated demo account for hackathon judges and local
demonstrations. It is **not** a general authentication bypass and is created **only**
by an explicit command, never by an ordinary request.

## Credentials

| Field | Value |
| --- | --- |
| Username | `demo` |
| Password | `demo123` |
| Email (equivalent) | `demo@continuum.demo` |

On the sign-in page you can either type `demo` / `demo123` into the form (the username
resolves to the demo email), or click **“Try the demo”** for a one-click sign-in.

## Seeding and resetting

```bash
pnpm seed:demo
```

This command:

1. Creates the `demo` account if it does not exist, storing the password through the
   **same scrypt path** as every other account (`apps/web/lib/auth.ts` parameters).
2. **Resets only the `demo` account** to its canonical state — it deletes exactly the
   demo-owned rows (every row uses a stable `*_demo_*` id) and re-inserts them. No other
   user is ever touched.
3. Populates the full demonstration workspace (goals, milestones, tasks, projects,
   sources with embeddings, decisions, notes, claims + evidence, learning states,
   schedule, receipts, memory, resource activities).
4. Prints a concise result with the demo credentials and row counts — no other secrets.

It is **idempotent**: re-running produces the same canonical state with no duplicate rows.
A judge who checks tasks off or edits data can always run `pnpm seed:demo` to restore it.

## Safety properties

- **Explicit creation only.** The account is created solely by `pnpm seed:demo`
  (`packages/db/src/seed-demo.ts`). The auto-seed fixture used in development is the
  separate `user_maya` acceptance record and is production-gated; it is never the demo
  account.
- **Normal authentication.** `/api/auth/demo` and the “Try the demo” button call the
  ordinary `authenticateUser` path with the server-held demo password. There is no
  unauthenticated route into the workspace.
- **No secret in the browser.** The demo password is never embedded in client
  JavaScript; the one-click route reads it from the server environment.
- **Feature-flagged.** All demo access is controlled by `demoLoginEnabled()`: both the
  shortcut and direct `demo` / `demo@continuum.demo` credential login are on by default
  outside production, and **off in production** unless `DEMO_LOGIN_ENABLED=true`.
- **Password policy respected.** Production registration always requires ≥6 characters.
  The demo account is the one documented place a shorter password may be configured
  (via `DEMO_ACCOUNT_PASSWORD`), and only through the server-side seed command.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `DEMO_ACCOUNT_PASSWORD` | `demo123` | Password the seed hashes for the demo account. |
| `DEMO_LOGIN_ENABLED` | unset | `true` enables demo credential login and the shortcut (needed in production); `false` disables both everywhere. |

## What is seeded

See [demo-walkthrough.md](demo-walkthrough.md) for the guided tour. In summary, the demo
account is a Class 12 CBSE student (“Mukilan”) with four active goals:

1. **SAT** — Raise SAT score from 1520 to 1570+ (Oct 3, 2026 retake).
2. **SQL / Python–MySQL** — Master SQL and Python–MySQL connectivity for Class 12 CS.
3. **OASIS research** — Cross-marker spatial association across serial IHC sections
   (built from the real `ihc.md` technical reference, with citable sources).
4. **Exoplanet classifier** — A leakage-conservative KOI classifier (secondary).

The OASIS sources are embedded at seed time, so grounded retrieval returns **real
citations** (`retrievalMode: "vector"`) rather than a canned answer.
