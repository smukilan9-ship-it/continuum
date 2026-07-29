"use client";

import { BookmarkCheck, MoreHorizontal, Search } from "lucide-react";
import { Button, DataRegion, EmptyState, ErrorState, IconButton, LoadingState, Menu, Row, StatusChip, type RegionStatus } from "@/components/ui";
import type { SavedEntity, ScholarlyKind } from "@/components/workspace/scholarly-search";

const kindOrder: ScholarlyKind[] = ["works", "authors", "institutions", "sources", "topics"];
const kindLabels: Record<ScholarlyKind, string> = {
  works: "Works",
  authors: "Authors",
  institutions: "Institutions",
  sources: "Journals and repositories",
  topics: "Topics",
};

/**
 * Bookmarked scholarly entities, grouped by kind (§13.2). The logic is
 * unchanged; the presentation now matches every other collection in the
 * product — one `Row`, one overflow menu — instead of a bespoke card.
 */
export function SavedTab({
  saved,
  status,
  error,
  onReload,
  onOpen,
  onRemove,
  onDiscover,
}: {
  saved: SavedEntity[];
  status: RegionStatus;
  error?: string;
  onReload: () => void;
  onOpen: (kind: ScholarlyKind, id: string) => void;
  onRemove: (entry: SavedEntity) => void;
  onDiscover: () => void;
}) {
  const groups = kindOrder
    .map((kind) => ({ kind, entries: saved.filter((entry) => entry.entity_type === kind) }))
    .filter((group) => group.entries.length);

  return (
    <div className="library-saved">
      <DataRegion
        status={status === "ready" && !saved.length ? "empty" : status}
        loading={<LoadingState rows={4} label="Loading saved entities" />}
        error={(
          <ErrorState
            title="We couldn't load your saved library"
            body={error ?? "The list did not load. Nothing has been changed."}
            action={<Button variant="secondary" size="sm" onClick={onReload}>Try again</Button>}
          />
        )}
        empty={(
          <EmptyState
            icon={<BookmarkCheck size={20} />}
            title="Nothing saved yet"
            body="Bookmark a work, author, or topic from Discover and it stays here."
            action={<Button variant="primary" size="sm" onClick={onDiscover}><Search size={14} aria-hidden="true" />Discover sources</Button>}
          />
        )}
      >
        {groups.map((group) => (
          <section key={group.kind} className="library-saved-group">
            <h3>{kindLabels[group.kind]}<span>{group.entries.length}</span></h3>
            <ul className="list">
              {group.entries.map((entry) => (
                <Row
                  key={entry.id}
                  density="comfortable"
                  onSelect={() => onOpen(entry.entity_type, entry.external_id)}
                  title={entry.title}
                  meta={entry.external_id}
                  trailing={<StatusChip tone="neutral" label={kindLabels[entry.entity_type].replace(/s$/, "")} />}
                  actions={
                    <Menu
                      label={`Actions for ${entry.title}`}
                      items={[
                        { label: "Open in Discover", onSelect: () => onOpen(entry.entity_type, entry.external_id) },
                        { label: "Remove from saved", onSelect: () => onRemove(entry), destructive: true },
                      ]}
                      trigger={<IconButton label={`Actions for ${entry.title}`} size={28}><MoreHorizontal size={16} /></IconButton>}
                    />
                  }
                />
              ))}
            </ul>
          </section>
        ))}
      </DataRegion>
    </div>
  );
}
