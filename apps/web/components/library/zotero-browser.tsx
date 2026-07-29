"use client";

import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Folder,
  Library,
  MoreHorizontal,
  RefreshCw,
  Search,
  Telescope,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banner,
  Button,
  ConfirmationDialog,
  DataRegion,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  LoadingButton,
  LoadingState,
  Menu,
  Row,
  Select,
  StatusChip,
  type MenuItem,
  type RegionStatus,
} from "@/components/ui";
import { classifyZoteroFailure, type ZoteroFailure } from "./scholarly-errors";
import { ZoteroSetupDialog } from "./zotero-setup-dialog";

type ZoteroLibrary = { type: "user" | "group"; id: string; name: string; permissions: { library: boolean; files: boolean; write: boolean } };
type SyncState = { library_type?: string; library_id?: string; last_sync_at?: string; last_error?: string };
type Collection = { key: string; name: string; parentCollectionKey?: string; version: number };
type Item = {
  key: string;
  version: number;
  itemType: string;
  title: string;
  abstract: string;
  doi?: string;
  url?: string;
  creators: Array<{ name: string; creatorType?: string }>;
  date?: string;
  publicationTitle?: string;
  attachment?: { availability: "local_file_unavailable" | "external_url" | "stored_pdf" | "stored_file"; url?: string };
};

const pageSize = 30;

function collectionDepth(collection: Collection, byKey: Map<string, Collection>) {
  let depth = 0;
  let cursor = collection.parentCollectionKey;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor) && depth < 12) {
    seen.add(cursor);
    depth += 1;
    cursor = byKey.get(cursor)?.parentCollectionKey;
  }
  return depth;
}

function relativeTime(iso?: string) {
  if (!iso) return undefined;
  const elapsed = Date.now() - Date.parse(iso);
  if (!Number.isFinite(elapsed) || elapsed < 0) return undefined;
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.floor(hours / 24)} day${Math.floor(hours / 24) === 1 ? "" : "s"} ago`;
}

/**
 * Zotero as part of the Library, not as a technical integration (§13.3).
 *
 * The rail names libraries and collections the way Zotero does, the main
 * column is one item row with the three things a person wants to do with a
 * reference, and the sync line says when it last ran rather than exposing a
 * version number. Every failure is named and paired with its fix (AC-Z2) —
 * "Zotero request failed" told the user which of the four different problems
 * they had exactly none of the time.
 */
export function ZoteroBrowser({
  showToast,
  onFindInOpenAlex,
  onImported,
}: {
  showToast: (message: string | null) => void;
  /** Hands a DOI to the Discover tab so the two halves cross-reference. */
  onFindInOpenAlex?: (doi: string) => void;
  onImported?: () => void | Promise<void>;
}) {
  const [libraries, setLibraries] = useState<ZoteroLibrary[]>([]);
  const [syncState, setSyncState] = useState<SyncState[]>([]);
  const [libraryKey, setLibraryKey] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionKey, setCollectionKey] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Item>();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [start, setStart] = useState(0);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState<RegionStatus>("loading");
  const [failure, setFailure] = useState<ZoteroFailure>();
  const [connected, setConnected] = useState<boolean>();
  const [setupOpen, setSetupOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const syncAbort = useRef<AbortController>(undefined);

  const selectedLibrary = libraries.find((library) => `${library.type}:${library.id}` === libraryKey);

  const loadLibraries = useCallback(async () => {
    setBusy("libraries");
    setFailure(undefined);
    try {
      const response = await fetch("/api/connections/zotero?resource=libraries", { cache: "no-store" });
      const payload = await response.json() as { libraries?: ZoteroLibrary[]; syncState?: SyncState[]; error?: string };
      if (!response.ok) {
        const classified = classifyZoteroFailure(response.status, payload.error);
        setFailure(classified);
        setConnected(!(payload.error ?? "").toLowerCase().includes("not connected"));
        setStatus("error");
        return;
      }
      setLibraries(payload.libraries ?? []);
      setSyncState(payload.syncState ?? []);
      setConnected(true);
      setLibraryKey((current) => current || (payload.libraries?.[0] ? `${payload.libraries[0].type}:${payload.libraries[0].id}` : ""));
      setStatus("ready");
    } catch {
      setFailure(classifyZoteroFailure(0, undefined));
      setStatus("error");
    } finally { setBusy(""); }
  }, []);

  useEffect(() => { void loadLibraries(); }, [loadLibraries]);

  useEffect(() => {
    if (!selectedLibrary) return;
    setCollectionKey("");
    setStart(0);
    setSelected(undefined);
    const parameters = new URLSearchParams({ resource: "collections", libraryType: selectedLibrary.type, libraryId: selectedLibrary.id });
    void fetch(`/api/connections/zotero?${parameters}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { collections?: Collection[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Collections are unavailable.");
        setCollections(payload.collections ?? []);
      })
      .catch((cause) => setFailure(classifyZoteroFailure(0, cause instanceof Error ? cause.message : undefined)));
  }, [selectedLibrary]);

  const loadItems = useCallback(async () => {
    if (!selectedLibrary) return;
    setBusy("items");
    const parameters = new URLSearchParams({
      resource: "items",
      libraryType: selectedLibrary.type,
      libraryId: selectedLibrary.id,
      start: String(start),
      limit: String(pageSize),
      sort: "dateModified",
      direction: "desc",
    });
    if (collectionKey) parameters.set("collectionKey", collectionKey);
    if (submittedQuery) parameters.set("q", submittedQuery);
    try {
      const response = await fetch(`/api/connections/zotero?${parameters}`, { cache: "no-store" });
      const payload = await response.json() as { items?: Item[]; total?: number; error?: string };
      if (!response.ok) { setFailure(classifyZoteroFailure(response.status, payload.error)); return; }
      setFailure(undefined);
      setItems(payload.items ?? []);
      setTotal(payload.total ?? 0);
      setSelected((current) => current && payload.items?.some((item) => item.key === current.key) ? current : payload.items?.[0]);
    } catch {
      setFailure(classifyZoteroFailure(0, undefined));
    } finally { setBusy(""); }
  }, [collectionKey, selectedLibrary, start, submittedQuery]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const collectionMap = useMemo(() => new Map(collections.map((collection) => [collection.key, collection])), [collections]);
  const lastSync = syncState.find((entry) => entry.library_type === selectedLibrary?.type && entry.library_id === selectedLibrary?.id);

  async function importItem(item: Item) {
    if (!selectedLibrary) return;
    setBusy(`import:${item.key}`);
    try {
      const response = await fetch("/api/connections/zotero", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save_item", libraryType: selectedLibrary.type, libraryId: selectedLibrary.id, itemKey: item.key }),
      });
      const payload = await response.json() as { error?: string; title?: string };
      if (!response.ok) {
        const classified = classifyZoteroFailure(response.status, payload.error);
        showToast(classified.body);
        return;
      }
      showToast(`${payload.title ?? item.title} is now a Continuum source.`);
      await onImported?.();
    } catch {
      showToast("The item could not be imported. Nothing was changed.");
    } finally { setBusy(""); }
  }

  async function runSync() {
    setBusy("sync");
    syncAbort.current = new AbortController();
    try {
      const response = await fetch("/api/connections/zotero", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
        signal: syncAbort.current.signal,
      });
      const payload = await response.json() as { changedItems?: number; error?: string };
      if (!response.ok) { setFailure(classifyZoteroFailure(response.status, payload.error)); return; }
      showToast(`Synced. ${payload.changedItems ?? 0} item${payload.changedItems === 1 ? "" : "s"} changed since last time.`);
      await loadLibraries();
      await loadItems();
    } catch (cause) {
      // A cancelled sync is not a failure: the request stops being waited on,
      // and saying it "stopped" when the server may still be finishing would be
      // the wrong promise.
      if (cause instanceof Error && cause.name === "AbortError") showToast("Stopped waiting. The sync may still finish on the server.");
      else setFailure(classifyZoteroFailure(0, undefined));
    } finally { setBusy(""); }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      const response = await fetch("/api/connections/zotero", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      if (!response.ok) throw new Error();
      showToast("Zotero disconnected. Your imported sources are still here.");
      setConnected(false);
      setLibraries([]);
      setItems([]);
    } catch {
      showToast("Zotero could not be disconnected. Nothing was changed.");
    } finally { setBusy(""); setConfirmDisconnect(false); }
  }

  const setupDialog = (
    <ZoteroSetupDialog
      open={setupOpen}
      onOpenChange={setSetupOpen}
      onConnected={(username) => { showToast(`Connected to ${username}.`); void loadLibraries(); }}
    />
  );

  if (connected === false || (status === "error" && !libraries.length && failure?.action === "reconnect")) {
    return (
      <div className="zotero-browser">
        <EmptyState
          icon={<Library size={20} />}
          title={failure?.title ?? "Connect your Zotero library"}
          body={failure?.body ?? "Continuum reads your personal and group libraries so you can cite and search them, matches them against OpenAlex by DOI, and imports any item as a source. It never writes to Zotero unless you ask."}
          action={
            <>
              <Button variant="primary" size="sm" onClick={() => setSetupOpen(true)}>Connect Zotero</Button>
              <Button variant="secondary" size="sm" onClick={() => void loadLibraries()}>Retry</Button>
            </>
          }
        />
        {setupDialog}
      </div>
    );
  }

  return (
    <div className="zotero-browser">
      {failure && libraries.length ? (
        <Banner
          tone="warning"
          title={failure.title}
          action={failure.action === "reconnect"
            ? <Button variant="secondary" size="sm" onClick={() => setSetupOpen(true)}>Reconnect</Button>
            : <Button variant="secondary" size="sm" onClick={() => void loadItems()}>Retry</Button>}
        >
          {failure.body}
        </Banner>
      ) : null}

      <div className="library-toolbar">
        <Select value={libraryKey} onChange={(event) => setLibraryKey(event.target.value)} aria-label="Zotero library" disabled={busy === "libraries"}>
          {libraries.map((library) => (
            <option key={`${library.type}:${library.id}`} value={`${library.type}:${library.id}`}>
              {library.name}{library.type === "group" ? " · group" : ""}
            </option>
          ))}
        </Select>
        <form className="library-search" onSubmit={(event) => { event.preventDefault(); setStart(0); setSubmittedQuery(query.trim()); }}>
          <Search size={16} aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or creator" aria-label="Search Zotero" />
        </form>
        <LoadingButton variant="secondary" size="sm" loading={busy === "sync"} loadingLabel="Syncing…" onClick={() => void runSync()}>
          <RefreshCw size={14} aria-hidden="true" />Sync now
        </LoadingButton>
        {busy === "sync" ? <Button variant="quiet" size="sm" onClick={() => syncAbort.current?.abort()}>Cancel</Button> : null}
        <Menu
          label="Zotero connection actions"
          items={[
            { label: "Reconnect with a new key", onSelect: () => setSetupOpen(true) },
            { label: "Disconnect Zotero", onSelect: () => setConfirmDisconnect(true), destructive: true },
          ]}
          trigger={<IconButton label="Zotero connection actions" size={32}><MoreHorizontal size={16} /></IconButton>}
        />
      </div>

      <p className="library-count">
        {busy === "sync"
          ? "Syncing…"
          : lastSync?.last_sync_at
            ? `Synced ${relativeTime(lastSync.last_sync_at)} · ${total.toLocaleString()} item${total === 1 ? "" : "s"} in this view`
            : `${total.toLocaleString()} item${total === 1 ? "" : "s"} in this view · not yet synced`}
      </p>

      <div className="zotero-layout">
        <nav className="zotero-rail" aria-label="Zotero collections">
          <button type="button" className={!collectionKey ? "active" : ""} onClick={() => { setCollectionKey(""); setStart(0); }}>
            <Folder size={14} aria-hidden="true" />All items
          </button>
          {[...collections].sort((left, right) => left.name.localeCompare(right.name)).map((collection) => (
            <button
              key={collection.key}
              type="button"
              className={collectionKey === collection.key ? "active" : ""}
              style={{ paddingInlineStart: `calc(var(--s-3) + ${collectionDepth(collection, collectionMap) * 14}px)` }}
              onClick={() => { setCollectionKey(collection.key); setStart(0); }}
            >
              <Folder size={14} aria-hidden="true" />{collection.name}
            </button>
          ))}
        </nav>

        <div className="zotero-items">
          <DataRegion
            status={busy === "items" ? "loading" : failure && !items.length ? "error" : items.length ? "ready" : "empty"}
            loading={<LoadingState rows={6} label="Loading Zotero items" />}
            error={<ErrorState title={failure?.title ?? "Zotero could not be reached"} body={failure?.body} action={<Button variant="secondary" size="sm" onClick={() => void loadItems()}>Retry</Button>} />}
            empty={<EmptyState icon={<FileText size={20} />} title="No items in this view" body="Choose another collection, clear the search, or sync to pull in recent changes." />}
          >
            <ul className="list">
              {items.map((item) => {
                const actions: MenuItem[] = [
                  { label: "Import to Continuum", onSelect: () => void importItem(item) },
                  {
                    label: "Find in OpenAlex",
                    onSelect: () => { if (item.doi) onFindInOpenAlex?.(item.doi); },
                    disabled: !item.doi || !onFindInOpenAlex,
                    disabledReason: item.doi ? undefined : "This Zotero item has no DOI, so there is nothing to match against OpenAlex.",
                  },
                  {
                    label: "Open in Zotero",
                    onSelect: () => window.open(item.url ?? "https://www.zotero.org/mylibrary", "_blank", "noopener,noreferrer"),
                  },
                ];
                return (
                  <Row
                    key={item.key}
                    className="zotero-item-row"
                    density="comfortable"
                    selected={selected?.key === item.key}
                    onSelect={() => setSelected(item)}
                    leading={<FileText size={15} aria-hidden="true" />}
                    title={item.title}
                    meta={`${item.creators.map((creator) => creator.name).join(", ") || item.itemType}${item.date ? ` · ${item.date}` : ""}`}
                    trailing={
                      <span className="source-chips">
                        <StatusChip tone="neutral" label={item.itemType} />
                        {item.attachment?.availability === "stored_pdf" ? <StatusChip tone="success" label="PDF" /> : null}
                        {item.attachment?.availability === "local_file_unavailable" ? <StatusChip tone="warning" label="On your device only" /> : null}
                      </span>
                    }
                    actions={
                      <>
                        <LoadingButton variant="secondary" size="sm" loading={busy === `import:${item.key}`} loadingLabel="Importing…" onClick={() => void importItem(item)}>Import</LoadingButton>
                        <Menu label={`Actions for ${item.title}`} items={actions} trigger={<IconButton label={`Actions for ${item.title}`} size={28}><MoreHorizontal size={16} /></IconButton>} />
                      </>
                    }
                  />
                );
              })}
            </ul>
          </DataRegion>

          <div className="zotero-pagination">
            <Button variant="secondary" size="sm" disabled={start === 0 || Boolean(busy)} onClick={() => setStart(Math.max(0, start - pageSize))}>
              <ChevronLeft size={14} aria-hidden="true" />Previous
            </Button>
            <span>{total ? `${start + 1}–${Math.min(total, start + pageSize)} of ${total.toLocaleString()}` : "0 items"}</span>
            <Button variant="secondary" size="sm" disabled={start + pageSize >= total || Boolean(busy)} onClick={() => setStart(start + pageSize)}>
              Next<ChevronRight size={14} aria-hidden="true" />
            </Button>
          </div>
        </div>

        <aside className="zotero-detail">
          {selected ? (
            <>
              <StatusChip tone="neutral" label={selected.itemType} />
              <h2>{selected.title}</h2>
              <p>{selected.creators.map((creator) => creator.name).join(", ") || "No creators recorded"}</p>
              <dl className="library-facts">
                {selected.publicationTitle ? <div><dt>Publication</dt><dd>{selected.publicationTitle}</dd></div> : null}
                {selected.date ? <div><dt>Date</dt><dd>{selected.date}</dd></div> : null}
                {selected.doi ? <div><dt>DOI</dt><dd>{selected.doi}</dd></div> : null}
              </dl>
              {selected.abstract ? <section><h3>Abstract</h3><p>{selected.abstract}</p></section> : null}
              <div className="library-detail-actions">
                <LoadingButton variant="primary" size="sm" loading={busy === `import:${selected.key}`} loadingLabel="Importing…" onClick={() => void importItem(selected)}>Import to Continuum</LoadingButton>
                {selected.doi && onFindInOpenAlex ? <Button variant="secondary" size="sm" onClick={() => onFindInOpenAlex(selected.doi!)}><Telescope size={14} aria-hidden="true" />Find in OpenAlex</Button> : null}
                {selected.url ? <a className="button button-secondary button-sm" href={selected.url} target="_blank" rel="noreferrer">Open in Zotero<ExternalLink size={13} aria-hidden="true" /></a> : null}
              </div>
            </>
          ) : (
            <EmptyState icon={<FileText size={20} />} title="Nothing selected" body="Choose an item to read its metadata and import it." />
          )}
        </aside>
      </div>

      <ConfirmationDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect Zotero?"
        description="Your imported sources stay in Continuum. Continuum stops reading your Zotero library."
        confirmLabel="Disconnect"
        destructive
        busy={busy === "disconnect"}
        onConfirm={() => void disconnect()}
      />
      {setupDialog}
    </div>
  );
}
