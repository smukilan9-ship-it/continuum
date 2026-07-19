export type Row = Record<string, unknown>;

export type WorkspaceState = {
  goals: Row[];
  tasks: Row[];
  projects: Row[];
  decisions: Row[];
  notes: Row[];
  sources: Row[];
  learningStates: Row[];
  memoryRecords: Row[];
  receipts: Row[];
  events: Row[];
  proposals: Row[];
  resourceActivities: Row[];
  schedule: Row[];
  modelRoutes: Row[];
  calendarConstraints: Row[];
};

const keys: Array<keyof WorkspaceState> = [
  "goals",
  "tasks",
  "projects",
  "decisions",
  "notes",
  "sources",
  "learningStates",
  "memoryRecords",
  "receipts",
  "events",
  "proposals",
  "resourceActivities",
  "schedule",
  "modelRoutes",
  "calendarConstraints",
];

export function normalizeWorkspaceState(input: Record<string, unknown>): WorkspaceState {
  const normalized = Object.fromEntries(keys.map((key) => [key, Array.isArray(input[key]) ? input[key] : []])) as WorkspaceState;
  if (!normalized.learningStates.length && input.learningState && typeof input.learningState === "object") normalized.learningStates = [input.learningState as Row];
  return normalized;
}

export function text(row: Row | undefined, key: string, fallback = "") {
  return typeof row?.[key] === "string" ? row[key] as string : fallback;
}

export function number(row: Row | undefined, key: string, fallback = 0) {
  return typeof row?.[key] === "number" && Number.isFinite(row[key]) ? row[key] as number : fallback;
}

export function list(row: Row | undefined, key: string) {
  return Array.isArray(row?.[key]) ? (row[key] as unknown[]).map(String) : [];
}

export function formatDate(value: unknown, options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) {
  if (typeof value !== "string" && !(value instanceof Date)) return "Not scheduled";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "Not scheduled" : new Intl.DateTimeFormat(undefined, options).format(parsed);
}

export async function postState(type: string, summary: string, payload: Row) {
  const response = await fetch("/api/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, summary, entityIds: [], payload }),
  });
  const body = await response.json() as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The change could not be saved");
  return body;
}
