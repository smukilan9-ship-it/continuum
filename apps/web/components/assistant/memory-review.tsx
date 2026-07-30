"use client";

import { Archive } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, LoadingButton, Modal } from "@/components/ui";
import { useAssistant } from "./use-assistant";

type MemoryDraft = {
  summary: string;
  decisions: string[];
  unresolvedQuestions: string[];
  createdTasks: string[];
  importantFacts: string[];
  linkedEntityIds: string[];
};

function lines(value: string) {
  return value.split("\n").map((item) => item.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
}

function ListField({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (value: string[]) => void; placeholder: string }) {
  return (
    <label>
      {label}
      <textarea value={value.join("\n")} onChange={(event) => onChange(lines(event.target.value))} placeholder={placeholder} />
      <small>One item per line</small>
    </label>
  );
}

/**
 * "Save what matters" (§11.2). Unchanged in behaviour from the version that
 * lived in the overflow menu — nothing becomes durable until the user saves,
 * and the raw transcript is opt-in — but it is now a primary action once a
 * conversation has something worth keeping.
 */
export function MemoryReview({ open, onOpenChange, showToast, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showToast: (message: string | null) => void;
  onSaved: () => Promise<void>;
}) {
  const assistant = useAssistant();
  const [memory, setMemory] = useState<MemoryDraft>();
  const [busy, setBusy] = useState(false);
  const [includeRawTranscript, setIncludeRawTranscript] = useState(false);
  const sessionId = assistant.active?.id;

  useEffect(() => {
    if (!open || !sessionId) { setMemory(undefined); return; }
    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "prepare_memory", sessionId }),
        });
        const payload = await response.json() as { memory?: MemoryDraft; error?: string; fallback?: boolean };
        if (!response.ok || !payload.memory) throw new Error(payload.error ?? "A memory proposal could not be prepared");
        if (cancelled) return;
        setMemory(payload.memory);
        setIncludeRawTranscript(false);
        if (payload.fallback) showToast("A private extractive summary was prepared because a model route was unavailable.");
      } catch (cause) {
        if (cancelled) return;
        showToast(cause instanceof Error ? cause.message : "A memory proposal could not be prepared");
        onOpenChange(false);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, sessionId, onOpenChange, showToast]);

  async function save() {
    if (!sessionId || !memory) return;
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save_memory", sessionId, includeRawTranscript, ...memory }),
      });
      const payload = await response.json() as { error?: string; obsidian?: { status?: string } };
      if (!response.ok) throw new Error(payload.error ?? "Session memory could not be saved");
      onOpenChange(false);
      await Promise.all([assistant.loadSession(sessionId), assistant.refreshSessions(), onSaved()]);
      showToast(payload.obsidian?.status === "unavailable"
        ? "Session memory saved. Obsidian is unavailable, so no vault write was queued."
        : "Session memory saved and queued for Obsidian. It will show as synced only after the vault acknowledges it.");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Session memory could not be saved");
    } finally {
      setBusy(false);
    }
  }

  async function exclude() {
    if (!sessionId) return;
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "exclude_memory", sessionId }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { showToast(payload.error ?? "Memory could not be excluded"); return; }
    onOpenChange(false);
    await assistant.loadSession(sessionId);
    showToast("This conversation remains in session history but is excluded from durable memory.");
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Save what matters"
      description="Nothing becomes durable until you save. Edit, remove, or exclude anything that should not return in future context."
      dirty={Boolean(memory)}
      dirtyMessage="Close without saving this memory proposal?"
    >
      {memory ? (
        <div className="assistant-memory-form">
          <label>Session summary<textarea value={memory.summary} onChange={(event) => setMemory((current) => current ? { ...current, summary: event.target.value } : current)} /></label>
          <div className="assistant-memory-grid">
            <ListField label="Decisions" value={memory.decisions} onChange={(value) => setMemory((current) => current ? { ...current, decisions: value } : current)} placeholder="Decisions worth remembering" />
            <ListField label="Next actions" value={memory.createdTasks} onChange={(value) => setMemory((current) => current ? { ...current, createdTasks: value } : current)} placeholder="Tasks created or agreed" />
            <ListField label="Unresolved questions" value={memory.unresolvedQuestions} onChange={(value) => setMemory((current) => current ? { ...current, unresolvedQuestions: value } : current)} placeholder="Open questions" />
            <ListField label="Important facts" value={memory.importantFacts} onChange={(value) => setMemory((current) => current ? { ...current, importantFacts: value } : current)} placeholder="Durable facts only" />
          </div>
          <p className="assistant-memory-note"><Archive size={15} />Raw chat is kept as session history. Future retrieval uses this compact memory, not the full transcript.</p>
          <label className="assistant-memory-transcript">
            <input type="checkbox" checked={includeRawTranscript} onChange={(event) => setIncludeRawTranscript(event.target.checked)} />
            Also include the raw transcript in the Obsidian note
          </label>
          <div className="modal-inline-actions">
            <Button className="button-quiet danger" onClick={() => void exclude()}>Exclude from memory</Button>
            <Button className="button-secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <LoadingButton className="button-primary" loading={busy} loadingLabel="Saving…" disabled={memory.summary.trim().length < 3} onClick={() => void save()}>Save memory</LoadingButton>
          </div>
        </div>
      ) : <p className="assistant-context-status">Preparing a memory proposal…</p>}
    </Modal>
  );
}
