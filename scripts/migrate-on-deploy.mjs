/**
 * Apply pending migrations as part of a deployment's build.
 *
 * Preview deployments run against a branch-scoped database that nothing was
 * migrating, so every DB-backed route 500'd with `42703 column … does not
 * exist` — schema drift, not a bug in the code. Vercel marks those connection
 * strings sensitive, so they cannot be pulled and migrated from a laptop; the
 * build is the one place that holds them.
 *
 * Deliberately quiet and non-fatal by default:
 *
 *   - It is a no-op without `DATABASE_URL`, so a local or CI build that has no
 *     database still builds.
 *   - Drizzle's migrator takes a lock and records what it applied, so parallel
 *     builds of the same commit converge rather than racing.
 *   - A failure fails the build only when `MIGRATE_ON_DEPLOY=required`. The
 *     default is to warn: a deploy that cannot reach the database should not be
 *     blocked from shipping a static marketing change.
 *
 * §16.8 is what makes this safe to run automatically — every migration is
 * additive and defaulted, so applying one cannot break the build that is
 * currently serving traffic.
 */
import { execFileSync } from "node:child_process";

const required = process.env.MIGRATE_ON_DEPLOY === "required";

if (!process.env.DATABASE_URL) {
  console.log("[migrate] no DATABASE_URL — skipping (this is expected locally).");
  process.exit(0);
}

if (process.env.MIGRATE_ON_DEPLOY === "off") {
  console.log("[migrate] MIGRATE_ON_DEPLOY=off — skipping.");
  process.exit(0);
}

const target = new URL(process.env.DATABASE_URL).host;
console.log(`[migrate] applying pending migrations to ${target}`);

try {
  execFileSync("pnpm", ["--filter", "@continuum/db", "exec", "drizzle-kit", "migrate"], {
    stdio: "inherit",
    env: process.env,
  });
  console.log("[migrate] up to date.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (required) {
    console.error(`[migrate] FAILED and MIGRATE_ON_DEPLOY=required: ${message}`);
    process.exit(1);
  }
  console.warn(`[migrate] could not migrate ${target}: ${message}`);
  console.warn("[migrate] continuing — set MIGRATE_ON_DEPLOY=required to make this fatal.");
}
