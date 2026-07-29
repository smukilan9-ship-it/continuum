import type { ExecutionOutcome, ExecutionStatus, ExecutionTest, RunnableLanguage } from "@/lib/code-execution";
import type { StatusTone } from "@/components/ui";

/**
 * Language data and run-state vocabulary for `/build` (redesign.md §14.3).
 *
 * The language menu keeps two groups — `Ready to run` and `Editing only` — and
 * every runnable language ships a working sample program, because §14.3 forbids
 * landing a new learner on an empty editor beside an empty console.
 */

export const RUNNABLE_LABELS: Array<{ value: RunnableLanguage; label: string }> = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "sql", label: "SQL (SQLite)" },
];

export const STARTER_CODE: Record<RunnableLanguage, string> = {
  python: `scores = [72, 88, 91, 64, 85]\ncutoff = int(input() or "80")\nselected = [score for score in scores if score >= cutoff]\nprint(f"Selected: {selected}")\nprint(f"Average: {sum(selected) / len(selected):.1f}")`,
  javascript: `const scores = [72, 88, 91, 64, 85];\nconst cutoff = Number(input() || 80);\nconst selected = scores.filter((score) => score >= cutoff);\nconsole.log(\`Selected: \${selected.join(", ")}\`);\nconsole.log(\`Count: \${selected.length}\`);`,
  typescript: `const scores: number[] = [72, 88, 91, 64, 85];\nconst cutoff: number = Number(input() || 80);\nconst selected = scores.filter((score) => score >= cutoff);\nconsole.log(\`Selected: \${selected.join(", ")}\`);\nconsole.log(\`Count: \${selected.length}\`);`,
  sql: `CREATE TABLE students (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  score INTEGER NOT NULL\n);\n\nINSERT INTO students (name, score) VALUES\n  ('Asha', 91), ('Kabir', 76), ('Meera', 88);\n\nSELECT name, score\nFROM students\nWHERE score >= 85\nORDER BY score DESC;`,
};

export const STARTER_INPUT: Record<RunnableLanguage, string> = { python: "80", javascript: "80", typescript: "80", sql: "" };

export const STARTER_TESTS: Record<RunnableLanguage, ExecutionTest[]> = {
  python: [{ id: "sample-cutoff", name: "cutoff 90", stdin: "90", expectedOutput: "Selected: [91]\nAverage: 91.0" }],
  javascript: [{ id: "sample-cutoff", name: "cutoff 90", stdin: "90", expectedOutput: "Selected: 91\nCount: 1" }],
  typescript: [{ id: "sample-cutoff", name: "cutoff 90", stdin: "90", expectedOutput: "Selected: 91\nCount: 1" }],
  sql: [{ id: "query-result", name: "high scorers", expectedOutput: "name | score\nAsha | 91\nMeera | 88" }],
};

const EXTENSIONS: Record<string, string> = {
  python: "py", javascript: "js", typescript: "ts", sql: "sql",
  java: "java", "c++": "cpp", cpp: "cpp", c: "c", rust: "rs", go: "go", kotlin: "kt", ruby: "rb", php: "php", swift: "swift",
};

export function languageExtension(language: string) {
  return EXTENSIONS[language.toLowerCase()] ?? "txt";
}

/** Extension decides the buffer's language, so `.py` never opens as SQL. */
export function languageForExtension(name: string, fallback: string) {
  const extension = name.split(".").at(-1)?.toLowerCase();
  if (extension === "py") return "python";
  if (extension === "js" || extension === "jsx") return "javascript";
  if (extension === "ts" || extension === "tsx") return "typescript";
  if (extension === "sql") return "sql";
  return fallback;
}

export function uniqueFileName(preferred: string, files: Array<{ name: string }>) {
  const taken = new Set(files.map((file) => file.name.toLowerCase()));
  if (!taken.has(preferred.toLowerCase())) return preferred;
  const dot = preferred.lastIndexOf(".");
  const stem = dot > 0 ? preferred.slice(0, dot) : preferred;
  const suffix = dot > 0 ? preferred.slice(dot) : "";
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${stem}-${index}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${stem}-${Date.now()}${suffix}`;
}

export function outcomeLabel(outcome: ExecutionOutcome) {
  return ({ success: "Completed", compiler_error: "Compiler error", runtime_error: "Runtime error", timeout: "Timed out", stopped: "Stopped", provider_error: "Runtime unavailable" })[outcome];
}

export function outcomeTone(outcome: ExecutionOutcome): StatusTone {
  if (outcome === "success") return "success";
  if (outcome === "stopped" || outcome === "timeout") return "warning";
  return "danger";
}

/** Every stage of `preparing → loading runtime → running → testing` is named. */
export function statusLabel(status: ExecutionStatus) {
  return ({
    preparing: "Preparing…",
    loading_python: "Starting Python…",
    loading_sql: "Starting SQL…",
    ready: "Ready",
    running: "Running…",
    testing: "Checking tests…",
    stopping: "Stopping…",
  })[status];
}

export const RUN_LIMITS = [5_000, 10_000, 30_000] as const;

export function runLimitLabel(timeoutMs: number) {
  return `${Math.round(timeoutMs / 1000)}s`;
}
