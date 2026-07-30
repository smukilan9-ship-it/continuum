"use client";

import { Download, FileText, Plus, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  ConfirmationDialog,
  DataRegion,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  Select,
  SidePanel,
  StatusChip,
  type RegionStatus,
} from "@/components/ui";
import { SourceRow } from "./source-row";
import { statusLabel, statusTone, unfiledDestination, type Destination, type LibrarySource } from "./types";
import { VirtualList } from "./virtual-list";

type Passage = { id: string; passage: number; text: string; reference?: string };

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
  /** Re-files an indexed source; resolves once the write has been applied. */
  onSendToProject: (source: LibrarySource, projectId: string | null) => Promise<void> | void;
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
  const [filing, setFiling] = useState<LibrarySource>();
  const [destinationId, setDestinationId] = useState(unfiledDestination.id);
  const [filingBusy, setFilingBusy] = useState(false);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [passageStatus, setPassageStatus] = useState<RegionStatus>("idle");

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

  /**
   * §13.3 source detail: the numbered passages Continuum indexed. Until this
   * existed the panel described a source without ever showing what was actually
   * extracted from it — the one thing that decides whether retrieval can cite
   * it. Metadata-only records have none by definition and say so.
   */
  const loadPassages = useCallback(async (source: LibrarySource) => {
    if (source.metadataOnly || source.id.startsWith("saved:")) { setPassages([]); setPassageStatus("empty"); return; }
    setPassageStatus("loading");
    try {
      const response = await fetch(`/api/sources?sourceId=${encodeURIComponent(source.id)}&include=passages`, { cache: "no-store" });
      const payload = await response.json() as { passages?: Passage[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Passages are unavailable.");
      setPassages(payload.passages ?? []);
      setPassageStatus((payload.passages ?? []).length ? "ready" : "empty");
    } catch {
      setPassages([]);
      setPassageStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!open) { setPassages([]); setPassageStatus("idle"); return; }
    void loadPassages(open);
  }, [loadPassages, open]);

  function startFiling(source: LibrarySource) {
    setFiling(source);
    setDestinationId(destinations.find((entry) => entry.projectId === source.projectId)?.id ?? unfiledDestination.id);
  }

  async function confirmFiling() {
    if (!filing) return;
    setFilingBusy(true);
    try {
      await onSendToProject(filing, destinationId === unfiledDestination.id ? null : destinationId);
      setFiling(undefined);
    } finally { setFilingBusy(false); }
  }

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
                onSendToProject: startFiling,
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

            {/* §13.3: what Continuum actually extracted, numbered as it will be
                cited. This is the difference between "we have this file" and
                "we can quote this file". */}
            {!open.metadataOnly ? (
              <section className="library-passages" aria-label={`Passages in ${open.title}`}>
                <h3>{passageStatus === "ready" ? `${passages.length} passage${passages.length === 1 ? "" : "s"}` : "Passages"}</h3>
                <DataRegion
                  status={passageStatus === "idle" ? "loading" : passageStatus}
                  loading={<LoadingState rows={3} label="Loading passages" />}
                  error={<p className="library-source-note">The passage list didn&apos;t load. The source itself is unaffected.</p>}
                  empty={(
                    <p className="library-source-note">
                      {open.processingState === "ready"
                        ? "No indexed passages. Nothing in this source can be cited yet."
                        : "Passages appear once processing finishes."}
                    </p>
                  )}
                >
                  <ol className="library-passage-list">
                    {passages.map((entry) => (
                      <li key={entry.id}>
                        <span className="library-passage-number">Passage {entry.passage}</span>
                        <p>{entry.text.length > 480 ? `${entry.text.slice(0, 480)}…` : entry.text}</p>
                      </li>
                    ))}
                  </ol>
                </DataRegion>
              </section>
            ) : null}

            <div className="library-detail-actions">
              <Button variant="secondary" size="sm" onClick={() => onAsk(open)}>Ask about this</Button>
              {open.origin !== "OpenAlex" ? <Button variant="secondary" size="sm" onClick={() => { const target = open; setOpen(undefined); startFiling(target); }}>Send to project</Button> : null}
              {open.hasOriginal ? <Button variant="secondary" size="sm" onClick={() => onDownload(open)}><Download size={14} aria-hidden="true" />Download original</Button> : null}
              {open.externalUrl ? <a className="button button-secondary button-sm" href={open.externalUrl} target="_blank" rel="noreferrer">Open full text</a> : null}
              <Button variant="danger" size="sm" onClick={() => { setConfirming(open); setOpen(undefined); }}>Delete</Button>
            </div>
          </div>
        ) : null}
      </SidePanel>

      {/* §13.2 "Send to project". The destination is named before the write,
          and unfiling is one of the choices — a source can leave a project as
          well as join one. */}
      <Modal
        open={Boolean(filing)}
        onOpenChange={(next) => { if (!next && !filingBusy) setFiling(undefined); }}
        title={filing ? `Send “${filing.title}” to a project` : ""}
        description="The source keeps its passages and its history. Only where it is filed changes."
        size="sm"
        footer={(
          <>
            <Button variant="secondary" size="sm" disabled={filingBusy} onClick={() => setFiling(undefined)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={filingBusy} onClick={() => void confirmFiling()}>{filingBusy ? "Filing…" : "Send"}</Button>
          </>
        )}
      >
        <Field label="Project" hint={destinations.length > 1 ? undefined : "You have no research projects yet, so the only destination is your library."}>
          {({ id }) => (
            <Select id={id} value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
              <option value={unfiledDestination.id}>{unfiledDestination.label}</option>
              {destinations.filter((destination) => destination.projectId).map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destination.goalTitle ? `${destination.label} · ${destination.goalTitle}` : destination.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Modal>

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
