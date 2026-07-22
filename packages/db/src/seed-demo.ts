/**
 * Persistent, disposable demo account for hackathon judges and local demos.
 *
 * `pnpm seed:demo` creates (or resets) a single designated demo account —
 * username `demo`, email demo@continuum.demo — and populates a lived-in
 * academic workspace built from Mukilan's real projects and goals (SAT prep, a
 * Class 12 SQL/Python unit, the OASIS cross-marker IHC research, and an
 * exoplanet classifier). It is idempotent: every row uses a stable `*_demo_*`
 * id, and a reset deletes exactly those rows before re-inserting, so a judge who
 * checks a task off or edits data can always return the account to canonical
 * state without touching any other user.
 *
 * The password is hashed through the same scrypt path as normal accounts. No
 * secret is embedded here beyond the explicitly-requested demo credentials.
 */
import { randomBytes, scrypt } from "node:crypto";
import { like } from "drizzle-orm";
import { closeDatabase, getDatabase } from "./client";
import {
  assessmentAttempts,
  assessments,
  calendarConstraints,
  claimEvidence,
  concepts,
  curricula,
  curriculumNodes,
  goals,
  learningStates,
  memoryChunks,
  memoryEvents,
  memoryRecords,
  milestones,
  misconceptions,
  modelRoutes,
  papers,
  profiles,
  projectDecisions,
  projects,
  researchClaims,
  researchNotes,
  resourceActivities,
  resourceRegistry,
  scheduleBlocks,
  sessionReceipts,
  sourceChunks,
  sources,
  taskDependencies,
  tasks,
  userCredentials,
  users,
} from "./schema";

export const DEMO_ACCOUNT_USER_ID = "user_demo";
export const DEMO_ACCOUNT_EMAIL = "demo@continuum.demo";
export const DEMO_ACCOUNT_USERNAME = "demo";
export const DEMO_ACCOUNT_DISPLAY_NAME = "Mukilan";

const DAY = 24 * 3600_000;
const HOUR = 3600_000;

async function scryptHash(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** Same scrypt parameters and encoding as apps/web/lib/auth.ts so login verifies. */
async function createPasswordCredential(password: string) {
  const salt = randomBytes(24).toString("base64url");
  return { salt, passwordHash: (await scryptHash(password, salt)).toString("base64url") };
}

// Reset targets: each table plus the id prefix that marks a demo-owned row.
// Ordered children-before-parents so foreign keys never block a delete.
export const RESET_TARGETS: Array<[table: { id: unknown }, prefix: string]> = [
  [claimEvidence, "ev_demo_"],
  [researchClaims, "claim_demo_"],
  [researchNotes, "note_demo_"],
  [projectDecisions, "decision_demo_"],
  [papers, "paper_demo_"],
  [scheduleBlocks, "block_demo_"],
  [taskDependencies, "dep_demo_"],
  [sourceChunks, "chunk_demo_"],
  [sources, "source_demo_"],
  [tasks, "task_demo_"],
  [milestones, "milestone_demo_"],
  [misconceptions, "misc_demo_"],
  [assessmentAttempts, "attempt_demo_"],
  [assessments, "assessment_demo_"],
  [learningStates, "learning_demo_"],
  [resourceActivities, "activity_demo_"],
  [sessionReceipts, "receipt_demo_"],
  [memoryChunks, "mchunk_demo_"],
  [memoryRecords, "record_demo_"],
  [memoryEvents, "event_demo_"],
  [modelRoutes, "route_demo_"],
  [calendarConstraints, "cal_demo_"],
  [projects, "project_demo_"],
  [goals, "goal_demo_"],
  [concepts, "concept_demo_"],
  [curriculumNodes, "cnode_demo_"],
  [curricula, "curriculum_demo_"],
  [resourceRegistry, "resource_demo_"],
];

type Db = ReturnType<typeof getDatabase>;

// Auth / identity / connection rows are preserved across a reset so a judge who
// is signed in (or has connected Claude via MCP) stays that way. `users` has no
// user_id column and is never deleted here.
const PRESERVE_ON_RESET = new Set([
  "profiles", "user_credentials", "app_sessions", "auth_identities",
  "integrations", "integration_tokens", "oauth_tokens", "oauth_grants",
]);

// Reset by **ownership**, not just by the `*_demo_*` id prefix. The demo account
// accumulates real app-generated rows (random ids) through normal use — resource
// activity, memory events, chat-driven records — and those reference the demo's
// goals/projects/sources by FK. A prefix-only delete leaves them behind and they
// FK-block the goal/project deletion, breaking `pnpm seed:demo` idempotency. So
// we wipe every demo-owned row (by user_id, or by parent scope for the join
// tables that carry no user_id) before re-inserting the canonical fixture.
async function resetDemoData(db: Db) {
  const uid = DEMO_ACCOUNT_USER_ID;
  const client = db.$client;

  // Phase 1 — join/child tables with no user_id, deleted by parent scope,
  // children before parents, so nothing references a goal/project/source/task
  // that Phase 2 is about to remove.
  const goalScope = `SELECT id FROM goals WHERE user_id = $1`;
  const projScope = `SELECT id FROM projects WHERE user_id = $1`;
  const taskScope = `SELECT id FROM tasks WHERE goal_id IN (${goalScope})`;
  const srcScope = `SELECT id FROM sources WHERE user_id = $1`;
  const phase1 = [
    `DELETE FROM claim_evidence WHERE claim_id IN (SELECT id FROM research_claims WHERE project_id IN (${projScope})) OR source_id IN (${srcScope})`,
    `DELETE FROM research_notes WHERE project_id IN (${projScope})`,
    `DELETE FROM schedule_blocks WHERE task_id IN (${taskScope})`,
    `DELETE FROM task_dependencies WHERE task_id IN (${taskScope})`,
    `DELETE FROM source_chunks WHERE source_id IN (${srcScope})`,
    `DELETE FROM papers WHERE project_id IN (${projScope})`,
    `DELETE FROM tasks WHERE goal_id IN (${goalScope})`,
    `DELETE FROM milestones WHERE goal_id IN (${goalScope})`,
    `DELETE FROM project_decisions WHERE project_id IN (${projScope})`,
    `DELETE FROM research_claims WHERE project_id IN (${projScope})`,
  ];
  for (const sql of phase1) await client.query(sql, [uid]);

  // Phase 2 — every table with a user_id column (except the preserved auth set),
  // deleted with an FK-safe retry loop so parent/child order resolves itself
  // (memory_chunks → memory_records → memory_events → goals, etc.).
  const { rows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.columns WHERE column_name = 'user_id' AND table_schema = 'public'`,
  );
  let pending = rows.map((r) => r.table_name).filter((t) => !PRESERVE_ON_RESET.has(t));
  for (let pass = 0; pass < 12 && pending.length; pass++) {
    const stillPending: string[] = [];
    for (const table of pending) {
      try {
        await client.query(`DELETE FROM "${table}" WHERE user_id = $1`, [uid]);
      } catch (error) {
        if (error instanceof Error && /foreign key/i.test(error.message)) stillPending.push(table);
        else throw error;
      }
    }
    pending = stillPending;
  }
  if (pending.length) throw new Error(`Demo reset could not resolve FK order for: ${pending.join(", ")}`);

  // Phase 3 — reference/catalog rows with no user_id (concepts, curriculum,
  // resource registry, assessments) are still keyed by the demo prefix. The full
  // prefix loop also acts as a harmless safety net for anything already removed.
  for (const [table, prefix] of RESET_TARGETS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.delete(table as any).where(like((table as any).id, `${prefix}%`));
  }
}

export function buildDemoData(now: Date) {
  const t = now.getTime();
  const hoursFromNow = (h: number) => new Date(t + h * HOUR);
  const daysFromNow = (d: number) => new Date(t + d * DAY);
  const iso = (d: number) => daysFromNow(d).toISOString();

  // A fixed October SAT date if it is still ahead of "now", else ~11 weeks out.
  const octSat = new Date("2026-10-03T09:00:00+05:30");
  const satDate = octSat.getTime() > t ? octSat : daysFromNow(77);

  const goalRows = [
    { id: "goal_demo_sat", userId: DEMO_ACCOUNT_USER_ID, title: "Raise SAT score from 1520 to 1570+", outcome: "Break 1570 on the October SAT by closing Module-2 reading and advanced-geometry gaps and holding pace under timed conditions.", targetDate: satDate, status: "active", progress: 0.42, uncertainFields: ["mockScoreVariance"] },
    { id: "goal_demo_sql", userId: DEMO_ACCOUNT_USER_ID, title: "Master SQL and Python–MySQL connectivity for Class 12 CS", outcome: "Write parameterized MySQL queries from Python and explain commit/rollback, cursor behaviour, and fetch semantics without notes.", targetDate: daysFromNow(38), status: "active", progress: 0.58, uncertainFields: [] },
    { id: "goal_demo_oasis", userId: DEMO_ACCOUNT_USER_ID, title: "Complete and publish OASIS: cross-marker spatial association across serial IHC sections", outcome: "Ship a defensible methods/tools paper (JOSS-style) with a fail-closed certification gate, validated against ANHIR and the degradation keystone.", targetDate: daysFromNow(120), status: "active", progress: 0.71, uncertainFields: ["hdabCalibration"] },
    { id: "goal_demo_exo", userId: DEMO_ACCOUNT_USER_ID, title: "Build a leakage-conservative exoplanet candidate classifier", outcome: "A group-CV, leakage-audited KOI classifier (LightGBM+CatBoost) around macro-F1 0.836 with an explainability write-up.", targetDate: daysFromNow(64), status: "active", progress: 0.34, uncertainFields: ["candidateClassRecall"] },
  ];

  const milestoneRows = [
    // SAT
    { id: "milestone_demo_sat_0", goalId: "goal_demo_sat", title: "Complete targeted error-log review", status: "completed", order: 0, dueAt: daysFromNow(-3) },
    { id: "milestone_demo_sat_1", goalId: "goal_demo_sat", title: "Reach consistent 800 Math practice", status: "in_progress", order: 1, dueAt: daysFromNow(18) },
    { id: "milestone_demo_sat_2", goalId: "goal_demo_sat", title: "Complete timed Reading & Writing sets", status: "upcoming", order: 2, dueAt: daysFromNow(40) },
    { id: "milestone_demo_sat_3", goalId: "goal_demo_sat", title: "Full-length mock and full review", status: "upcoming", order: 3, dueAt: daysFromNow(70) },
    // SQL
    { id: "milestone_demo_sql_0", goalId: "goal_demo_sql", title: "SELECT / SHOW / DESC fluency", status: "completed", order: 0, dueAt: daysFromNow(-6) },
    { id: "milestone_demo_sql_1", goalId: "goal_demo_sql", title: "INSERT / UPDATE / DELETE + commit / rollback", status: "in_progress", order: 1, dueAt: daysFromNow(9) },
    { id: "milestone_demo_sql_2", goalId: "goal_demo_sql", title: "Python–MySQL cursor & parameterized queries", status: "upcoming", order: 2, dueAt: daysFromNow(24) },
    { id: "milestone_demo_sql_3", goalId: "goal_demo_sql", title: "Ship the Student Record CLI", status: "upcoming", order: 3, dueAt: daysFromNow(36) },
    // OASIS
    { id: "milestone_demo_oasis_0", goalId: "goal_demo_oasis", title: "Fail-closed certification gate (FW cell-error budget)", status: "completed", order: 0, dueAt: daysFromNow(-20) },
    { id: "milestone_demo_oasis_1", goalId: "goal_demo_oasis", title: "ANHIR head-to-head vs VALIS", status: "completed", order: 1, dueAt: daysFromNow(-4) },
    { id: "milestone_demo_oasis_2", goalId: "goal_demo_oasis", title: "Dense-tissue null validated on real H-DAB morphology", status: "in_progress", order: 2, dueAt: daysFromNow(28) },
    { id: "milestone_demo_oasis_3", goalId: "goal_demo_oasis", title: "Draft the JOSS methods paper", status: "upcoming", order: 3, dueAt: daysFromNow(96) },
    // Exoplanet
    { id: "milestone_demo_exo_0", goalId: "goal_demo_exo", title: "Leakage audit + group-based CV split", status: "completed", order: 0, dueAt: daysFromNow(-8) },
    { id: "milestone_demo_exo_1", goalId: "goal_demo_exo", title: "LightGBM + CatBoost ensemble", status: "in_progress", order: 1, dueAt: daysFromNow(22) },
    { id: "milestone_demo_exo_2", goalId: "goal_demo_exo", title: "Explainability + candidate-class error analysis", status: "upcoming", order: 2, dueAt: daysFromNow(50) },
  ];

  const taskRows = [
    // SAT
    { id: "task_demo_sat_errorlog", goalId: "goal_demo_sat", title: "Rework the 12 flagged advanced-geometry misses in the error log", description: "Re-solve each flagged item from the error log, tag the failure cause, and write the one-line fix.", status: "done" as const, estimatedMinutes: 60, deadline: daysFromNow(-3), priority: 2, energyRequired: "medium", completionEvidence: "Error log annotated with cause + fix for all 12 items", generatedBy: "onboarding", promptVersion: "demo-v1" },
    { id: "task_demo_sat_geometry", goalId: "goal_demo_sat", title: "Timed drill: parabolas & circles (20 questions)", description: "Complete a 20-question timed set on parabolas and circles in the coordinate plane; log pace per question.", status: "in_progress" as const, estimatedMinutes: 45, deadline: hoursFromNow(6), priority: 1, energyRequired: "high", completionEvidence: "Record score and per-question pace", generatedBy: "onboarding", promptVersion: "demo-v1" },
    { id: "task_demo_sat_reading", goalId: "goal_demo_sat", title: "Two timed Module-2 Reading & Writing sets", description: "Two full timed R&W Module-2 sets back to back to build endurance on dense passages.", status: "planned" as const, estimatedMinutes: 70, deadline: daysFromNow(2), priority: 2, energyRequired: "high", completionEvidence: "Record raw score and time remaining", generatedBy: "onboarding", promptVersion: "demo-v1" },
    { id: "task_demo_sat_mockreview", goalId: "goal_demo_sat", title: "Review the last full-length mock (Bluebook #4)", description: "Go through every missed and guessed question from the mock and add each to the error log.", status: "backlog" as const, estimatedMinutes: 90, deadline: daysFromNow(6), priority: 3, energyRequired: "medium", completionEvidence: "All misses added to error log with cause tags", generatedBy: "resource_verification", promptVersion: "demo-v1" },
    // SQL
    { id: "task_demo_sql_crud", goalId: "goal_demo_sql", title: "Practice INSERT/UPDATE/DELETE with explicit commit and rollback", description: "On the students table, run inserts and updates inside a transaction, then practise rollback vs commit and observe row state.", status: "done" as const, estimatedMinutes: 40, deadline: daysFromNow(-2), priority: 2, energyRequired: "medium", completionEvidence: "Screenshots of row state before/after commit and after rollback", generatedBy: "onboarding", promptVersion: "demo-v1" },
    { id: "task_demo_sql_fetch", goalId: "goal_demo_sql", title: "Compare fetchone / fetchmany / fetchall on the same cursor", description: "Run one SELECT and step a single cursor through fetchone, fetchmany(2), fetchall; note how the cursor position advances.", status: "done" as const, estimatedMinutes: 30, deadline: daysFromNow(-1), priority: 3, energyRequired: "low", completionEvidence: "Notes on cursor position after each fetch call", generatedBy: "onboarding", promptVersion: "demo-v1" },
    { id: "task_demo_sql_param", goalId: "goal_demo_sql", title: "Rewrite string-formatted queries as parameterized %s queries", description: "Convert the three .format()-built queries to cursor.execute(sql, params) with %s placeholders and explain why.", status: "in_progress" as const, estimatedMinutes: 35, deadline: hoursFromNow(30), priority: 1, energyRequired: "medium", completionEvidence: "All three queries use %s parameters; short note on injection safety", generatedBy: "onboarding", promptVersion: "demo-v1" },
    { id: "task_demo_sql_cli", goalId: "goal_demo_sql", title: "Build a small Student-Record CLI (add / list / update / delete)", description: "A Python CLI over MySQL: menu-driven add, list, update, delete with parameterized queries, commit on write, and connection.close() on exit.", status: "backlog" as const, estimatedMinutes: 120, deadline: daysFromNow(20), priority: 2, energyRequired: "high", completionEvidence: "Working CLI committed with a short README", generatedBy: "onboarding", promptVersion: "demo-v1" },
    // OASIS
    { id: "task_demo_oasis_dense", goalId: "goal_demo_oasis", title: "Run the dense-null candidate on the two completed LL477 H-DAB bundles", description: "Execute the morphology-conditioned dense null (10–30 µm DCLF band) on x10_1 and x10_3 using reference-section all-cell support; record p-values and gate provenance.", status: "in_progress" as const, estimatedMinutes: 150, deadline: daysFromNow(3), priority: 1, energyRequired: "high", completionEvidence: "Per-field p-values + scaffold-sensitivity notes recorded", generatedBy: "onboarding", promptVersion: "demo-v1" },
    { id: "task_demo_oasis_fig", goalId: "goal_demo_oasis", title: "Draft the two-question interpretation figure (co-infiltration vs engagement)", description: "Figure that leads with the legend: robust = engaged beyond shared compartments (green); csr_only = same compartments, no cell-scale engagement (cyan).", status: "planned" as const, estimatedMinutes: 90, deadline: daysFromNow(10), priority: 2, energyRequired: "medium", completionEvidence: "Figure drafted with direction-aware legend", generatedBy: "onboarding", promptVersion: "demo-v1" },
    { id: "task_demo_oasis_methods", goalId: "goal_demo_oasis", title: "Write the Methods §Registration paragraph (similarity-only, no warp)", description: "Explain why registration is similarity-only and why a non-rigid warp is forbidden before any cross-K test; cite the VALIS benchmark and assert_distance_preserving.", status: "backlog" as const, estimatedMinutes: 75, deadline: daysFromNow(30), priority: 3, energyRequired: "medium", completionEvidence: "Methods paragraph drafted with citations", generatedBy: "onboarding", promptVersion: "demo-v1" },
    // Exoplanet
    { id: "task_demo_exo_ensemble", goalId: "goal_demo_exo", title: "Tune the LightGBM + CatBoost ensemble under group-CV", description: "Search hyperparameters with GroupKFold on KOI (grouping by star) so no star leaks across folds; track macro-F1.", status: "in_progress" as const, estimatedMinutes: 120, deadline: daysFromNow(9), priority: 2, energyRequired: "high", completionEvidence: "Best macro-F1 recorded with the group split", generatedBy: "onboarding", promptVersion: "demo-v1" },
    { id: "task_demo_exo_candidate", goalId: "goal_demo_exo", title: "Error-analyse the CANDIDATE class (recall + confusion)", description: "Break down where the CANDIDATE class is confused with CONFIRMED/FALSE POSITIVE and quantify the class-imbalance effect.", status: "backlog" as const, estimatedMinutes: 90, deadline: daysFromNow(24), priority: 3, energyRequired: "medium", completionEvidence: "Confusion matrix + per-class recall table", generatedBy: "onboarding", promptVersion: "demo-v1" },
  ];

  const taskDeps = [
    { id: "dep_demo_sat_1", taskId: "task_demo_sat_geometry", dependsOnTaskId: "task_demo_sat_errorlog" },
    { id: "dep_demo_sql_1", taskId: "task_demo_sql_param", dependsOnTaskId: "task_demo_sql_fetch" },
    { id: "dep_demo_sql_2", taskId: "task_demo_sql_cli", dependsOnTaskId: "task_demo_sql_param" },
    { id: "dep_demo_oasis_1", taskId: "task_demo_oasis_fig", dependsOnTaskId: "task_demo_oasis_dense" },
  ];

  const projectRows = [
    { id: "project_demo_oasis", userId: DEMO_ACCOUNT_USER_ID, goalId: "goal_demo_oasis", title: "OASIS — cross-marker spatial association", purpose: "A deterministic pipeline (classical CV + spatial statistics, fail-closed) that measures cross-type spatial association on serial-section single-plex H-DAB IHC (CD8 vs TIM-3) as a low-cost alternative to multiplex imaging.", phase: "Methods validation" },
    { id: "project_demo_sql", userId: DEMO_ACCOUNT_USER_ID, goalId: "goal_demo_sql", title: "Student Record CLI (Python + MySQL)", purpose: "A Class-12-curriculum coding project: a menu-driven CLI over MySQL to drill parameterized queries, cursor behaviour, and commit/rollback.", phase: "Build" },
    { id: "project_demo_exo", userId: DEMO_ACCOUNT_USER_ID, goalId: "goal_demo_exo", title: "KOI exoplanet candidate classifier", purpose: "A leakage-conservative classifier on NASA Kepler Objects of Interest with group-based cross-validation and a LightGBM+CatBoost ensemble.", phase: "Modeling" },
  ];

  // Sources (OASIS-heavy) — chunk text is drawn from the real ihc.md reference.
  const sourceRows = [
    { id: "source_demo_ihc", userId: DEMO_ACCOUNT_USER_ID, projectId: "project_demo_oasis", title: "OASIS — Technical Reference (ihc.md)", mimeType: "text/markdown", contentHash: "demo_hash_ihc_ref", sourceVersion: 1, parserVersion: "demo-md-1" },
    { id: "source_demo_valis", userId: DEMO_ACCOUNT_USER_ID, projectId: "project_demo_oasis", title: "OASIS vs VALIS — full-ANHIR registration benchmark", mimeType: "text/markdown", contentHash: "demo_hash_valis_bench", sourceVersion: 1, parserVersion: "demo-md-1" },
    { id: "source_demo_sql", userId: DEMO_ACCOUNT_USER_ID, projectId: "project_demo_sql", title: "Class 12 CS — Python–MySQL connectivity notes", mimeType: "text/markdown", contentHash: "demo_hash_sql_notes", sourceVersion: 1, parserVersion: "demo-md-1" },
  ];

  const chunkRows = [
    { id: "chunk_demo_ihc_1", sourceId: "source_demo_ihc", passage: 1, contentHash: "demo_c_ihc_1", content: "Core principle: serial sections are different physical slices, so a CD8 cell and a TIM-3 cell can never be the same cell. OASIS therefore does not claim single-cell co-expression; it measures whether two cell populations are spatially associated relative to spatial randomness, via cross-type Ripley's K." },
    { id: "chunk_demo_ihc_2", sourceId: "source_demo_ihc", passage: 2, contentHash: "demo_c_ihc_2", content: "Two questions, two nulls. Co-infiltration (compartment co-occupancy) uses a homogeneous CSR null and is trivially true for almost any two immune markers. Cell-scale engagement (proximity beyond a shared compartment) uses a reweighted inhomogeneous null with bandwidth 75 µm — the real, strong claim." },
    { id: "chunk_demo_ihc_3", sourceId: "source_demo_ihc", passage: 3, contentHash: "demo_c_ihc_3", content: "Registration is similarity-only (rotation + uniform scale + translation), never non-rigid — a warp fabricates the inter-cell distances that cross-K consumes. Every transform is asserted distance-preserving before cells move, so cross-K radii keep their meaning. This is the key divergence from HALO's elastic alignment." },
    { id: "chunk_demo_ihc_4", sourceId: "source_demo_ihc", passage: 4, contentHash: "demo_c_ihc_4", content: "The Fitzpatrick–West certification replaces the leave-one-out gate: fiducial localisation error and target registration error are provably uncorrelated. FLE is measured, not inferred from residuals, and the cell-error budget sqrt(TRE_pred^2 + deformation^2) is gated at 5 µm on the p90 over the analysis window. LL477 CD8↔TIM-3 reads LOCALLY_CERTIFIED (67% of field, cell-error p90 2.85 µm)." },
    { id: "chunk_demo_ihc_5", sourceId: "source_demo_ihc", passage: 5, contentHash: "demo_c_ihc_5", content: "Robustness verdict is never a single null's significance: robust (selected primary-null significant → cell-scale engagement), csr_only (CSR-only → co-infiltration), none, or mixed. Cohort inference uses Benjamini–Hochberg FDR across per-pair p; only certified pairs contribute and the bare minimum p is never quoted." },
    { id: "chunk_demo_valis_1", sourceId: "source_demo_valis", passage: 1, contentHash: "demo_c_valis_1", content: "On the full diversity of ANHIR (222 training pairs, 8 tissue types), VALIS is the better general registrar — robust to cross-modal staining and large displacements, more accurate, and faster. Within OASIS's regime (similar-stain serial sections) OASIS ties VALIS-rigid. LoFTR gives usable matches on 125/222 pairs and fails outright on cross-modal H&E↔IHC." },
    { id: "chunk_demo_valis_2", sourceId: "source_demo_valis", passage: 2, contentHash: "demo_c_valis_2", content: "Gate calibration fails closed: every pass verdict (LOCALLY_CERTIFIED 0.0045, RADIUS_LIMITED 0.0016 MMrTRE) has genuinely low error against expert landmarks the gate never saw; it never certified a bad registration, and is over-conservative (6/44 certified). VALIS's non-rigid warp remains forbidden before any cross-K test." },
    { id: "chunk_demo_sql_1", sourceId: "source_demo_sql", passage: 1, contentHash: "demo_c_sql_1", content: "Python–MySQL basics: import mysql.connector, open a connection, create a cursor with con.cursor(). SELECT/SHOW/DESC are read queries; INSERT/UPDATE/DELETE change data and must be followed by con.commit() to persist. con.rollback() undoes uncommitted changes since the last commit." },
    { id: "chunk_demo_sql_2", sourceId: "source_demo_sql", passage: 2, contentHash: "demo_c_sql_2", content: "Cursor fetches advance a position: fetchone() returns the next row (or None), fetchmany(n) returns up to n rows, fetchall() returns every remaining row. Parameterized queries pass values separately — cursor.execute(\"INSERT INTO students VALUES (%s,%s)\", (roll,name)) — which prevents SQL injection, unlike building the string with .format(). Always cursor.close() and connection.close() when done." },
  ];

  const paperRows = [
    { id: "paper_demo_valis", projectId: "project_demo_oasis", sourceId: "source_demo_valis", title: "VALIS: Virtual Alignment of pathoLogy Image Series", authors: ["Gatenbee et al."], doi: "10.1038/s41467-023-40218-9", year: 2023 },
  ];

  const decisionRows = [
    { id: "decision_demo_oasis_coexpr", projectId: "project_demo_oasis", status: "accepted", sourceIds: ["source_demo_ihc"], text: "Cross-marker spatial association must never be presented as same-cell co-expression.", reasoning: "Serial sections are different physical slices, so a CD8 cell and a TIM-3 cell can never be the same cell. OASIS measures population-level association (cross-type Ripley's K), not single-cell co-expression. Co-expression requires multiplex on one section or a restaining protocol — both out of this flow. Overstating this would be an invalid biological claim." },
    { id: "decision_demo_oasis_warp", projectId: "project_demo_oasis", status: "accepted", sourceIds: ["source_demo_ihc", "source_demo_valis"], text: "Registration stays similarity-only; non-rigid warps are forbidden before any cross-K test.", reasoning: "A non-rigid warp fabricates the inter-cell distances the statistic consumes. The ANHIR benchmark confirms VALIS-nonrigid is more accurate but is exactly the forbidden operation; VALIS-rigid is the safe alternative to add where LoFTR fails on cross-modal stains." },
    { id: "decision_demo_oasis_gate", projectId: "project_demo_oasis", status: "accepted", sourceIds: ["source_demo_ihc"], text: "Adopt the Fitzpatrick–West cell-error budget as the certification gate, superseding leave-one-out TRE.", reasoning: "LOO measures the self-consistency of a landmark set, not registration accuracy, and the two are provably uncorrelated: LOO false-rejects good hand-clicked pairs and false-accepts model-selected deformed ones. The FW budget is fed measured FLE and gates the p90 cell error at 5 µm." },
  ];

  const noteRows = [
    { id: "note_demo_oasis_1", projectId: "project_demo_oasis", sourceId: "source_demo_ihc", chunkId: "chunk_demo_ihc_2", createdBy: "assistant", text: "Evidence for the two-null framing: on LL477 CD8/TIM-3, CSR gave opposite directions across fields (pair 2 segregation, pair 3 association) while the reweighted null kept only pair 1 — proof CSR reads per-field architecture, not engagement." },
    { id: "note_demo_oasis_2", projectId: "project_demo_oasis", sourceId: "source_demo_valis", chunkId: "chunk_demo_valis_2", createdBy: "assistant", text: "Gate never certified a bad registration on ANHIR — over-conservative but fail-closed. Note the caveat: whole-slide downsampling makes the 5 µm threshold sub-pixel, partly explaining the conservatism." },
    { id: "note_demo_oasis_3", projectId: "project_demo_oasis", sourceId: "source_demo_ihc", chunkId: "chunk_demo_ihc_4", createdBy: "user", text: "Open item before the paper: the FW bound is calibrated on lung + mammary (ANHIR annotators), not yet on H-DAB / CD8–TIM-3. State this as a limitation, don't paper over it." },
  ];

  const claimRows = [
    { id: "claim_demo_oasis_engage", projectId: "project_demo_oasis", status: "unverified", createdBy: "assistant", text: "OASIS separates compartment co-infiltration from cell-scale engagement using two nulls, and only the reweighted inhomogeneous null (75 µm) licenses an engagement claim." },
    { id: "claim_demo_oasis_reg", projectId: "project_demo_oasis", status: "unverified", createdBy: "assistant", text: "Distance-preserving (similarity-only) registration with a fail-closed certification gate is required for cross-K validity; a non-rigid warp can manufacture association." },
  ];

  const evidenceRows = [
    { id: "ev_demo_1", claimId: "claim_demo_oasis_engage", sourceId: "source_demo_ihc", chunkId: "chunk_demo_ihc_2", status: "direct_support" as const },
    { id: "ev_demo_2", claimId: "claim_demo_oasis_engage", sourceId: "source_demo_ihc", chunkId: "chunk_demo_ihc_5", status: "indirect_support" as const },
    { id: "ev_demo_3", claimId: "claim_demo_oasis_reg", sourceId: "source_demo_ihc", chunkId: "chunk_demo_ihc_3", status: "direct_support" as const },
    { id: "ev_demo_4", claimId: "claim_demo_oasis_reg", sourceId: "source_demo_valis", chunkId: "chunk_demo_valis_1", status: "indirect_support" as const },
  ];

  // Curriculum + concepts for SQL and SAT learning states.
  const curriculumRows = [
    { id: "curriculum_demo_cs", authority: "CBSE", title: "Class 12 Computer Science — Python & MySQL", sourceVersion: "2026-demo", humanReviewed: true },
  ];
  const curriculumNodeRows = [
    { id: "cnode_demo_sql", curriculumId: "curriculum_demo_cs", topic: "Interface of Python with an SQL Database", outcomes: ["Connect Python to MySQL", "Run parameterized queries", "Use commit, rollback, and cursor fetches"], prerequisiteIds: [], sourceIds: ["source_demo_sql"] },
  ];
  const conceptRows = [
    { id: "concept_demo_sql_txn", curriculumNodeId: "cnode_demo_sql", title: "commit() and rollback()", description: "Data-changing queries (INSERT/UPDATE/DELETE) are not persisted until connection.commit(); rollback() discards uncommitted changes since the last commit.", prerequisiteIds: [] },
    { id: "concept_demo_sql_cursor", curriculumNodeId: "cnode_demo_sql", title: "Cursor fetch semantics", description: "A cursor holds a position in the result set; fetchone/fetchmany/fetchall advance it and return one, up to n, or all remaining rows.", prerequisiteIds: [] },
    { id: "concept_demo_sql_param", curriculumNodeId: "cnode_demo_sql", title: "Parameterized queries (%s)", description: "Passing values as parameters (cursor.execute(sql, params)) instead of string formatting prevents SQL injection and quoting bugs.", prerequisiteIds: [] },
    { id: "concept_demo_sat_geo", curriculumNodeId: null as string | null, title: "SAT advanced geometry — circles & parabolas", description: "Coordinate-plane circles (standard form, radius/centre) and parabolas (vertex, directrix), and the timed pattern-recognition they require.", prerequisiteIds: [] },
  ];

  const learningStateRows = [
    { id: "learning_demo_sql_txn", userId: DEMO_ACCOUNT_USER_ID, conceptId: "concept_demo_sql_txn", exposure: 0.9, understanding: 0.82, transfer: 0.7, retention: 0.74, confidence: 0.8, status: "verified", evidenceIds: ["attempt_demo_sql_txn"], explanation: "Verified checkpoint: after the transaction drill, correctly predicted row state before commit, after commit, and after rollback on a fresh cursor.", lastPracticedAt: daysFromNow(-2) },
    { id: "learning_demo_sql_cursor", userId: DEMO_ACCOUNT_USER_ID, conceptId: "concept_demo_sql_cursor", exposure: 0.85, understanding: 0.72, transfer: 0.6, retention: 0.63, confidence: 0.68, status: "practicing", evidenceIds: [], explanation: "Understands fetchone/fetchmany/fetchall advance the same cursor; still occasionally re-runs the query expecting a reset position.", lastPracticedAt: daysFromNow(-1) },
    { id: "learning_demo_sql_param", userId: DEMO_ACCOUNT_USER_ID, conceptId: "concept_demo_sql_param", exposure: 0.6, understanding: 0.55, transfer: 0.4, retention: 0.45, confidence: 0.5, status: "in_progress", evidenceIds: [], explanation: "Mid-conversion from .format() strings to %s parameters; grasps the injection risk, needs reps on tuple/param ordering.", lastPracticedAt: daysFromNow(0) },
    { id: "learning_demo_sat_geo", userId: DEMO_ACCOUNT_USER_ID, conceptId: "concept_demo_sat_geo", exposure: 0.8, understanding: 0.58, transfer: 0.5, retention: 0.52, confidence: 0.55, status: "misconception_detected", evidenceIds: ["attempt_demo_sat_geo"], explanation: "Diagnostic shows arc-length vs sector-area formulas being swapped under time pressure; accuracy drops on the last third of a timed set." },
  ];

  const assessmentRows = [
    { id: "assessment_demo_sql_txn", conceptId: "concept_demo_sql_txn", kind: "diagnostic", items: [{ q: "After INSERT without commit(), does a second connection see the row?", a: "No — not until commit()" }, { q: "What does rollback() affect?", a: "Uncommitted changes since the last commit" }], model: "seed", promptVersion: "demo-v1" },
    { id: "assessment_demo_sat_geo", conceptId: "concept_demo_sat_geo", kind: "diagnostic", items: [{ q: "Arc length of a 60° arc, r=6", a: "2π" }, { q: "Area of the corresponding sector", a: "6π" }], model: "seed", promptVersion: "demo-v1" },
  ];
  const attemptRows = [
    { id: "attempt_demo_sql_txn", assessmentId: "assessment_demo_sql_txn", userId: DEMO_ACCOUNT_USER_ID, answers: [{ correct: true }, { correct: true }], score: 1.0, unseen: true },
    { id: "attempt_demo_sat_geo", assessmentId: "assessment_demo_sat_geo", userId: DEMO_ACCOUNT_USER_ID, answers: [{ correct: false, given: "6π" }, { correct: true }], score: 0.5, unseen: true },
  ];
  const misconceptionRows = [
    { id: "misc_demo_sat_geo", userId: DEMO_ACCOUNT_USER_ID, conceptId: "concept_demo_sat_geo", attemptId: "attempt_demo_sat_geo", label: "Swaps arc-length and sector-area formulas under time pressure", status: "active", confidence: 0.72 },
    { id: "misc_demo_sql_commit", userId: DEMO_ACCOUNT_USER_ID, conceptId: "concept_demo_sql_txn", attemptId: "attempt_demo_sql_txn", label: "Assumed data-changing queries persist without commit()", status: "resolved", confidence: 0.8 },
  ];

  // Schedule: today's committed block + an earlier completed one; upcoming blocks.
  const scheduleRows = [
    { id: "block_demo_sat_today", taskId: "task_demo_sat_geometry", startsAt: hoursFromNow(2), endsAt: hoursFromNow(3), status: "committed", proposalId: "prop_demo_sat", committedAt: daysFromNow(-1) },
    { id: "block_demo_sql_yesterday", taskId: "task_demo_sql_crud", startsAt: hoursFromNow(-20), endsAt: hoursFromNow(-19), status: "done", proposalId: "prop_demo_sql", committedAt: daysFromNow(-3) },
    { id: "block_demo_sql_tomorrow", taskId: "task_demo_sql_param", startsAt: hoursFromNow(30), endsAt: hoursFromNow(31), status: "committed", proposalId: "prop_demo_sql", committedAt: daysFromNow(-1) },
    { id: "block_demo_oasis_soon", taskId: "task_demo_oasis_dense", startsAt: hoursFromNow(48), endsAt: hoursFromNow(50), status: "committed", proposalId: "prop_demo_oasis", committedAt: daysFromNow(-1) },
    { id: "block_demo_sat_reading", taskId: "task_demo_sat_reading", startsAt: daysFromNow(2), endsAt: new Date(daysFromNow(2).getTime() + 70 * 60_000), status: "committed", proposalId: "prop_demo_sat", committedAt: daysFromNow(-1) },
  ];

  const calendarRows = [
    { id: "cal_demo_school", userId: DEMO_ACCOUNT_USER_ID, title: "School (Class 12)", startsAt: hoursFromNow(14), endsAt: hoursFromNow(21), hard: true },
    { id: "cal_demo_lab", userId: DEMO_ACCOUNT_USER_ID, title: "CS practical lab", startsAt: daysFromNow(1), endsAt: new Date(daysFromNow(1).getTime() + 2 * HOUR), hard: true },
  ];

  const receiptRows = [
    { id: "receipt_demo_sat", userId: DEMO_ACCOUNT_USER_ID, sessionId: "sess_demo_sat", goalId: "goal_demo_sat", projectId: null as string | null, summary: "Reworked all 12 flagged advanced-geometry misses; tagged root causes and logged fixes. Pace on parabola items improved from 95s to 68s.", completed: ["Error-log review of 12 items"], decisions: ["Drill parabolas & circles daily until pace < 70s"], conceptsLearned: [], misconceptions: ["Arc-length vs sector-area swap"], unresolvedQuestions: ["Does endurance dip cause the last-third accuracy drop?"], nextActions: ["Timed parabolas & circles set (20 Q)"], evidenceIds: [], sourceEventIds: ["event_demo_sat_done"] },
    { id: "receipt_demo_sql", userId: DEMO_ACCOUNT_USER_ID, sessionId: "sess_demo_sql", goalId: "goal_demo_sql", projectId: "project_demo_sql", summary: "Verified commit/rollback checkpoint: predicted row visibility correctly across commit and rollback on a fresh cursor. Misconception 'changes persist without commit()' resolved.", completed: ["Transaction drill", "fetch semantics compare"], decisions: ["Use parameterized %s queries everywhere in the CLI"], conceptsLearned: ["commit()/rollback()"], misconceptions: [], unresolvedQuestions: [], nextActions: ["Convert .format() queries to %s", "Build the Student-Record CLI"], evidenceIds: ["attempt_demo_sql_txn"], sourceEventIds: ["event_demo_sql_verified"] },
    { id: "receipt_demo_oasis", userId: DEMO_ACCOUNT_USER_ID, sessionId: "sess_demo_oasis", goalId: "goal_demo_oasis", projectId: "project_demo_oasis", summary: "Recorded the ANHIR/VALIS benchmark outcome and the decision that non-rigid warps stay forbidden pre-cross-K. Gate confirmed fail-closed on all pass verdicts.", completed: ["ANHIR head-to-head vs VALIS"], decisions: ["Add VALIS-rigid as a cross-modal fallback", "Warp remains forbidden before cross-K"], conceptsLearned: [], misconceptions: [], unresolvedQuestions: ["FW bound not yet calibrated on H-DAB"], nextActions: ["Run dense-null candidate on x10_1 / x10_3"], evidenceIds: ["ev_demo_3", "ev_demo_4"], sourceEventIds: ["event_demo_oasis_bench"] },
  ];

  // Durable events (summaries drive the memory + activity feeds).
  const eventRows = [
    { id: "event_demo_sat_done", type: "task.completed", goalId: "goal_demo_sat", entityId: "task_demo_sat_errorlog", occurredAt: daysFromNow(-3), summary: "Completed targeted error-log review of 12 advanced-geometry misses." },
    { id: "event_demo_sql_verified", type: "learning.verified", goalId: "goal_demo_sql", entityId: "concept_demo_sql_txn", occurredAt: daysFromNow(-2), summary: "Verified checkpoint on commit()/rollback(): predicted row visibility correctly." },
    { id: "event_demo_sql_misc", type: "misconception.resolved", goalId: "goal_demo_sql", entityId: "misc_demo_sql_commit", occurredAt: daysFromNow(-2), summary: "Resolved misconception: changes do not persist without commit()." },
    { id: "event_demo_oasis_bench", type: "decision.recorded", goalId: "goal_demo_oasis", entityId: "decision_demo_oasis_warp", occurredAt: daysFromNow(-4), summary: "Decision recorded: registration stays similarity-only; non-rigid warp forbidden before cross-K." },
    { id: "event_demo_oasis_gate", type: "decision.recorded", goalId: "goal_demo_oasis", entityId: "decision_demo_oasis_gate", occurredAt: daysFromNow(-20), summary: "Adopted Fitzpatrick–West cell-error budget as the certification gate (supersedes LOO)." },
    { id: "event_demo_oasis_coexpr", type: "warning.recorded", goalId: "goal_demo_oasis", entityId: "decision_demo_oasis_coexpr", occurredAt: daysFromNow(-25), summary: "Warning: serial-section association must not be presented as same-cell co-expression." },
    { id: "event_demo_sat_misc", type: "misconception.detected", goalId: "goal_demo_sat", entityId: "misc_demo_sat_geo", occurredAt: daysFromNow(-3), summary: "Detected misconception: arc-length and sector-area formulas swapped under time pressure." },
    { id: "event_demo_source_ihc", type: "source.ingested", goalId: "goal_demo_oasis", entityId: "source_demo_ihc", occurredAt: daysFromNow(-30), summary: "Ingested the OASIS technical reference (ihc.md) and indexed it for citation." },
    { id: "event_demo_resource_sat", type: "resource.verified", goalId: "goal_demo_sat", entityId: "activity_demo_sat", occurredAt: daysFromNow(-5), summary: "Verified a brokered Khan Academy geometry set — return check passed at 82%." },
    { id: "event_demo_pref", type: "preference.saved", goalId: null as string | null, entityId: "profile_demo", occurredAt: daysFromNow(-31), summary: "Preference saved: concise explanations first, deeper detail on demand, practical examples, active recall." },
  ];

  const recordRows = eventRows
    .filter((event) => ["decision.recorded", "warning.recorded", "misconception.detected", "misconception.resolved", "preference.saved", "learning.verified"].includes(event.type))
    .map((event) => ({ id: `record_demo_${event.id.replace("event_demo_", "")}`, userId: DEMO_ACCOUNT_USER_ID, type: event.type.replace(/\.(recorded|detected|resolved|saved|verified)$/, ".saved"), entityId: event.entityId, value: { summary: event.summary }, sourceEventId: event.id, superseded: false }));

  const memoryChunkRows = [
    { id: "mchunk_demo_pref", userId: DEMO_ACCOUNT_USER_ID, kind: "preference", goalId: null as string | null, projectId: null as string | null, content: "Learning-style preference: concise explanation first, deeper detail on demand, strong preference for practical examples, verify with active recall. Privacy: cloud/hybrid for the demo, local mode optional.", occurredAt: daysFromNow(-31), importance: 0.9, tokenEstimate: 48 },
    { id: "mchunk_demo_dec_coexpr", userId: DEMO_ACCOUNT_USER_ID, kind: "decision", goalId: "goal_demo_oasis", projectId: "project_demo_oasis", content: "Decision: cross-marker spatial association must not be presented as same-cell co-expression, because serial sections are different physical slices.", occurredAt: daysFromNow(-25), importance: 0.95, tokenEstimate: 40 },
    { id: "mchunk_demo_dec_warp", userId: DEMO_ACCOUNT_USER_ID, kind: "decision", goalId: "goal_demo_oasis", projectId: "project_demo_oasis", content: "Decision: registration stays similarity-only; a non-rigid warp is forbidden before any cross-K test because it fabricates inter-cell distances.", occurredAt: daysFromNow(-4), importance: 0.9, tokenEstimate: 38 },
    { id: "mchunk_demo_misc_sql", userId: DEMO_ACCOUNT_USER_ID, kind: "misconception", goalId: "goal_demo_sql", projectId: null, content: "Resolved misconception: data-changing queries do not persist without connection.commit(); rollback() discards uncommitted work.", occurredAt: daysFromNow(-2), importance: 0.7, tokenEstimate: 32 },
    { id: "mchunk_demo_misc_sat", userId: DEMO_ACCOUNT_USER_ID, kind: "misconception", goalId: "goal_demo_sat", projectId: null, content: "Active misconception: arc-length and sector-area formulas swapped under time pressure; accuracy drops in the last third of timed sets.", occurredAt: daysFromNow(-3), importance: 0.7, tokenEstimate: 34 },
    { id: "mchunk_demo_finding_oasis", userId: DEMO_ACCOUNT_USER_ID, kind: "research_finding", goalId: "goal_demo_oasis", projectId: "project_demo_oasis", content: "Research finding: on ANHIR, the certification gate fails closed — every pass verdict has genuinely low error against unseen expert landmarks; within OASIS's similar-stain regime it ties VALIS-rigid.", occurredAt: daysFromNow(-4), importance: 0.85, tokenEstimate: 42 },
    { id: "mchunk_demo_progress_sat", userId: DEMO_ACCOUNT_USER_ID, kind: "progress", goalId: "goal_demo_sat", projectId: null, content: "Progress: SAT parabola-item pace improved from 95s to 68s per question after the error-log rework; Math practice trending toward 800.", occurredAt: daysFromNow(-3), importance: 0.6, tokenEstimate: 30 },
  ];

  const resourceRows = [
    { id: "resource_demo_khan_geo", title: "Khan Academy — SAT Advanced Math: circles & parabolas", provider: "Khan Academy", authority: "College Board partner", cost: "free", url: "https://www.khanacademy.org/sat", metadata: { format: "practice set", topic: "geometry" }, qualityScore: 0.88, lastReviewedAt: daysFromNow(-10), active: true },
    { id: "resource_demo_w3_sql", title: "W3Schools — Python MySQL (execute, commit, fetch)", provider: "W3Schools", authority: "community", cost: "free", url: "https://www.w3schools.com/python/python_mysql_getstarted.asp", metadata: { format: "tutorial", topic: "python-mysql" }, qualityScore: 0.71, lastReviewedAt: daysFromNow(-14), active: true },
  ];

  const activityRows = [
    { id: "activity_demo_sat", userId: DEMO_ACCOUNT_USER_ID, resourceId: "resource_demo_khan_geo", recommendationId: "rec_demo_sat", goalId: "goal_demo_sat", conceptId: "concept_demo_sat_geo", status: "verified", startedAt: daysFromNow(-5), returnedAt: daysFromNow(-5), verifiedAt: daysFromNow(-5), evidenceIds: [], verificationScore: 0.82, metadata: { returnCheck: "5 transfer questions", passed: true } },
    { id: "activity_demo_sql", userId: DEMO_ACCOUNT_USER_ID, resourceId: "resource_demo_w3_sql", recommendationId: "rec_demo_sql", goalId: "goal_demo_sql", conceptId: "concept_demo_sql_param", status: "in_progress", startedAt: hoursFromNow(-3), returnedAt: null as Date | null, verifiedAt: null as Date | null, evidenceIds: [], verificationScore: null as number | null, metadata: { returnCheck: "pending" } },
  ];

  const routeRows = [
    { id: "route_demo_1", userId: DEMO_ACCOUNT_USER_ID, taskClass: "explanation", provider: "gemini", model: "gemini-2.5-flash", reason: "Concise-first explanation of a Class 12 concept — fast model, low cost.", verificationStatus: "verified", fallbackUsed: false },
    { id: "route_demo_2", userId: DEMO_ACCOUNT_USER_ID, taskClass: "verification", provider: "groq", model: "llama-3.3-70b", reason: "Independent verifier route for the SQL checkpoint — separate provider from the teacher.", verificationStatus: "verified", fallbackUsed: false },
    { id: "route_demo_3", userId: DEMO_ACCOUNT_USER_ID, taskClass: "retrieval_grounded", provider: "gemini", model: "gemini-embedding-001", reason: "Grounded Q&A over OASIS sources — embeddings for citation-locked retrieval.", verificationStatus: "verified", fallbackUsed: false },
  ];

  return {
    goalRows, milestoneRows, taskRows, taskDeps, projectRows, sourceRows, chunkRows, paperRows,
    decisionRows, noteRows, claimRows, evidenceRows, curriculumRows, curriculumNodeRows, conceptRows,
    learningStateRows, assessmentRows, attemptRows, misconceptionRows, scheduleRows, calendarRows,
    receiptRows, eventRows, recordRows, memoryChunkRows, resourceRows, activityRows, routeRows,
  };
}

async function embedChunks(texts: string[]): Promise<Array<number[] | undefined>> {
  try {
    const { embedDocuments, embeddingConfiguration } = await import("@continuum/ai");
    if (!embeddingConfiguration()) return texts.map(() => undefined);
    const vectors = await embedDocuments(texts);
    return vectors.length === texts.length ? vectors : texts.map(() => undefined);
  } catch (error) {
    process.stdout.write(`  (embeddings unavailable — sources indexed for lexical retrieval only: ${(error as Error).message})\n`);
    return texts.map(() => undefined);
  }
}

export interface SeedDemoOptions {
  password: string;
  reset?: boolean;
  now?: Date;
}

export interface SeedDemoResult {
  username: string;
  email: string;
  reset: boolean;
  embedded: boolean;
  counts: Record<string, number>;
}

export async function seedDemoAccount(options: SeedDemoOptions): Promise<SeedDemoResult> {
  const db = getDatabase();
  const now = options.now ?? new Date();
  const reset = options.reset ?? true;
  const data = buildDemoData(now);

  // Identity: upsert so an existing logged-in session keeps working across resets.
  const credential = await createPasswordCredential(options.password);
  await db.insert(users).values({ id: DEMO_ACCOUNT_USER_ID, email: DEMO_ACCOUNT_EMAIL }).onConflictDoUpdate({ target: users.id, set: { email: DEMO_ACCOUNT_EMAIL, deleted: false, updatedAt: now } });
  await db.insert(profiles).values({
    id: "profile_demo",
    userId: DEMO_ACCOUNT_USER_ID,
    displayName: DEMO_ACCOUNT_DISPLAY_NAME,
    timezone: "Asia/Kolkata",
    educationLevel: "CBSE Class 12",
    preferences: {
      explanationStyle: "concise_first",
      depthOnDemand: true,
      practicalExamples: true,
      activeRecall: true,
      privacyMode: "hybrid",
      interests: ["computer science", "artificial intelligence", "research", "mathematics", "physics", "data science"],
      weeklyStudyHours: 12,
      memoryWrites: true,
    },
  }).onConflictDoUpdate({ target: profiles.id, set: { displayName: DEMO_ACCOUNT_DISPLAY_NAME, educationLevel: "CBSE Class 12", deleted: false, updatedAt: now } });
  await db.insert(userCredentials).values({ userId: DEMO_ACCOUNT_USER_ID, passwordHash: credential.passwordHash, passwordSalt: credential.salt }).onConflictDoUpdate({ target: userCredentials.userId, set: { passwordHash: credential.passwordHash, passwordSalt: credential.salt, failedAttempts: 0, lockedUntil: null, updatedAt: now } });

  if (reset) await resetDemoData(db);

  // Embeddings for source chunks (citation-locked retrieval) and memory chunks
  // (memory search). Falls back to null vectors (lexical retrieval) if no
  // embedding provider is configured.
  const sourceEmbeddings = await embedChunks(data.chunkRows.map((chunk) => chunk.content));
  const memoryEmbeddings = await embedChunks(data.memoryChunkRows.map((chunk) => chunk.content));
  const embedded = sourceEmbeddings.some(Boolean);

  // Insert parents → children.
  await db.insert(curricula).values(data.curriculumRows).onConflictDoNothing();
  await db.insert(curriculumNodes).values(data.curriculumNodeRows).onConflictDoNothing();
  await db.insert(concepts).values(data.conceptRows).onConflictDoNothing();
  await db.insert(resourceRegistry).values(data.resourceRows.map((row) => ({ ...row }))).onConflictDoNothing();
  await db.insert(goals).values(data.goalRows).onConflictDoNothing();
  await db.insert(milestones).values(data.milestoneRows).onConflictDoNothing();
  await db.insert(projects).values(data.projectRows).onConflictDoNothing();
  await db.insert(tasks).values(data.taskRows).onConflictDoNothing();
  await db.insert(taskDependencies).values(data.taskDeps).onConflictDoNothing();
  await db.insert(sources).values(data.sourceRows).onConflictDoNothing();
  await db.insert(sourceChunks).values(data.chunkRows.map((chunk, index) => ({ ...chunk, embedding: sourceEmbeddings[index] }))).onConflictDoNothing();
  await db.insert(papers).values(data.paperRows).onConflictDoNothing();
  await db.insert(projectDecisions).values(data.decisionRows).onConflictDoNothing();
  await db.insert(researchNotes).values(data.noteRows).onConflictDoNothing();
  await db.insert(researchClaims).values(data.claimRows).onConflictDoNothing();
  await db.insert(claimEvidence).values(data.evidenceRows).onConflictDoNothing();
  await db.insert(assessments).values(data.assessmentRows).onConflictDoNothing();
  await db.insert(assessmentAttempts).values(data.attemptRows).onConflictDoNothing();
  await db.insert(learningStates).values(data.learningStateRows).onConflictDoNothing();
  await db.insert(misconceptions).values(data.misconceptionRows).onConflictDoNothing();
  await db.insert(scheduleBlocks).values(data.scheduleRows).onConflictDoNothing();
  await db.insert(calendarConstraints).values(data.calendarRows).onConflictDoNothing();
  await db.insert(memoryEvents).values(data.eventRows.map((event) => ({ id: event.id, userId: DEMO_ACCOUNT_USER_ID, type: event.type, goalId: event.goalId, entityId: event.entityId, payload: { summary: event.summary }, source: { seed: "demo" }, occurredAt: event.occurredAt }))).onConflictDoNothing();
  await db.insert(memoryRecords).values(data.recordRows).onConflictDoNothing();
  await db.insert(memoryChunks).values(data.memoryChunkRows.map((chunk, index) => ({ id: chunk.id, userId: DEMO_ACCOUNT_USER_ID, kind: chunk.kind, goalId: chunk.goalId, projectId: chunk.projectId, content: chunk.content, contentHash: chunk.id, tokenEstimate: chunk.tokenEstimate, importance: chunk.importance, occurredAt: chunk.occurredAt, embeddingModel: memoryEmbeddings[index] ? "gemini-embedding-001" : null, embedding: memoryEmbeddings[index], metadata: { kind: chunk.kind } }))).onConflictDoNothing();
  await db.insert(sessionReceipts).values(data.receiptRows).onConflictDoNothing();
  await db.insert(resourceActivities).values(data.activityRows).onConflictDoNothing();
  await db.insert(modelRoutes).values(data.routeRows).onConflictDoNothing();

  return {
    username: DEMO_ACCOUNT_USERNAME,
    email: DEMO_ACCOUNT_EMAIL,
    reset,
    embedded,
    counts: {
      goals: data.goalRows.length,
      milestones: data.milestoneRows.length,
      tasks: data.taskRows.length,
      projects: data.projectRows.length,
      sources: data.sourceRows.length,
      chunks: data.chunkRows.length,
      decisions: data.decisionRows.length,
      notes: data.noteRows.length,
      claims: data.claimRows.length,
      learningStates: data.learningStateRows.length,
      scheduleBlocks: data.scheduleRows.length,
      receipts: data.receiptRows.length,
      events: data.eventRows.length,
      memoryChunks: data.memoryChunkRows.length,
      resourceActivities: data.activityRows.length,
    },
  };
}

async function main() {
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
    process.stderr.write("DATABASE_URL is required to seed the demo account.\n");
    process.exit(1);
  }
  const password = process.env.DEMO_ACCOUNT_PASSWORD?.trim() || "demo123";
  process.stdout.write("Seeding the Continuum demo account…\n");
  try {
    const result = await seedDemoAccount({ password });
    process.stdout.write(`\nDemo account ready (${result.reset ? "reset to canonical state" : "created"}).\n`);
    process.stdout.write(`  Sign in →  username: ${result.username}   password: ${password}\n`);
    process.stdout.write(`  Email    →  ${result.email}\n`);
    process.stdout.write(`  Data     →  ${Object.entries(result.counts).map(([key, value]) => `${value} ${key}`).join(", ")}\n`);
    process.stdout.write(`  Retrieval→  ${result.embedded ? "sources embedded (vector + lexical citations)" : "lexical citations only"}\n`);
  } finally {
    await closeDatabase();
  }
}

// Run when invoked directly (tsx src/seed-demo.ts), not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
