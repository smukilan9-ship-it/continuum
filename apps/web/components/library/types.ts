import { sourceTypeLabel } from "@/lib/labels";

/**
 * Shared vocabulary for the Library (redesign.md §13.2–§13.3).
 *
 * The Sources tab merges three physically different records — uploaded files,
 * Zotero items that have been imported, and saved OpenAlex works — into one
 * list, because the user does not distinguish them. Everything needed to render
 * a row uniformly is derived here so `SourceRow` never branches on where a
 * record came from.
 */

export type LibraryTab = "sources" | "discover" | "saved" | "zotero";

export const libraryTabs: LibraryTab[] = ["sources", "discover", "saved", "zotero"];

export function isLibraryTab(value: string | undefined): value is LibraryTab {
  return Boolean(value) && (libraryTabs as string[]).includes(value as string);
}

/** Where a source entered Continuum. Shown verbatim as the origin chip. */
export type SourceOrigin = "Upload" | "OpenAlex" | "Zotero" | "Obsidian";

/** Mirrors the `processing_state` column added in migration 0009. */
export type ProcessingState = "pending" | "processing" | "ready" | "failed";

export type SourceKind = "pdf" | "document" | "text" | "code" | "image" | "reference" | "paper";

export type LibrarySource = {
  id: string;
  title: string;
  /** Authors and year for a reference, or the filename for an upload. */
  subtitle: string;
  origin: SourceOrigin;
  kind: SourceKind;
  processingState: ProcessingState;
  processingError?: string;
  /** True for records that carry citation metadata but no indexed full text. */
  metadataOnly: boolean;
  projectId?: string;
  doi?: string;
  year?: number;
  externalUrl?: string;
  updatedAt?: string;
  hasPdf: boolean;
  /**
   * Whether a Download can actually return a file. Pasted text, Zotero
   * metadata, and anything ingested while the file store was unreachable have
   * indexed passages and no original.
   */
  hasOriginal: boolean;
};

/** A place a newly acquired source can land. `null` project means unfiled. */
export type Destination = {
  /** `unfiled` or a project id. */
  id: string;
  label: string;
  /** The goal a project belongs to, used to group the picker. */
  goalTitle?: string;
  projectId?: string;
};

export const unfiledDestination: Destination = { id: "unfiled", label: "Just my library" };

const zoteroParsers = new Set(["zotero-web-api-v3"]);

function originFor(mimeType: string, parserVersion: string): SourceOrigin {
  if (zoteroParsers.has(parserVersion) || mimeType === "application/vnd.zotero.item+json") return "Zotero";
  if (parserVersion === "obsidian-sync-v1") return "Obsidian";
  return "Upload";
}

function kindFor(mimeType: string, origin: SourceOrigin, title: string): SourceKind {
  if (origin === "Zotero") return "reference";
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.includes("wordprocessingml")) return "document";
  if (/\.(ts|tsx|js|jsx|py|rs|go|rb|java|c|cc|cpp|h|hpp|sql|sh|css|html)$/i.test(title)) return "code";
  return "text";
}

function readString(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Normalises one row of `GET /api/sources`.
 *
 * `processing_state` only exists after migration 0009, so an absent value reads
 * as `ready` — which is what every pre-migration row is: the route writes the
 * row after extraction and chunking have already succeeded.
 */
export function normalizeSourceRow(row: Record<string, unknown>): LibrarySource | undefined {
  const id = readString(row, "id");
  const title = readString(row, "title");
  if (!id || !title) return undefined;
  const mimeType = readString(row, "mimeType") ?? readString(row, "mime_type") ?? "text/plain";
  const parserVersion = readString(row, "parserVersion") ?? readString(row, "parser_version") ?? "";
  const origin = originFor(mimeType, parserVersion);
  const rawState = readString(row, "processingState") ?? readString(row, "processing_state") ?? "ready";
  const processingState: ProcessingState =
    rawState === "pending" || rawState === "processing" || rawState === "failed" ? rawState : "ready";
  const updatedAt = readString(row, "updatedAt") ?? readString(row, "updated_at");
  return {
    id,
    title,
    // The title is already the filename, so the second line says what kind of
    // thing it is and when it last changed — not the raw MIME type, which is
    // what the old Research list showed.
    subtitle: [origin === "Zotero" ? "Imported reference" : sourceTypeLabel(mimeType), updatedAt ? new Date(updatedAt).toLocaleDateString() : ""].filter(Boolean).join(" · "),
    origin,
    kind: kindFor(mimeType, origin, title),
    processingState,
    processingError: readString(row, "processingError") ?? readString(row, "processing_error"),
    metadataOnly: origin === "Zotero",
    projectId: readString(row, "projectId") ?? readString(row, "project_id"),
    updatedAt,
    hasPdf: mimeType.includes("pdf"),
    hasOriginal: row.hasStoredOriginal === true,
  };
}

/**
 * A saved OpenAlex work is a source the user has, so it belongs in the same
 * list — labelled `Metadata only`, because Continuum holds its citation record
 * and not its text, and saying otherwise would be the lie the Sources tab
 * exists to stop telling.
 */
export function savedWorkAsSource(entry: {
  id: string;
  entity_type: string;
  external_id: string;
  title: string;
  metadata?: Record<string, unknown>;
}): LibrarySource {
  const metadata = entry.metadata ?? {};
  const authors = Array.isArray(metadata.authors) ? metadata.authors.filter((value): value is string => typeof value === "string") : [];
  const year = typeof metadata.year === "number" ? metadata.year : undefined;
  const subtitle = [authors.slice(0, 3).join(", "), year ? String(year) : ""].filter(Boolean).join(" · ");
  return {
    id: `saved:${entry.entity_type}:${entry.external_id}`,
    title: entry.title,
    subtitle: subtitle || "Saved from OpenAlex",
    origin: "OpenAlex",
    kind: "paper",
    processingState: "ready",
    metadataOnly: true,
    doi: typeof metadata.doi === "string" ? metadata.doi : undefined,
    year,
    externalUrl: `https://openalex.org/${entry.external_id}`,
    hasPdf: typeof metadata.fullTextUrl === "string",
    // A saved work is a citation record; the PDF, when there is one, lives at
    // the publisher, not in Continuum.
    hasOriginal: false,
  };
}

export function statusLabel(source: LibrarySource) {
  if (source.processingState === "failed") return "Failed";
  if (source.processingState === "processing" || source.processingState === "pending") return "Processing…";
  return source.metadataOnly ? "Metadata only" : "Ready";
}

export function statusTone(source: LibrarySource): "success" | "warning" | "danger" | "neutral" | "processing" {
  if (source.processingState === "failed") return "danger";
  if (source.processingState === "processing" || source.processingState === "pending") return "processing";
  return source.metadataOnly ? "neutral" : "success";
}

/** Normalises a DOI for comparison. Zotero and OpenAlex disagree on case and prefix. */
export function normalizeDoi(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  return trimmed.replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^doi:/, "");
}
