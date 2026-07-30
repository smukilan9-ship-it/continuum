"use client";

import { ArrowUp, KeyRound, LoaderCircle, Paperclip, Plus, Search, Square, UploadCloud, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button, ContextChip, Menu, Modal, Select } from "@/components/ui";
import { searchKindSection, type SearchHit } from "@/lib/workspace-routes";
import { chipKind, type AssistantMode, type ComposerChip } from "./types";
import { useAssistant } from "./use-assistant";

const ACCEPTED = ".pdf,.docx,.txt,.md,.markdown,.csv,.json,.yaml,.yml,.tex,.py,.js,.jsx,.ts,.tsx,.java,.c,.cpp,.h,.hpp,.rs,.go,.rb,.php,.swift,.kt,.sql,.html,.css,.png,.jpg,.jpeg,.webp";

const MODE_LABEL: Record<AssistantMode, string> = {
  auto: "Auto",
  fast: "Fast",
  deep: "Deep",
};

/** The kinds the `+` picker offers (§11.6). */
const PIN_KINDS = ["goal", "project", "source", "concept", "conversation"] as const;

/**
 * §11.6: the composer's control row *is* the context UI. The ten scope
 * checkboxes are gone — the classifier decides reach, and the chips make that
 * reach visible and adjustable (AC-A8: zero checkboxes).
 */
export function Composer({ compact = false }: { compact?: boolean }) {
  const assistant = useAssistant();
  const [dragging, setDragging] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // §11.4: the destination is chosen before the file is read, so nothing joins
  // the Library by accident (S12).
  const retentionRef = useRef<"library" | "session">("session");

  const attachments = assistant.chips.filter((chip) => chip.origin === "attachment");
  const canSend = Boolean(assistant.draft.trim()) || attachments.some((chip) => chip.state === "ready");

  /**
   * Auto-grow 1 → 8 rows, then scroll.
   *
   * `scrollHeight` reports the *box* when the element is stretched or has a
   * min-height, so measuring naively latched the composer open at whatever the
   * first layout happened to be — eight rows tall on a first paint where the
   * co-located stylesheet had not applied yet. Both constraints are lifted for
   * the duration of the measurement, and it runs after a frame so the styles
   * that decide the real line height are in.
   */
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    const measure = () => {
      node.style.height = "auto";
      node.style.minHeight = "0px";
      const line = Number.parseFloat(getComputedStyle(node).lineHeight) || 20;
      const content = node.scrollHeight;
      node.style.minHeight = "";
      node.style.height = `${Math.min(content, Math.round(line * 8))}px`;
    };
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [assistant.draft]);

  const upload = useCallback(async (files: File[], retention: "library" | "session") => {
    const room = Math.max(0, 12 - attachments.length);
    for (const file of files.slice(0, room)) {
      const temporaryId = `upload_${crypto.randomUUID()}`;
      assistant.addChip({ id: temporaryId, kind: "file", label: file.name, origin: "attachment", state: "extracting", retention });
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("retention", retention);
        const response = await fetch("/api/sources", { method: "POST", body: form });
        const payload = await response.json() as { source?: { id?: string; title?: string }; duplicate?: boolean; error?: string };
        if (!response.ok || !payload.source?.id) throw new Error(payload.error ?? "Attachment could not be extracted");
        assistant.removeChip(temporaryId);
        assistant.addChip({
          id: payload.source.id,
          kind: "file",
          label: payload.source.title ?? file.name,
          origin: "attachment",
          state: "ready",
          retention,
          message: retention === "session" ? "Attached · not saved to Library" : payload.duplicate ? "Already in your Library" : "Added to your Library",
        });
      } catch (cause) {
        assistant.updateChip(temporaryId, { state: "error", message: cause instanceof Error ? cause.message : "Extraction failed" });
      }
    }
  }, [assistant, attachments.length]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void assistant.send(assistant.draft);
  }

  return (
    <form
      className={`assistant-composer ${dragging ? "dragging" : ""} ${compact ? "compact" : ""}`}
      onSubmit={submit}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(Array.from(event.dataTransfer.files), retentionRef.current); }}
    >
      <input
        ref={fileRef}
        className="sr-only"
        aria-label="Attach files to this conversation"
        type="file"
        multiple
        accept={ACCEPTED}
        onChange={(event) => { void upload(Array.from(event.target.files ?? []), retentionRef.current); event.target.value = ""; }}
      />

      {attachments.length ? (
        <div className="assistant-attachment-tray">
          {attachments.map((chip) => (
            <div className={`assistant-attachment ${chip.state}`} key={chip.id}>
              {chip.state === "extracting" ? <LoaderCircle className="spin" size={14} /> : chip.state === "error" ? <X size={14} /> : <Paperclip size={14} />}
              <span>
                <strong>{chip.label}</strong>
                <small>{chip.state === "extracting" ? "Reading…" : chip.message ?? ""}</small>
              </span>
              {chip.state === "error" ? <button type="button" onClick={() => { assistant.removeChip(chip.id); fileRef.current?.click(); }}>Retry</button> : null}
              <button type="button" onClick={() => assistant.removeChip(chip.id)} aria-label={`Remove ${chip.label}`}><X size={13} /></button>
            </div>
          ))}
        </div>
      ) : null}

      {dragging ? <div className="assistant-drop-hint"><UploadCloud size={20} />Drop files to attach</div> : null}

      <textarea
        ref={textareaRef}
        value={assistant.draft}
        onChange={(event) => assistant.setDraft(event.target.value)}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.files);
          if (files.length) { event.preventDefault(); void upload(files, retentionRef.current); }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (canSend) void assistant.send(assistant.draft);
            return;
          }
          // §11.2: `↑` in an empty composer edits the last message you sent.
          if (event.key === "ArrowUp" && !assistant.draft) {
            const last = [...assistant.messages].reverse().find((message) => message.role === "user");
            if (last) { event.preventDefault(); assistant.setDraft(last.content); }
          }
        }}
        placeholder="Ask about your learning, code, research, notes, or plan…"
        maxLength={12_000}
        rows={1}
        aria-label="Message Continuum"
      />

      <Menu
        label="Attachment destination"
        align="start"
        trigger={<Button type="button" className="assistant-attach" aria-label="Attach files"><Paperclip size={16} /></Button>}
        items={[
          { label: "Use in this message only", onSelect: () => { retentionRef.current = "session"; fileRef.current?.click(); } },
          { label: "Add to my Library", onSelect: () => { retentionRef.current = "library"; fileRef.current?.click(); } },
        ]}
      />

      {assistant.busy
        ? <Button type="button" className="assistant-send stop" onClick={assistant.stop} aria-label="Stop response"><Square size={15} /></Button>
        /* `type="submit"`, explicitly. The Button primitive defaults to
           type="button", so without this the send control sits inside
           <form onSubmit={submit}> and never submits it — the most important
           button in the product, doing nothing on click. Enter still worked,
           which is why it went unnoticed. */
        : <Button type="submit" className="assistant-send" disabled={!canSend} aria-label="Send message"><ArrowUp size={17} /></Button>}

      <div className="assistant-composer-options">
        <div className="assistant-composer-chips">
          {assistant.chips.filter((chip) => chip.origin !== "attachment").map((chip) => (
            <ContextChip key={chip.id} kind={chip.kind} label={chip.label} onRemove={() => assistant.removeChip(chip.id)} />
          ))}
          <button type="button" className="assistant-chip-add" onClick={() => setPickerOpen(true)} aria-label="Add context to this message">
            <Plus size={13} aria-hidden="true" />
          </button>
        </div>

        <div className="assistant-composer-route">
          {assistant.hasPersonalKey ? (
            <span className="assistant-key-chip" title={`Requests are billed to your ${assistant.personalKeyProvider ?? "own"} account`}>
              <KeyRound size={12} aria-hidden="true" />Your key
            </span>
          ) : null}
          <Select
            aria-label="Response mode"
            value={assistant.mode}
            onChange={(event) => assistant.setMode(event.target.value as AssistantMode)}
          >
            <option value="auto">Auto — picks the right model per message</option>
            <option value="fast">Fast — quick answers, lighter reasoning</option>
            <option value="deep">Deep — slower, for hard problems (~20s)</option>
          </Select>
        </div>
      </div>

      <small className="assistant-composer-hint">
        {MODE_LABEL[assistant.mode]} · Enter to send · Shift+Enter for a new line
      </small>

      <ContextPicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={(chip) => { assistant.addChip(chip); setPickerOpen(false); }} />
    </form>
  );
}

/**
 * The `+` picker. It runs the same `GET /api/search` as `⌘K`, so pinning a
 * source or a conversation reaches every object the palette can reach rather
 * than only the ones a screen happened to have loaded.
 */
function ContextPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (chip: ComposerChip) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) { setQuery(""); setResults([]); return; }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) { setResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&kinds=${PIN_KINDS.join(",")}&limit=20`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { results?: SearchHit[] };
        setResults(payload.results ?? []);
      } catch { /* An aborted keystroke is not an error worth showing. */ } finally {
        setLoading(false);
      }
    }, 200);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [open, query]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, SearchHit[]>();
    for (const hit of results) {
      const section = searchKindSection[hit.kind];
      buckets.set(section, [...(buckets.get(section) ?? []), hit]);
    }
    return [...buckets.entries()];
  }, [results]);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add context" description="Pin a record so this conversation always considers it.">
      <div className="assistant-context-picker">
        <label className="assistant-context-search">
          <Search size={15} aria-hidden="true" />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search goals, projects, sources, concepts, conversations" />
        </label>
        {loading ? <p className="assistant-context-status"><LoaderCircle className="spin" size={14} />Searching…</p> : null}
        {!loading && query.trim().length >= 2 && !results.length ? <p className="assistant-context-status">No match for “{query}”.</p> : null}
        {grouped.map(([section, hits]) => (
          <div key={section}>
            <small>{section}</small>
            {hits.map((hit) => (
              <button
                key={`${hit.kind}:${hit.id}`}
                type="button"
                onClick={() => onPick({ id: hit.id, kind: chipKind(hit.kind), label: hit.title, origin: "pinned" })}
              >
                <strong>{hit.title}</strong>
                <span>{hit.context}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
