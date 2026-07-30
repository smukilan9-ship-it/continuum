/**
 * Turns retrieved context into the records a message actually used.
 *
 * The previous implementation reported the *scope names the user had ticked*
 * ("approved_memory", "workspace") as provenance, so a reply that retrieved
 * nothing still rendered "Answered using 2 records from your workspace". The
 * number counted checkboxes. Provenance now comes from the retrieval result, so
 * a citation chip always points at a row that exists.
 */

export type UsedContextType =
  | "goal" | "task" | "project" | "decision" | "claim" | "source"
  | "passage" | "concept" | "receipt" | "note" | "attachment" | "memory";

export interface UsedContextEntry {
  type: UsedContextType;
  /** The real record id. Must resolve in the database. */
  id: string;
  /** What the user sees on the chip. Never an id. */
  label: string;
  /** Where clicking the chip goes, when the record has a surface. */
  href?: string;
  /** The snippet that was actually sent to the model. */
  snippet?: string;
}

function str(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function firstString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = str(row, key);
    if (value) return value;
  }
  return "";
}

function trimLabel(value: string, max = 80): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Best-effort classification of a memory chunk into a user-legible type. */
function memoryType(kind: string): UsedContextType {
  if (kind.includes("decision")) return "decision";
  if (kind.includes("claim")) return "claim";
  if (kind.includes("concept") || kind.includes("misconception") || kind.includes("learning")) return "concept";
  if (kind.includes("receipt") || kind.includes("checkpoint") || kind.includes("session")) return "receipt";
  if (kind.includes("task")) return "task";
  if (kind.includes("project")) return "project";
  if (kind.includes("goal") || kind.includes("progress")) return "goal";
  return "memory";
}

/**
 * Where clicking a citation chip goes (§11.6). Every type has a destination —
 * the inspector's **Open** action is half of what makes provenance checkable,
 * and a record with no href renders the panel with only "Don't use this again".
 *
 * These are the §7.1 addresses. They were the pre-rename ones, so every chip
 * cost a redirect and `memory` — the most common type by far, since it is what
 * `searchMemory` returns — had no destination at all.
 */
export function hrefFor(type: string, id: string, goalId?: string, projectId?: string): string {
  const record = encodeURIComponent(id);
  if (type === "goal") return goalId ? `/g/${encodeURIComponent(goalId)}` : "/plan";
  if (type === "task") return goalId ? `/g/${encodeURIComponent(goalId)}?view=plan` : "/plan";
  if (type === "project" || type === "decision" || type === "claim") {
    return projectId && goalId ? `/g/${encodeURIComponent(goalId)}/p/${encodeURIComponent(projectId)}` : "/research";
  }
  if (type === "source" || type === "passage" || type === "attachment") return `/library?tab=sources&source=${record}`;
  // `misconception` and `progress` are memory-chunk kinds the seed writes.
  if (type === "concept") return `/learn?concept=${record}`;
  // Receipts, notes and memory chunks are all things Continuum remembers, and
  // /context is where a user inspects — or forgets — any of them.
  return `/context?record=${record}`;
}

/** Builds provenance entries from retrieved memory chunks. */
export function fromMemoryChunks(chunks: Array<Record<string, unknown>>): UsedContextEntry[] {
  return chunks.flatMap((chunk) => {
    const id = str(chunk, "id");
    if (!id) return [];
    const kind = str(chunk, "kind");
    const type = memoryType(kind);
    const content = str(chunk, "content");
    if (!content) return [];
    return [{
      type,
      id,
      label: trimLabel(content),
      href: hrefFor(type, id),
      snippet: content.slice(0, 400),
    }];
  });
}

/** Builds provenance entries from attached source chunks. */
export function fromAttachments(
  sources: Array<Record<string, unknown>>,
  chunks: Array<Record<string, unknown>>,
): UsedContextEntry[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const source of sources) byId.set(str(source, "id"), source);

  const seen = new Set<string>();
  const entries: UsedContextEntry[] = [];
  for (const chunk of chunks) {
    const sourceId = str(chunk, "sourceId");
    const source = byId.get(sourceId);
    if (!source || seen.has(sourceId)) continue;
    seen.add(sourceId);
    entries.push({
      type: "attachment",
      id: sourceId,
      label: trimLabel(firstString(source, ["title"]) || "Attached source"),
      href: hrefFor("attachment", sourceId),
      snippet: str(chunk, "text").slice(0, 400),
    });
  }
  return entries;
}

/** Builds provenance entries from the structured current-state pack. */
export function fromWorkspaceContext(context: unknown): UsedContextEntry[] {
  if (!context || typeof context !== "object") return [];
  const pack = context as Record<string, unknown>;
  const entries: UsedContextEntry[] = [];

  const push = (rows: unknown, type: UsedContextType, keys: string[]) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows.slice(0, 4)) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      const id = str(record, "id");
      const label = firstString(record, keys);
      if (!id || !label) continue;
      entries.push({ type, id, label: trimLabel(label), href: hrefFor(type, id) });
    }
  };

  push(pack.activeGoals ?? pack.goals, "goal", ["title"]);
  push(pack.activeProjects ?? pack.projects, "project", ["title"]);
  push(pack.currentTasks ?? pack.tasks, "task", ["title"]);
  push(pack.acceptedDecisions ?? pack.decisions, "decision", ["text", "title"]);
  push(pack.recentOutcomeReceipts ?? pack.receipts, "receipt", ["summary"]);

  return entries;
}

/**
 * Merges, de-duplicates by id, and caps provenance at the number of records the
 * orchestrator is allowed to send.
 */
export function mergeProvenance(groups: UsedContextEntry[][], limit = 8): UsedContextEntry[] {
  const seen = new Set<string>();
  const merged: UsedContextEntry[] = [];
  for (const group of groups) {
    for (const entry of group) {
      if (!entry.id || seen.has(entry.id)) continue;
      seen.add(entry.id);
      merged.push(entry);
      if (merged.length >= limit) return merged;
    }
  }
  return merged;
}

/**
 * The id → label map the output filter uses, so an identifier the model echoes
 * is rewritten to the record's title instead of being deleted mid-sentence.
 */
export function labelMap(entries: UsedContextEntry[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const entry of entries) {
    labels.set(entry.id, entry.label);
    labels.set(entry.id.toLowerCase(), entry.label);
  }
  return labels;
}
