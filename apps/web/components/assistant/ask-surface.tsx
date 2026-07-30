"use client";

import { Archive, ChevronRight, Edit3, Save, MoreHorizontal, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, ConfirmationDialog, LoadingButton, Menu, Modal } from "@/components/ui";
import type { WorkspaceState } from "@/components/workspace/types";
import { AskThread } from "./ask-thread";
import { Composer } from "./composer";
import { ConversationList } from "./conversation-list";
import { MemoryReview } from "./memory-review";
import type { AssistantSession } from "./types";
import { useAssistant } from "./use-assistant";
import "./assistant.css";

/**
 * The full-page assistant (§11.2). The panel (§8.5) mounts `AskThread` and
 * `Composer` directly, so this file only adds what a page has and a panel does
 * not: the conversation list and the thread header.
 */
export function AskSurface({ state, showToast, onRefresh }: {
  state: WorkspaceState;
  showToast: (message: string | null) => void;
  onRefresh: () => Promise<void>;
}) {
  const assistant = useAssistant();
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState<AssistantSession>();
  const [confirming, setConfirming] = useState<AssistantSession>();
  const [memoryOpen, setMemoryOpen] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(max-width: 840px)").matches) setCollapsed(true);
  }, []);

  const active = assistant.active;
  // §11.2: "Save what matters" appears only once there is something to save.
  const exchanges = assistant.messages.filter((message) => message.role === "assistant").length;

  async function commitRename(session: AssistantSession, title: string) {
    if (!title.trim() || title.trim() === session.title) { setRenaming(undefined); return; }
    try { await assistant.updateSession(session.id, { title: title.trim() }); setRenaming(undefined); }
    catch (cause) { showToast(cause instanceof Error ? cause.message : "Conversation could not be renamed"); }
  }

  function exportConversation() {
    if (!active) return;
    const markdown = [
      `# ${active.title}`,
      "",
      ...assistant.messages.map((message) => `**${message.role === "user" ? "You" : "Continuum"}**\n\n${message.content}\n`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${active.title.replace(/[^\w -]+/g, "").trim() || "conversation"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={`screen assistant-screen ${collapsed ? "sidebar-collapsed" : ""}`}>
      <ConversationList
        onCollapse={() => setCollapsed(true)}
        onRename={setRenaming}
        onDelete={setConfirming}
      />
      {collapsed ? <button className="assistant-sidebar-expand" onClick={() => setCollapsed(false)} aria-label="Open conversation sidebar"><ChevronRight size={17} /></button> : null}

      <section className="assistant-workspace">
        <header className="assistant-topline">
          <div>
            {/* §19.1 wants exactly one `<h1>` per route, and on Ask the page's
                subject is the conversation — so the title carries it whether or
                not a thread is open. The empty-state heading below is an `<h2>`
                for the same reason. */}
            <h1 className="assistant-title-heading">
              {active ? (
                <button className="assistant-title" onClick={() => setRenaming(active)} aria-label={`Rename ${active.title}`}>
                  {active.title}
                </button>
              ) : "New conversation"}
            </h1>
            {active?.obsidianSync ? (
              <Badge tone={active.obsidianSync.status === "synced" ? "green" : active.obsidianSync.status === "conflict" ? "orange" : "neutral"}>
                Obsidian: {active.obsidianSync.status === "synced" ? "synced" : active.obsidianSync.status === "conflict" ? "needs review" : "pending"}
              </Badge>
            ) : null}
          </div>
          {active ? (
            <div>
              {exchanges >= 2 ? (
                <LoadingButton className="button-secondary" size="sm" loading={false} loadingLabel="Preparing…" onClick={() => setMemoryOpen(true)}>
                  <Save size={14} aria-hidden="true" />Save what matters
                </LoadingButton>
              ) : null}
              <Menu
                label="Conversation actions"
                trigger={<button className="icon-button" aria-label="More conversation actions"><MoreHorizontal size={16} /></button>}
                items={[
                  { label: "Rename", icon: <Edit3 size={14} />, onSelect: () => setRenaming(active) },
                  { label: "Export as Markdown", icon: <Archive size={14} />, onSelect: exportConversation },
                  { label: "Delete", icon: <Trash2 size={14} />, destructive: true, onSelect: () => setConfirming(active) },
                ]}
              />
            </div>
          ) : null}
        </header>

        <AskThread state={state} />
        <Composer />
      </section>

      <Modal
        open={Boolean(renaming)}
        onOpenChange={(open) => { if (!open) setRenaming(undefined); }}
        title="Rename conversation"
        description="A clear name makes a long list scannable."
      >
        {renaming ? (
          <form className="workspace-form" onSubmit={(event) => { event.preventDefault(); void commitRename(renaming, String(new FormData(event.currentTarget).get("title") ?? "")); }}>
            <label>Conversation name<input name="title" autoFocus maxLength={120} defaultValue={renaming.title} /></label>
            <div className="form-actions">
              <Button className="button-secondary" type="button" onClick={() => setRenaming(undefined)}>Cancel</Button>
              <Button className="button-primary" type="submit">Rename</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <ConfirmationDialog
        open={Boolean(confirming)}
        onOpenChange={(open) => { if (!open) setConfirming(undefined); }}
        title={confirming ? `Delete “${confirming.title}”?` : ""}
        description="The conversation and its saved memory are removed, and that memory is excluded from future retrieval. Your goals, tasks, and research are unaffected."
        confirmLabel="Delete conversation"
        destructive
        onConfirm={() => {
          const target = confirming;
          setConfirming(undefined);
          if (target) void assistant.deleteSession(target.id).then(() => showToast("Conversation deleted and excluded from memory.")).catch(() => showToast("Conversation could not be deleted"));
        }}
      />

      <MemoryReview open={memoryOpen} onOpenChange={setMemoryOpen} showToast={showToast} onSaved={onRefresh} />
    </div>
  );
}
