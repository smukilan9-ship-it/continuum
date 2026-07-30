export const synchronizedRecordTypes = [
  "assistant_memory",
  "research_note",
  "paper_note",
  "learning_note",
  "concept_summary",
  "project_note",
  "session_summary",
  "decision",
  "open_question",
  "next_action",
  "linked_source",
  "workspace_note",
] as const;

export type SynchronizedRecordType = (typeof synchronizedRecordTypes)[number];
export type SyncDeletionState = "active" | "tombstone" | "archived";

export type ContinuumFrontmatter = {
  continuum_record_id: string;
  continuum_sync_id: string;
  continuum_schema_version: number;
  continuum_record_type: SynchronizedRecordType;
  continuum_owner: string;
  continuum_local_revision: number;
  continuum_server_revision: number;
  continuum_common_base_revision: number;
  continuum_content_hash: string;
  continuum_created_at: string;
  continuum_updated_at: string;
  continuum_last_synced_at: string;
  continuum_origin: "continuum" | "obsidian";
  continuum_deletion_state: SyncDeletionState;
};

const safeMetadataKeys = new Set([
  "continuum_record_id",
  "continuum_sync_id",
  "continuum_schema_version",
  "continuum_record_type",
  "continuum_owner",
  "continuum_local_revision",
  "continuum_server_revision",
  "continuum_common_base_revision",
  "continuum_content_hash",
  "continuum_created_at",
  "continuum_updated_at",
  "continuum_last_synced_at",
  "continuum_origin",
  "continuum_deletion_state",
]);

export function normalizeVaultPath(value: string) {
  const normalized = value.normalize("NFKC").replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+/g, "/");
  if (
    !normalized
    || normalized.startsWith("/")
    || /^[a-zA-Z]:\//.test(normalized)
    || normalized.includes("\0")
    || normalized.split("/").some((part) => !part || part === "." || part === "..")
  ) throw new Error("Path rejected: choose a relative path inside the configured vault.");
  if (!normalized.toLowerCase().endsWith(".md")) throw new Error("Path rejected: synchronized notes must be Markdown files.");
  return normalized;
}

function scalar(value: string) {
  const trimmed = value.trim();
  if (trimmed.length > 2_000) throw new Error("Malformed frontmatter: a metadata value is too long.");
  if (/^["']/.test(trimmed) && trimmed.at(-1) === trimmed[0]) return trimmed.slice(1, -1);
  return trimmed;
}

export function parseContinuumFrontmatter(markdown: string) {
  if (!markdown.startsWith("---\n") && !markdown.startsWith("---\r\n")) return { body: markdown, metadata: undefined };
  const normalized = markdown.replace(/\r\n/g, "\n");
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0 || end > 20_000) throw new Error("Malformed frontmatter: closing delimiter is missing.");
  const block = normalized.slice(4, end);
  const raw: Record<string, string> = {};
  for (const line of block.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!safeMetadataKeys.has(key)) continue;
    if (key in raw) throw new Error(`Malformed frontmatter: duplicate ${key}.`);
    raw[key] = scalar(line.slice(separator + 1));
  }
  const required = [...safeMetadataKeys];
  if (!required.every((key) => raw[key] !== undefined)) {
    return { body: normalized.slice(end + 5), metadata: undefined };
  }
  const recordType = raw.continuum_record_type;
  const deletionState = raw.continuum_deletion_state;
  const origin = raw.continuum_origin;
  if (!synchronizedRecordTypes.includes(recordType as SynchronizedRecordType)) throw new Error("Malformed frontmatter: unsupported record type.");
  if (!["active", "tombstone", "archived"].includes(deletionState!)) throw new Error("Malformed frontmatter: invalid deletion state.");
  if (!["continuum", "obsidian"].includes(origin!)) throw new Error("Malformed frontmatter: invalid origin.");
  const integer = (key: string) => {
    const value = Number(raw[key]);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Malformed frontmatter: ${key} must be a non-negative integer.`);
    return value;
  };
  return {
    body: normalized.slice(end + 5),
    metadata: {
      continuum_record_id: raw.continuum_record_id!,
      continuum_sync_id: raw.continuum_sync_id!,
      continuum_schema_version: integer("continuum_schema_version"),
      continuum_record_type: recordType as SynchronizedRecordType,
      continuum_owner: raw.continuum_owner!,
      continuum_local_revision: integer("continuum_local_revision"),
      continuum_server_revision: integer("continuum_server_revision"),
      continuum_common_base_revision: integer("continuum_common_base_revision"),
      continuum_content_hash: raw.continuum_content_hash!,
      continuum_created_at: raw.continuum_created_at!,
      continuum_updated_at: raw.continuum_updated_at!,
      continuum_last_synced_at: raw.continuum_last_synced_at!,
      continuum_origin: origin as "continuum" | "obsidian",
      continuum_deletion_state: deletionState as SyncDeletionState,
    } satisfies ContinuumFrontmatter,
  };
}

function yamlString(value: string) {
  return JSON.stringify(value.replace(/[\u0000-\u001f\u007f]/g, ""));
}

export function renderContinuumMarkdown(metadata: ContinuumFrontmatter, body: string) {
  return [
    "---",
    `continuum_record_id: ${yamlString(metadata.continuum_record_id)}`,
    `continuum_sync_id: ${yamlString(metadata.continuum_sync_id)}`,
    `continuum_schema_version: ${metadata.continuum_schema_version}`,
    `continuum_record_type: ${metadata.continuum_record_type}`,
    `continuum_owner: ${yamlString(metadata.continuum_owner)}`,
    `continuum_local_revision: ${metadata.continuum_local_revision}`,
    `continuum_server_revision: ${metadata.continuum_server_revision}`,
    `continuum_common_base_revision: ${metadata.continuum_common_base_revision}`,
    `continuum_content_hash: ${yamlString(metadata.continuum_content_hash)}`,
    `continuum_created_at: ${yamlString(metadata.continuum_created_at)}`,
    `continuum_updated_at: ${yamlString(metadata.continuum_updated_at)}`,
    `continuum_last_synced_at: ${yamlString(metadata.continuum_last_synced_at)}`,
    `continuum_origin: ${metadata.continuum_origin}`,
    `continuum_deletion_state: ${metadata.continuum_deletion_state}`,
    "---",
    "",
    body.replace(/^\s+/, ""),
  ].join("\n");
}

export function syncBackoffMilliseconds(attempt: number) {
  const bounded = Math.max(1, Math.min(12, Math.floor(attempt)));
  return Math.min(60 * 60_000, 1_000 * (2 ** (bounded - 1)));
}
