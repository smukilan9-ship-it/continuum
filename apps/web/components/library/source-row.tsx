"use client";

import {
  BookOpen,
  Download,
  FileCode,
  FileText,
  FolderInput,
  Image as ImageIcon,
  Library,
  MessageCircleQuestion,
  MoreHorizontal,
  PanelRightOpen,
  Trash2,
} from "lucide-react";
import { IconButton, Menu, Row, StatusChip, type MenuItem } from "@/components/ui";
import { statusLabel, statusTone, type LibrarySource } from "./types";

const glyphs = {
  pdf: FileText,
  document: FileText,
  text: FileText,
  code: FileCode,
  image: ImageIcon,
  reference: Library,
  paper: BookOpen,
} as const;

export type SourceRowActions = {
  onOpen: (source: LibrarySource) => void;
  onAsk: (source: LibrarySource) => void;
  /** Absent while no write exists to re-file an already-indexed source. */
  onSendToProject?: (source: LibrarySource) => void;
  onDownload: (source: LibrarySource) => void;
  onDelete: (source: LibrarySource) => void;
  onRetry?: (source: LibrarySource) => void;
};

/**
 * The one row shape for everything the user has (§13.2).
 *
 * 56px, so the type glyph, two lines of copy, three chips and an overflow menu
 * all fit without the row becoming a card. Chips are text-first: a colourblind
 * user reads "Failed", not a red dot, and the origin is a word rather than a
 * provider logo.
 */
export function SourceRow({
  source,
  projectLabel,
  position,
  actions,
  selected,
}: {
  source: LibrarySource;
  /** "OASIS · Spatial transcriptomics" — project, and the goal it serves. */
  projectLabel?: string;
  position?: { index: number; setSize: number };
  actions: SourceRowActions;
  selected?: boolean;
}) {
  const Glyph = glyphs[source.kind];
  const failed = source.processingState === "failed";

  const items: MenuItem[] = [
    { label: "Open", icon: <PanelRightOpen size={14} />, onSelect: () => actions.onOpen(source) },
    { label: "Ask about this", icon: <MessageCircleQuestion size={14} />, onSelect: () => actions.onAsk(source) },
    {
      label: "Send to project",
      icon: <FolderInput size={14} />,
      onSelect: () => actions.onSendToProject?.(source),
      disabled: !actions.onSendToProject || source.origin === "OpenAlex",
      disabledReason: source.origin === "OpenAlex"
        ? "Saved OpenAlex works are filed from Discover, where the destination picker lives."
        // Continuum has no write that re-files an indexed source, so the menu
        // says so rather than offering an action that quietly does nothing.
        : "Filing an existing source into a project isn't available yet — choose the project when you add the source.",
    },
    {
      label: "Download",
      icon: <Download size={14} />,
      onSelect: () => actions.onDownload(source),
      // The stored original is deliberately withheld from the browser
      // (`publicSourceMetadata` strips `storage_path`), so offering a download
      // that 404s would be worse than saying why it is unavailable.
      disabled: !source.externalUrl,
      disabledReason: source.externalUrl
        ? undefined
        : "Continuum indexes the text, and does not serve the stored original file back to the browser.",
    },
    { label: "Delete", icon: <Trash2 size={14} />, onSelect: () => actions.onDelete(source), destructive: true },
  ];

  if (failed && actions.onRetry) {
    items.splice(1, 0, { label: "Retry processing", onSelect: () => actions.onRetry?.(source) });
  }

  return (
    <Row
      className="source-row"
      density="comfortable"
      selected={selected}
      onSelect={() => actions.onOpen(source)}
      leading={<span className="source-glyph" aria-hidden="true"><Glyph size={16} /></span>}
      title={
        <span className="source-title" aria-posinset={position?.index !== undefined ? position.index + 1 : undefined} aria-setsize={position?.setSize}>
          {source.title}
        </span>
      }
      meta={source.subtitle}
      trailing={
        <span className="source-chips">
          <StatusChip tone="neutral" label={source.origin} />
          <StatusChip tone={statusTone(source)} label={statusLabel(source)} />
          {projectLabel ? <StatusChip tone="info" label={projectLabel} className="source-chip-project" /> : null}
        </span>
      }
      actions={
        <Menu
          label={`Actions for ${source.title}`}
          items={items}
          trigger={<IconButton label={`Actions for ${source.title}`} size={28}><MoreHorizontal size={16} /></IconButton>}
        />
      }
    />
  );
}
