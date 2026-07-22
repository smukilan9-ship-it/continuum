// Centralized presentation layer.
//
// Backend enums, identifiers and dotted event types must never reach the UI as
// raw snake_case. Every user-facing label is produced here so formatting lives
// in one place (and is unit-tested) instead of being re-derived with ad-hoc
// `.replaceAll("_", " ")` calls scattered across components.
//
// Convention: **sentence case** ("In progress", not "In Progress"), human
// curriculum terms, friendly names over internal object names.

/** snake_case / kebab / dotted → Sentence case. "in_progress" → "In progress". */
export function humanize(value: string): string {
  const spaced = value
    .replace(/[._-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  if (!spaced) return "";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Values whose humanized form is wrong or unfriendly. Keyed by the raw token;
// most enum tokens are globally unambiguous, so one table serves every domain.
const OVERRIDES: Record<string, string> = {
  // task / schedule / goal / generic status
  in_progress: "In progress",
  not_started: "Not started",
  needs_review: "Needs review",
  misconception_detected: "Misconception found",
  score_import: "Score imported",
  explicit_confirmation: "Confirmed by you",
  // claim / evidence status
  directly_supported: "Directly supported",
  indirectly_supported: "Indirectly supported",
  user_hypothesis: "Working hypothesis",
  // verification status
  not_required: "Not required",
  independent_passed: "Independently verified",
  independent_failed: "Independent check failed",
  // proposal kinds
  goal_change: "Goal change",
  project_change: "Project change",
  task_change: "Task change",
  schedule_change: "Schedule change",
  high_impact_memory: "High-impact memory change",
  // resource origin / activity
  native: "In Continuum",
  external: "External resource",
  resource_activity: "Guided resource activity",
  // programming languages & tech (title/UX casing)
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  cpp: "C++",
  c: "C",
  javascript: "JavaScript",
  typescript: "TypeScript",
  python_mysql: "Python & MySQL",
  "python-mysql": "Python & MySQL",
  // providers / systems
  mcp: "MCP",
  ai_gateway: "AI Gateway",
  ollama: "Ollama",
  standalone_app: "Continuum app",
};

/** Generic label: override table first, else Sentence case. Safe on any enum. */
export function formatLabel(value: string | null | undefined, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  const key = String(value).trim().toLowerCase();
  return OVERRIDES[key] ?? humanize(String(value));
}

// ---- Domain-specific helpers ------------------------------------------------

/** Task priority is stored 1–5; show a word, not a number. */
export function priorityLabel(value: number | string | null | undefined): string {
  const n = typeof value === "number" ? value : Number(value);
  const byNumber: Record<number, string> = { 5: "Highest", 4: "High", 3: "Normal", 2: "Low", 1: "Lowest" };
  if (Number.isFinite(n) && byNumber[n]) return byNumber[n];
  return formatLabel(typeof value === "string" ? value : undefined, "Normal");
}

/** Dotted durable-event type → a short human phrase. "learning.verified" → "Verified checkpoint". */
const EVENT_LABELS: Record<string, string> = {
  "learning.verified": "Verified checkpoint",
  "misconception.detected": "Misconception found",
  "misconception.resolved": "Misconception resolved",
  "task.completed": "Task completed",
  "task.progress.recorded": "Progress recorded",
  "decision.recorded": "Decision recorded",
  "resource.verified": "Resource verified",
  "resource.activity.started": "Resource started",
  "resource.activity.returned": "Returned from resource",
  "resource.verification.pending": "Verification pending",
  "source.ingested": "Source indexed",
  "preference.saved": "Preference saved",
  "warning.recorded": "Caution noted",
  "goal.created": "Goal created",
};
export function eventTypeLabel(value: string | null | undefined): string {
  if (!value) return "Event";
  return EVENT_LABELS[value] ?? humanize(value);
}

/** Learning / mastery state → a friendly, curriculum-appropriate phrase. */
const MASTERY_LABELS: Record<string, string> = {
  not_started: "Not started",
  exposed: "First exposure",
  understood: "Understood",
  practicing: "Practicing",
  mastered: "Mastered",
  decaying: "Needs refresh",
  misconception_detected: "Misconception to fix",
};
export function masteryLabel(value: string | null | undefined): string {
  if (!value) return "Not started";
  return MASTERY_LABELS[value] ?? formatLabel(value);
}

/** Language token → display name (extends OVERRIDES with plain-word fallback). */
export function languageLabel(value: string | null | undefined): string {
  return formatLabel(value, "Code");
}

/** MIME type → friendly source kind. "text/markdown" → "Markdown". */
const MIME_LABELS: Record<string, string> = {
  "text/markdown": "Markdown",
  "text/plain": "Text",
  "application/pdf": "PDF",
  "text/html": "Web page",
  "text/csv": "Dataset (CSV)",
  "application/json": "Data (JSON)",
};
export function sourceTypeLabel(value: string | null | undefined, fallback = "Document"): string {
  if (!value) return fallback;
  const key = String(value).toLowerCase();
  if (MIME_LABELS[key]) return MIME_LABELS[key];
  if (key.includes("pdf")) return "PDF";
  if (key.includes("markdown")) return "Markdown";
  if (key.startsWith("image/")) return "Image";
  return fallback;
}

/** Concept identifier → readable name. "concept_demo_sql_commit" → "SQL commit". */
export function conceptLabel(value: string | null | undefined, fallback = "Tracked concept"): string {
  if (!value) return fallback;
  const stripped = String(value).replace(/^concept[_-](demo[_-])?/i, "");
  if (!stripped) return fallback;
  // Preserve well-known acronyms after humanizing.
  return humanize(stripped)
    .replace(/\bSql\b/gi, "SQL")
    .replace(/\bMysql\b/gi, "MySQL")
    .replace(/\bSat\b/g, "SAT")
    .replace(/\bIhc\b/gi, "IHC");
}

// Badge tone hints so callers don't re-derive tone from raw strings.
export type BadgeTone = "green" | "blue" | "orange" | "red" | "neutral";
const STATUS_TONES: Record<string, BadgeTone> = {
  done: "green", verified: "green", mastered: "green", resolved: "green",
  accepted: "green", directly_supported: "green", superseded: "neutral",
  independent_passed: "green", confirmed: "green", active: "blue",
  in_progress: "blue", practicing: "blue", planned: "neutral", backlog: "neutral",
  not_started: "neutral", blocked: "orange", needs_review: "orange", missed: "orange",
  pending: "orange", decaying: "orange", suspected: "orange",
  contradicted: "red", independent_failed: "red", abandoned: "red", rejected: "red",
  misconception_detected: "red",
};
export function statusTone(value: string | null | undefined): BadgeTone {
  if (!value) return "neutral";
  return STATUS_TONES[String(value).toLowerCase()] ?? "neutral";
}
