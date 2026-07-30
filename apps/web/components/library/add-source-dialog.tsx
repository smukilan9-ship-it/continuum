"use client";

import { FileUp, Library, Link2, Upload } from "lucide-react";
import { useMemo, useRef, useState, type DragEvent } from "react";
import {
  Banner,
  Button,
  Field,
  Input,
  LoadingButton,
  Modal,
  Select,
  StatusChip,
  Tabs,
} from "@/components/ui";
import type { NormalizedScholarlyWork } from "@/lib/scholarly";
import { normalizeDoi, unfiledDestination, type Destination, type LibrarySource } from "./types";

type Route = "upload" | "link" | "zotero";

const maxBytes = 10 * 1024 * 1024;

/**
 * One dialog, three routes (§13.3).
 *
 * The destination is chosen *here*, before anything is written, so a source
 * never lands somewhere the user has to go and correct. Duplicates are shown
 * before the save rather than announced by a toast afterwards (fixes feature
 * #63): a name collision is caught against the list already on screen, and a
 * content collision is reported by the server inside this dialog instead of
 * closing it and flashing a message the user cannot act on.
 */
export function AddSourceDialog({
  open,
  onOpenChange,
  destinations,
  defaultDestinationId,
  existing,
  zoteroConnected,
  onUploaded,
  onOpenExisting,
  onImportFromZotero,
  showToast,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destinations: Destination[];
  defaultDestinationId?: string;
  existing: LibrarySource[];
  zoteroConnected: boolean;
  onUploaded: () => void | Promise<void>;
  onOpenExisting: (source: LibrarySource) => void;
  onImportFromZotero: () => void;
  showToast: (message: string | null) => void;
}) {
  const [route, setRoute] = useState<Route>("upload");
  const [destinationId, setDestinationId] = useState(defaultDestinationId ?? unfiledDestination.id);
  const [file, setFile] = useState<File>();
  const [dragging, setDragging] = useState(false);
  const [link, setLink] = useState("");
  const [resolved, setResolved] = useState<NormalizedScholarlyWork>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState<{ source: LibrarySource; kind: "name" | "content" }>();
  const [overridden, setOverridden] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => (destinations.length ? destinations : [unfiledDestination]), [destinations]);
  const destination = options.find((entry) => entry.id === destinationId) ?? options[0] ?? unfiledDestination;

  function reset() {
    setFile(undefined);
    setLink("");
    setResolved(undefined);
    setError("");
    setDuplicate(undefined);
    setOverridden(false);
    setBusy("");
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  /** Catches the collision the user can see coming, before a byte is uploaded. */
  function checkByName(candidate: File) {
    const match = existing.find((source) => source.title.toLowerCase() === candidate.name.toLowerCase());
    if (match) setDuplicate({ source: match, kind: "name" });
    else setDuplicate(undefined);
  }

  function acceptFile(candidate: File | undefined) {
    setError("");
    setOverridden(false);
    if (!candidate) return;
    if (candidate.size > maxBytes) {
      setError("Files are limited to 10 MB. Split the document or upload the section you need.");
      setFile(undefined);
      return;
    }
    if (!candidate.size) {
      setError("That file is empty.");
      setFile(undefined);
      return;
    }
    setFile(candidate);
    checkByName(candidate);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  }

  async function upload() {
    if (!file) return;
    setBusy("upload");
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (destination.projectId) form.append("projectId", destination.projectId);
      const response = await fetch("/api/sources", { method: "POST", body: form });
      const payload = await response.json() as { duplicate?: boolean; source?: { id?: string; title?: string }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The source could not be added.");
      if (payload.duplicate && payload.source?.id) {
        // Identical content, not just an identical name. The server dedupes by
        // content hash, so there is no honest "add anyway" here — saying there
        // was would promise a second copy that will never exist.
        setDuplicate({
          source: {
            id: payload.source.id,
            title: payload.source.title ?? file.name,
            subtitle: "Already in your library",
            origin: "Upload",
            kind: "text",
            processingState: "ready",
            metadataOnly: false,
            hasPdf: false,
            // The duplicate is described from the upload response, which does
            // not report storage; the Library row for the real record does.
            hasOriginal: false,
          },
          kind: "content",
        });
        return;
      }
      showToast(`${file.name} added — processing.`);
      await onUploaded();
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The source could not be added.");
    } finally { setBusy(""); }
  }

  /** DOI or URL → real metadata, resolved before anything is written (§13.3). */
  async function resolveLink() {
    const value = link.trim();
    if (!value) return;
    setBusy("resolve");
    setError("");
    setResolved(undefined);
    setDuplicate(undefined);
    try {
      const doi = normalizeDoi(value);
      const looksLikeDoi = Boolean(doi && /^10\.\d{4,9}\//.test(doi));
      const parameters = new URLSearchParams({ q: looksLikeDoi ? doi! : value, mode: looksLikeDoi ? "doi" : "keywords", provider: "all" });
      const response = await fetch(`/api/research/discovery?${parameters}`, { cache: "no-store" });
      const payload = await response.json() as { results?: NormalizedScholarlyWork[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "That link could not be resolved.");
      const work = payload.results?.[0];
      if (!work) throw new Error("No record matched that DOI or link. Check it, or search for the title in Discover.");
      setResolved(work);
      const candidateDoi = normalizeDoi(work.doi);
      const match = existing.find((source) =>
        (candidateDoi && normalizeDoi(source.doi) === candidateDoi) || source.title.toLowerCase() === work.title.toLowerCase());
      if (match) setDuplicate({ source: match, kind: "name" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That link could not be resolved.");
    } finally { setBusy(""); }
  }

  async function saveResolved() {
    if (!resolved) return;
    setBusy("save");
    setError("");
    try {
      if (destination.projectId) {
        const response = await fetch("/api/research/discovery", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "save", projectId: destination.projectId, work: resolved }),
        });
        const payload = await response.json() as { error?: string; message?: string };
        if (!response.ok) throw new Error(payload.error ?? "The paper could not be saved.");
        showToast(payload.message ?? `Saved to ${destination.label}.`);
      } else {
        if (resolved.sourceProvider !== "openalex") {
          throw new Error("Crossref-only records need a project destination. Choose a project above, or find the work in Discover to save it unfiled.");
        }
        const response = await fetch("/api/openalex", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "save", kind: "works", id: resolved.providerId, title: resolved.title, metadata: resolved }),
        });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "The work could not be saved.");
        showToast("Saved to your library.");
      }
      await onUploaded();
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The record could not be saved.");
    } finally { setBusy(""); }
  }

  const blockedByDuplicate = Boolean(duplicate) && !overridden;

  return (
    <Modal
      open={open}
      onOpenChange={(next) => { if (!next) close(); else onOpenChange(true); }}
      title="Add a source"
      description="Upload a file, add one by DOI or link, or import from Zotero. You choose where it lands before it is saved."
      size="md"
      dirty={Boolean(file || link)}
      dirtyMessage="Discard this source?"
      footer={
        route === "upload" ? (
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <LoadingButton variant="primary" loading={busy === "upload"} disabled={!file || blockedByDuplicate} onClick={() => void upload()}>
              Add source
            </LoadingButton>
          </>
        ) : route === "link" ? (
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            {resolved
              ? <LoadingButton variant="primary" loading={busy === "save"} disabled={blockedByDuplicate} onClick={() => void saveResolved()}>Add source</LoadingButton>
              : <LoadingButton variant="primary" loading={busy === "resolve"} disabled={!link.trim()} onClick={() => void resolveLink()}>Look up</LoadingButton>}
          </>
        ) : (
          <Button variant="secondary" onClick={close}>Close</Button>
        )
      }
    >
      <Tabs
        label="How to add a source"
        value={route}
        onChange={(next) => { setRoute(next); setError(""); setDuplicate(undefined); }}
        options={[
          { value: "upload" as Route, label: "Upload a file" },
          { value: "link" as Route, label: "Add by link" },
          ...(zoteroConnected ? [{ value: "zotero" as Route, label: "Import from Zotero" }] : []),
        ]}
      />

      <div className="add-source-body">
        {route !== "zotero" ? (
          <Field label="Destination" hint="Where this source is filed. You can change it later from the source's ⋯ menu.">
            {({ id }) => (
              <Select id={id} value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
                {options.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.goalTitle ? `${entry.label} — ${entry.goalTitle}` : entry.label}</option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        {route === "upload" ? (
          <div
            className={dragging ? "add-source-drop dragging" : "add-source-drop"}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <Upload size={22} aria-hidden="true" />
            <p>{file ? file.name : "Drag a PDF, DOCX, Markdown or text file here"}</p>
            <small>Up to 10 MB. The text is extracted and indexed; the row appears immediately and shows Processing… until it is searchable.</small>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json,.png,.jpg,.jpeg,.webp,text/*,application/pdf"
              onChange={(event) => acceptFile(event.target.files?.[0])}
            />
            <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}><FileUp size={14} aria-hidden="true" />Choose a file</Button>
          </div>
        ) : null}

        {route === "link" ? (
          <Field label="DOI or URL" hint="Metadata is resolved from OpenAlex and Crossref before anything is saved.">
            {({ id }) => (
              <span className="add-source-link">
                <Link2 size={15} aria-hidden="true" />
                <Input id={id} value={link} onChange={(event) => { setLink(event.target.value); setResolved(undefined); setDuplicate(undefined); }} placeholder="10.1038/s41586-021-03819-2" />
              </span>
            )}
          </Field>
        ) : null}

        {route === "link" && resolved ? (
          <div className="add-source-preview">
            <strong>{resolved.title}</strong>
            <span>{resolved.authors.slice(0, 4).join(", ") || "Author metadata unavailable"}{resolved.year ? ` · ${resolved.year}` : ""}</span>
            <span className="add-source-preview-chips">
              <StatusChip tone="neutral" label={resolved.sourceProvider === "openalex" ? "OpenAlex" : "Crossref"} />
              <StatusChip tone={resolved.openAccess ? "success" : "neutral"} label={resolved.openAccess ? "Open access" : "Metadata only"} />
            </span>
          </div>
        ) : null}

        {route === "zotero" ? (
          <div className="add-source-zotero">
            <Library size={22} aria-hidden="true" />
            <p>Browse your connected libraries and import any item as a Continuum source.</p>
            <Button variant="primary" size="sm" onClick={() => { close(); onImportFromZotero(); }}>Open Zotero</Button>
          </div>
        ) : null}

        {duplicate ? (
          <Banner
            tone="warning"
            title={`You already have this: ${duplicate.source.title}`}
            action={
              <>
                <Button variant="secondary" size="sm" onClick={() => { const target = duplicate.source; close(); onOpenExisting(target); }}>Open existing</Button>
                {duplicate.kind === "name" ? <Button variant="quiet" size="sm" onClick={() => setOverridden(true)}>Add anyway</Button> : null}
              </>
            }
          >
            {duplicate.kind === "name"
              ? "A source with this name is already in your library. Adding it again is fine if the contents differ."
              : "This file's contents are already indexed, so adding it again would create nothing new."}
          </Banner>
        ) : null}

        {error ? <Banner tone="danger" title="That didn't work">{error}</Banner> : null}
      </div>
    </Modal>
  );
}
