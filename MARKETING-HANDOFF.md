# Marketing rebuild — changes needed in files I do not own

From the §10 landing-page reconstruction. One item.

## 1. Drop `gsap` from `apps/web/package.json`

`redesign.md` §10.7 says to keep GSAP only if it is already the lightest path,
otherwise drop the dependency from the marketing bundle. The three files that
imported it — `components/landing/use-gsap.ts`, `landing-motion.tsx` and
`hero-views.tsx` — existed only for the sections §10.5 deletes, and they are
gone. The new page's entire motion system is CSS transitions driven by one
`IntersectionObserver` (`components/landing/scroll-reveal.tsx`, 50 lines).

Verified: `grep -rn "gsap" apps/web --include="*.ts" --include="*.tsx" --include="*.css"`
returns nothing, so the package is already out of the shipped bundle. Only the
manifest entry and the lockfile still carry it.

**Change:** in `apps/web/package.json`, delete this line from `dependencies`:

```json
    "gsap": "^3.15.0",
```

Then run `pnpm install` at the repo root to refresh `pnpm-lock.yaml`
(3 gsap lines there today).

I did not make this edit myself because `apps/web/package.json` and the lockfile
are outside the files I was given, and a stale lockfile breaks CI for everyone.

## Not a code change, but worth knowing

`preview_start` resolves `.claude/launch.json` from the repository root rather
than from the agent's worktree, so `{ name: "continuum-web" }` starts a dev
server against the main checkout, not the worktree. Anyone verifying a worktree
branch through the browser pane will otherwise measure the wrong build — the
symptom is a page that never reflects your edits and `/marketing/*` 404ing.
