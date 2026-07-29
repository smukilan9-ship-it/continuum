"use client";

import { FileText, Plus, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Button,
  ConfirmationDialog,
  DataRegion,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
  SidePanel,
  StatusChip,
  type RegionStatus,
} from "@/components/ui";
import { SourceRow } from "./source-row";
import { statusLabel, statusTone, type Destination, type LibrarySource } from "./types";
import { VirtualList } from "./virtual-list";

type Sort = "recent" | "title" | "year";
type TypeFilter = "all" | "papers" | "files";
type StatusFilter = "all" | "ready" | "processing" | "failed" | "metadata";

/**
 * The Sources tab — the Library's new default (§13.2).
 *
 * It answers the question the old Library could not: *what do I actually have?*
 * Uploads, imported Zotero items and saved OpenAlex works were three separate
 * screens (or no screen at all); here they are one list with one row shape, one
 * search field, and one overflow menu.
 */
export function SourcesTab({
  sources,
  status,
  error,
  destinations,
  onReload,
  onAdd,
  onAsk,
  onDelete,
  onSendToProject,
  onDownload,
  busyId,
}: {
  sources: LibrarySource[];
  status: RegionStatus;
  error?: string;
  destinations: Destination[];
  onReload: () => void;
  onAdd: () => void;
  onAsk: (source: LibrarySource) => void;
  onDelete: (source: LibrarySource) => Promise<void> | void;
  /** Omitted while no write exists to re-file an indexed source; the menu says so. */
  onSendToProject?: (source: LibrarySource) => void;
  onDownload: (source: LibrarySource) => void;
  busyId?: string;
}) {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [hasPdf, setHasPdf] = useState(false);
  const [sort, setSort] = useState<Sort>("recent");
  const [open, setOpen] = useState<LibrarySource>();
  const [confirming, setConfirming] = useState<LibrarySource>();

  const projectLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const destination of destinations) {
      if (destination.projectId) map.set(destination.projectId, destination.goalTitle ? `${destination.label} · ${destination.goalTitle}` : destination.label);
    }
    return map;
  }, [destinations]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = sources.filter((source) => {
      if (needle && !`${source.title} ${source.subtitle}`.toLowerCase().includes(needle)) return false;
      if (typeFilter === "papers" && source.kind !== "paper" && source.kind !== "reference") return false;
      if (typeFilter === "files" && (source.kind === "paper" || source.kind === "reference")) return false;
      if (statusFilter === "ready" && (source.processingState !== "ready" || source.metadataOnly)) return false;
      if (statusFilter === "metadata" && !source.metadataOnly) return false;
      if (statusFilter === "processing" && source.processingState !== "processing" && source.processingState !== "pending") return false;
      if (statusFilter === "failed" && source.processingState !== "failed") return false;
      if (projectFilter !== "all" && source.projectId !== projectFilter) return false;
      if (hasPdf && !source.hasPdf) return false;
      return true;
    });
    return matched.sort((left, right) => {
      if (sort === "title") return left.title.localeCompare(right.title);
      // Only references carry a publication year. Uploads have none, so they
      // sort after everything dated rather than being given a fake one.
      if (sort === "year") return (right.year ?? -1) - (left.year ?? -1);
      return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
    });
  }, [hasPdf, projectFilter, query, sort, sources, statusFilter, typeFilter]);

  const filtersActive = typeFilter !== "all" || statusFilter !== "all" || projectFilter !== "all" || hasPdf;
  const regionStatus: RegionStatus = status === "ready" && !filtered.length ? "empty" : status;

  return (
    <div className="library-sources">
      <div className="library-toolbar">
        <label className="library-search">
          <Search size={16} aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your sources"
            aria-label="Search your sources by title or author"
          />
        </label>
        <Button variant="secondary" size="sm" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
          <SlidersHorizontal size={14} aria-hidden="true" />
          Filters
          {filtersActive ? <span className="library-filter-dot" aria-label="filters applied" /> : null}
        </Button>
        <Select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sort sources" className="library-sort">
          <option value="recent">Recent</option>
          <option value="title">Title</option>
          <option value="year">Year</option>
        </Select>
        <Button variant="primary" size="sm" onClick={onAdd}><Plus size={14} aria-hidden="true" />Add source</Button>
      </div>

      {filtersOpen ? (
        <div className="library-filter-line" role="group" aria-label="Source filters">
          <label>Type
            <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}>
              <option value="all">All</option>
              <option value="papers">Papers</option>
              <option value="files">Files</option>
            </Select>
          </label>
          <label>Status
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">Any</option>
              <option value="ready">Ready</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
              <option value="metadata">Metadata only</option>
            </Select>
          </label>
          <label>Goal
            <Select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
              <option value="all">Anywhere</option>
              {destinations.filter((destination) => destination.projectId).map((destination) => (
                <option key={destination.id} value={destination.projectId}>{destination.label}</option>
              ))}
            </Select>
          </label>
          <label className="library-filter-check">
            <input type="checkbox" checked={hasPdf} onChange={(event) => setHasPdf(event.target.checked)} />
            Has PDF
          </label>
          {filtersActive ? (
            <Button variant="quiet" size="sm" onClick={() => { setTypeFilter("all"); setStatusFilter("all"); setProjectFilter("all"); setHasPdf(false); }}>Clear</Button>
          ) : null}
        </div>
      ) : null}

      <p className="library-count" aria-live="polite">
        {status === "ready" ? `${filtered.length.toLocaleString()} of ${sources.length.toLocaleString()} source${sources.length === 1 ? "" : "s"}` : ""}
      </p>

      <DataRegion
        status={regionStatus}
        loading={<LoadingState rows={6} label="Loading your sources" />}
        error={(
          <ErrorState
            title="We couldn't load your sources"
            body={error ?? "The source list did not load. Nothing has been changed."}
            action={<Button variant="secondary" size="sm" onClick={onReload}><RefreshCw size={14} aria-hidden="true" />Try again</Button>}
          />
        )}
        empty={
          sources.length ? (
            <EmptyState
              title="Nothing matches those filters"
              body="Widen the search, clear a filter, or add a new source."
              action={<Button variant="secondary" size="sm" onClick={() => { setQuery(""); setTypeFilter("all"); setStatusFilter("all"); setProjectFilter("all"); setHasPdf(false); }}>Clear filters</Button>}
            />
          ) : (
            <EmptyState
              icon={<FileText size={20} />}
              title="No sources yet"
              body="Upload a PDF, add a paper by DOI, or import from Zotero — everything you keep lands in this list."
              action={<Button variant="primary" size="sm" onClick={onAdd}><Plus size={14} aria-hidden="true" />Add source</Button>}
            />
          )
        }
      >
        <VirtualList
          items={filtered}
          rowHeight={56}
          label="Your sources"
          className="library-list-viewport"
          renderItem={(source, position) => (
            <SourceRow
              key={source.id}
              source={source}
              position={position}
              projectLabel={source.projectId ? projectLabels.get(source.projectId) : undefined}
              selected={open?.id === source.id}
              actions={{
                onOpen: setOpen,
                onAsk,
                onSendToProject,
                onDownload,
                onDelete: setConfirming,
              }}
            />
          )}
        />
      </DataRegion>

      <SidePanel open={Boolean(open)} onOpenChange={(next) => { if (!next) setOpen(undefined); }} title={open?.title ?? "Source"}>
        {open ? (
          <div className="library-source-detail">
            <div className="source-chips">
              <StatusChip tone="neutral" label={open.origin} />
              <StatusChip tone={statusTone(open)} label={statusLabel(open)} />
              {open.projectId && projectLabels.get(open.projectId) ? <StatusChip tone="info" label={projectLabels.get(open.projectId)!} /> : null}
            </div>
            {open.processingState === "failed" ? (
              <p className="library-source-error">{open.processingError ?? "This file has no extractable text — it may be a scan."}</p>
            ) : null}
            {open.processingState === "processing" || open.processingState === "pending" ? (
              <p className="library-source-note">Not yet searchable. This source is still being processed.</p>
            ) : null}
            <dl className="library-facts">
              <div><dt>Type</dt><dd>{open.subtitle}</dd></div>
              <div><dt>Origin</dt><dd>{open.origin}</dd></div>
              {open.doi ? <div><dt>DOI</dt><dd>{open.doi}</dd></div> : null}
              {open.updatedAt ? <div><dt>Updated</dt><dd>{new Date(open.updatedAt).toLocaleString()}</dd></div> : null}
            </dl>
            {open.metadataOnly ? (
              <p className="library-source-note">
                Continuum holds this record&apos;s citation metadata, not its text. It can be cited and opened, and it will not appear in passage search.
              </p>
            ) : null}
            <div className="library-detail-actions">
              <Button variant="secondary" size="sm" onClick={() => onAsk(open)}>Ask about this</Button>
              {open.externalUrl ? <a className="button button-secondary button-sm" href={open.externalUrl} target="_blank" rel="noreferrer">Open full text</a> : null}
              <Button variant="danger" size="sm" onClick={() => { setConfirming(open); setOpen(undefined); }}>Delete</Button>
            </div>
          </div>
        ) : null}
      </SidePanel>

      <ConfirmationDialog
        open={Boolean(confirming)}
        onOpenChange={(next) => { if (!next) setConfirming(undefined); }}
        title={confirming ? `Remove “${confirming.title}”?` : ""}
        description="The source is removed from Continuum retrieval. Its audit record is retained, and claims already linked to it keep their provenance."
        confirmLabel="Remove source"
        destructive
        busy={Boolean(busyId) && busyId === confirming?.id}
        onConfirm={() => { const target = confirming; setConfirming(undefined); if (target) void onDelete(target); }}
      />
    </div>
  );
}
