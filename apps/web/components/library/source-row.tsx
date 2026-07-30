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
  /** `PATCH /api/sources` re-files an indexed source into a project. */
  onSendToProject: (source: LibrarySource) => void;
  /** `GET /api/sources/download` streams the stored original back. */
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
      onSelect: () => actions.onSendToProject(source),
      // A saved OpenAlex work is a bookmark, not one of the user's own sources:
      // filing it means saving the paper into a project, which Discover's
      // destination picker does. Everything else re-files through the API.
      disabled: source.origin === "OpenAlex",
      disabledReason: source.origin === "OpenAlex"
        ? "Saved OpenAlex works are filed from Discover, where the destination picker lives."
        : undefined,
    },
    {
      label: "Download original",
      icon: <Download size={14} />,
      onSelect: () => actions.onDownload(source),
      // The Blob URL never reaches the browser, so the row cannot construct a
      // link itself; `hasOriginal` says whether the server has a file to send,
      // and when it does not the menu gives the actual reason.
      disabled: !source.hasOriginal,
      disabledReason: source.hasOriginal
        ? undefined
        : source.metadataOnly
          ? "This is a citation record — Continuum keeps its details, not a file."
          : "Continuum indexed this source's text but kept no original file to hand back.",
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
