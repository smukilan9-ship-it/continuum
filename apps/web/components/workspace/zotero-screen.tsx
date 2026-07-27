"use client";

import { ChevronLeft, ChevronRight, ExternalLink, FileQuestion, FileText, Folder, LoaderCircle, RefreshCw, Save, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { PageIntro } from "./page-intro";

type Library = {
  type: "user" | "group";
  id: string;
  name: string;
  permissions: { library: boolean; files: boolean; write: boolean };
};
type Collection = { key: string; name: string; parentCollectionKey?: string; version: number };
type Item = {
  key: string;
  version: number;
  itemType: string;
  title: string;
  abstract: string;
  doi?: string;
  url?: string;
  parentItemKey?: string;
  creators: Array<{ name: string; creatorType?: string }>;
  date?: string;
  publicationTitle?: string;
  attachment?: {
    linkMode?: string;
    contentType?: string;
    filename?: string;
    url?: string;
    availability: "local_file_unavailable" | "external_url" | "stored_pdf" | "stored_file";
  };
};

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

export function ZoteroScreen({ showToast }: { showToast: (message: string | null) => void }) {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [libraryKey, setLibraryKey] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionKey, setCollectionKey] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [children, setChildren] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Item>();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [start, setStart] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const pageSize = 30;
  const selectedLibrary = libraries.find((library) => `${library.type}:${library.id}` === libraryKey);

  const loadLibraries = useCallback(async () => {
    setBusy("libraries");
    setError("");
    try {
      const response = await fetch("/api/connections/zotero?resource=libraries", { cache: "no-store" });
      const payload = await response.json() as { libraries?: Library[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Zotero libraries are unavailable.");
      setLibraries(payload.libraries ?? []);
      setLibraryKey((current) => current || (payload.libraries?.[0] ? `${payload.libraries[0].type}:${payload.libraries[0].id}` : ""));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Zotero libraries are unavailable.");
    } finally { setBusy(""); }
  }, []);

  useEffect(() => { void loadLibraries(); }, [loadLibraries]);

  useEffect(() => {
    if (!selectedLibrary) return;
    setCollectionKey("");
    setStart(0);
    setSelected(undefined);
    setBusy("collections");
    const parameters = new URLSearchParams({ resource: "collections", libraryType: selectedLibrary.type, libraryId: selectedLibrary.id });
    void fetch(`/api/connections/zotero?${parameters}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { collections?: Collection[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Collections are unavailable.");
        setCollections(payload.collections ?? []);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Collections are unavailable."))
      .finally(() => setBusy(""));
  }, [selectedLibrary]);

  const loadItems = useCallback(async () => {
    if (!selectedLibrary) return;
    setBusy("items");
    setError("");
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
      if (!response.ok) throw new Error(payload.error ?? "Items are unavailable.");
      setItems(payload.items ?? []);
      setTotal(payload.total ?? 0);
      setSelected((current) => current && payload.items?.some((item) => item.key === current.key) ? current : payload.items?.[0]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Items are unavailable.");
    } finally { setBusy(""); }
  }, [collectionKey, selectedLibrary, start, submittedQuery]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  useEffect(() => {
    if (!selected || !selectedLibrary) { setChildren([]); return; }
    const parameters = new URLSearchParams({
      resource: "items",
      libraryType: selectedLibrary.type,
      libraryId: selectedLibrary.id,
      parentItemKey: selected.key,
      limit: "100",
    });
    void fetch(`/api/connections/zotero?${parameters}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((payload: { items?: Item[] }) => setChildren(payload.items ?? []));
  }, [selected, selectedLibrary]);

  const collectionMap = useMemo(() => new Map(collections.map((collection) => [collection.key, collection])), [collections]);
  const currentCollection = collectionMap.get(collectionKey);
  const breadcrumb = useMemo(() => {
    const result: Collection[] = [];
    let cursor = currentCollection;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.key)) {
      seen.add(cursor.key);
      result.unshift(cursor);
      cursor = cursor.parentCollectionKey ? collectionMap.get(cursor.parentCollectionKey) : undefined;
    }
    return result;
  }, [collectionMap, currentCollection]);

  async function saveSelected() {
    if (!selected || !selectedLibrary) return;
    setBusy("save");
    try {
      const response = await fetch("/api/connections/zotero", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save_item", libraryType: selectedLibrary.type, libraryId: selectedLibrary.id, itemKey: selected.key }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The item could not be saved.");
      showToast("Saved to Continuum Research and retrieval.");
    } catch (cause) { showToast(cause instanceof Error ? cause.message : "The item could not be saved."); }
    finally { setBusy(""); }
  }

  return (
    <div className="page-stack zotero-browser">
      <PageIntro eyebrow="CONNECTED LIBRARY" title="Zotero" description="Browse personal and group libraries, inspect attachments, and save selected sources into Continuum research." />
      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}
      <Card className="zotero-toolbar">
        <label>Library<select value={libraryKey} onChange={(event) => setLibraryKey(event.target.value)} disabled={busy === "libraries"}>{libraries.map((library) => <option key={`${library.type}:${library.id}`} value={`${library.type}:${library.id}`}>{library.name} · {library.type}</option>)}</select></label>
        <form onSubmit={(event) => { event.preventDefault(); setStart(0); setSubmittedQuery(query.trim()); }}>
          <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or creator" aria-label="Search Zotero" /></label>
          <Button className="button-primary" type="submit">Search</Button>
        </form>
        <Button className="button-secondary" disabled={Boolean(busy)} onClick={() => void loadItems()}>{busy ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}Refresh</Button>
      </Card>
      <div className="zotero-layout">
        <Card className="zotero-collections">
          <button className={!collectionKey ? "active" : ""} onClick={() => { setCollectionKey(""); setStart(0); }}><Folder size={15} />All items</button>
          {collections.sort((left, right) => left.name.localeCompare(right.name)).map((collection) => <button key={collection.key} className={collectionKey === collection.key ? "active" : ""} style={{ paddingInlineStart: `${12 + collectionDepth(collection, collectionMap) * 16}px` }} onClick={() => { setCollectionKey(collection.key); setStart(0); }}><Folder size={14} />{collection.name}</button>)}
        </Card>
        <Card className="zotero-items">
          <div className="zotero-breadcrumb"><button onClick={() => setCollectionKey("")}>{selectedLibrary?.name ?? "Library"}</button>{breadcrumb.map((collection) => <span key={collection.key}>/ <button onClick={() => setCollectionKey(collection.key)}>{collection.name}</button></span>)}</div>
          <div className="zotero-result-count">{total} result{total === 1 ? "" : "s"}</div>
          {busy === "items" ? <div className="screen-loading"><span /><span /><span /></div> : items.length ? items.map((item) => <button key={item.key} className={selected?.key === item.key ? "zotero-item active" : "zotero-item"} onClick={() => setSelected(item)}><FileText size={16} /><span><strong>{item.title}</strong><small>{item.creators.map((creator) => creator.name).join(", ") || item.itemType}{item.date ? ` · ${item.date}` : ""}</small></span></button>) : <div className="empty-state"><FileQuestion size={24} /><p>No Zotero items match this view.</p></div>}
          <div className="pagination"><Button className="button-secondary" disabled={start === 0 || Boolean(busy)} onClick={() => setStart(Math.max(0, start - pageSize))}><ChevronLeft size={15} />Previous</Button><span>{total ? `${start + 1}–${Math.min(total, start + pageSize)} of ${total}` : "0 results"}</span><Button className="button-secondary" disabled={start + pageSize >= total || Boolean(busy)} onClick={() => setStart(start + pageSize)}>Next<ChevronRight size={15} /></Button></div>
        </Card>
        <Card className="zotero-detail">
          {selected ? <>
            <div><Badge tone="neutral">{selected.itemType}</Badge><h2>{selected.title}</h2><p>{selected.creators.map((creator) => creator.name).join(", ")}</p></div>
            <dl>{selected.publicationTitle ? <><dt>Publication</dt><dd>{selected.publicationTitle}</dd></> : null}{selected.date ? <><dt>Date</dt><dd>{selected.date}</dd></> : null}{selected.doi ? <><dt>DOI</dt><dd>{selected.doi}</dd></> : null}</dl>
            {selected.abstract ? <section><h3>Abstract</h3><p>{selected.abstract}</p></section> : null}
            <div className="connection-actions"><Button className="button-primary" disabled={busy === "save"} onClick={() => void saveSelected()}>{busy === "save" ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}Save to Research</Button>{selected.url ? <a className="button button-secondary" href={selected.url} target="_blank" rel="noreferrer">Open source<ExternalLink size={13} /></a> : null}</div>
            <section><h3>Attachments & notes</h3>{children.length ? children.map((child) => <article className="zotero-attachment" key={child.key}><FileText size={15} /><span><strong>{child.title}</strong><small>{child.itemType}</small></span>{child.attachment?.availability === "stored_pdf" && selectedLibrary ? <a className="button button-secondary" target="_blank" rel="noreferrer" href={`/api/connections/zotero?${new URLSearchParams({ resource: "attachment", libraryType: selectedLibrary.type, libraryId: selectedLibrary.id, itemKey: child.key })}`}>Open PDF</a> : child.attachment?.availability === "external_url" && child.attachment.url ? <a className="button button-secondary" target="_blank" rel="noreferrer" href={child.attachment.url}>Open link<ExternalLink size={12} /></a> : child.attachment?.availability === "local_file_unavailable" ? <Badge tone="neutral">Available only on your Zotero device</Badge> : null}</article>) : <p>No child attachments or notes.</p>}</section>
          </> : <div className="empty-state"><FileText size={25} /><p>Select an item to inspect it.</p></div>}
        </Card>
      </div>
    </div>
  );
}
