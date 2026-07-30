"use client";

import { BookmarkCheck, ChevronDown, ExternalLink, Library, MessageCircleQuestion, MoreHorizontal, Network, Quote } from "lucide-react";
import { Button, IconButton, Menu, Row, StatusChip, type MenuItem } from "@/components/ui";
import type { NormalizedScholarlyWork } from "@/lib/scholarly";
import { citationFormats, type CitationFormat } from "./citation";
import type { Destination } from "./types";

export type ResultRowActions = {
  onOpen: () => void;
  onSave: (destination: Destination) => void;
  onCopyCitation: (format: CitationFormat) => void;
  onFindRelated: () => void;
  onAsk: () => void;
};

/**
 * One discovery result (§13.2, AC-LB2: "Every result row can reach: save, cite,
 * open, and ask").
 *
 * The previous card exposed a bookmark toggle and nothing else — citing meant
 * copying the title by hand, and the destination of a save was whatever the
 * surrounding screen had decided. Both are now on the row: `Save ▾` names where
 * the work is going before it goes there, and `⋯` carries the three citation
 * formats, the full text, the citation-graph jump, and the assistant.
 *
 * Selection is announced with `aria-pressed` on the row's own control rather
 * than `aria-selected` on the `<li>`: a bare `aria-selected` on a list item
 * carries no role and is ignored, and promoting the list to a `listbox` would
 * make the Save and overflow controls inside each row illegal children.
 */
export function ResultRow({
  work,
  selected,
  saved,
  zoteroMatch,
  destinations,
  position,
  actions,
  busy,
}: {
  work: NormalizedScholarlyWork;
  selected: boolean;
  saved: boolean;
  /** The matching Zotero item title, when this work's DOI is in the user's library. */
  zoteroMatch?: string;
  destinations: Destination[];
  position: { index: number; setSize: number };
  actions: ResultRowActions;
  busy?: boolean;
}) {
  const meta = [
    work.authors.slice(0, 3).join(", ") || "Author metadata unavailable",
    work.venue,
    work.year ? String(work.year) : undefined,
    `${(work.citedByCount ?? 0).toLocaleString()} citations`,
  ].filter(Boolean).join(" · ");

  const overflow: MenuItem[] = [
    ...citationFormats.map((format) => ({
      label: `Copy citation — ${format.label}`,
      icon: <Quote size={14} />,
      onSelect: () => actions.onCopyCitation(format.id),
    })),
    {
      label: "Open full text",
      icon: <ExternalLink size={14} />,
      onSelect: () => {
        const url = work.fullTextUrl ?? work.landingPageUrl;
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      },
      disabled: !work.fullTextUrl && !work.landingPageUrl,
      disabledReason: "OpenAlex lists no landing page or open-access file for this work.",
    },
    { label: "Find related", icon: <Network size={14} />, onSelect: actions.onFindRelated },
    { label: "Ask about this", icon: <MessageCircleQuestion size={14} />, onSelect: actions.onAsk },
  ];

  const saveTargets: MenuItem[] = destinations.map((destination) => ({
    label: destination.goalTitle ? `${destination.label} — ${destination.goalTitle}` : destination.label,
    onSelect: () => actions.onSave(destination),
  }));

  return (
    <Row
      className="result-row"
      density="comfortable"
      selected={selected}
      onSelect={actions.onOpen}
      position={position}
      title={<span className="result-title">{work.title}</span>}
      meta={meta}
      trailing={
        <span className="result-chips">
          <StatusChip tone={work.openAccess ? "success" : "neutral"} label={work.openAccess ? "Open access" : "Metadata only"} />
          {zoteroMatch ? <StatusChip tone="info" icon={<Library size={12} />} label="In your Zotero" className="result-zotero-chip" /> : null}
          {work.retracted ? <StatusChip tone="danger" label="Retracted" /> : null}
        </span>
      }
      actions={
        <>
          <Menu
            label={`Save ${work.title} to`}
            items={saveTargets}
            trigger={
              <Button variant={saved ? "secondary" : "primary"} size="sm" disabled={busy} className="result-save">
                <BookmarkCheck size={14} aria-hidden="true" />
                {saved ? "Saved" : "Save"}
                <ChevronDown size={13} aria-hidden="true" />
              </Button>
            }
          />
          <Menu
            label={`More actions for ${work.title}`}
            items={overflow}
            trigger={<IconButton label={`More actions for ${work.title}`} size={28}><MoreHorizontal size={16} /></IconButton>}
          />
        </>
      }
    />
  );
}
