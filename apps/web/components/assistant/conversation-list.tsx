"use client";

import { Archive, ArchiveRestore, Check, ChevronLeft, Edit3, LoaderCircle, MessageCircle, MoreHorizontal, Pin, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Menu } from "@/components/ui";
import type { AssistantSession } from "./types";
import { useAssistant } from "./use-assistant";

/** "just now" / "2h ago" / "12 Mar" — enough to tell two threads apart. */
function relativeTime(iso?: string) {
  if (!iso) return "No messages yet";
  const elapsed = Date.now() - Date.parse(iso);
  if (!Number.isFinite(elapsed)) return "";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** The memory summary's first clause, which is what makes a list of similarly
 *  named threads distinguishable at a glance. */
function firstClause(summary?: string) {
  if (!summary) return "";
  const clause = summary.replace(/\s+/g, " ").split(/[.;]/)[0]?.trim() ?? "";
  return clause.length > 60 ? `${clause.slice(0, 59)}…` : clause;
}

export function ConversationList({ onCollapse, onRename, onDelete }: {
  onCollapse?: () => void;
  onRename: (session: AssistantSession) => void;
  onDelete: (session: AssistantSession) => void;
}) {
  const assistant = useAssistant();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const visible = assistant.sessions.filter((session) => {
    const matches = !search.trim() || session.title.toLowerCase().includes(search.trim().toLowerCase());
    return matches && (showArchived ? Boolean(session.archived) : !session.archived);
  });
  const pinned = visible.filter((session) => session.pinned);

  const grouped = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const buckets: Array<{ label: string; sessions: AssistantSession[] }> = [
      { label: "Today", sessions: [] },
      { label: "This week", sessions: [] },
      { label: "Earlier", sessions: [] },
    ];
    for (const session of visible.filter((entry) => !entry.pinned)) {
      const at = session.lastMessageAt ? Date.parse(session.lastMessageAt) : 0;
      const bucket = at >= startOfToday.getTime() ? 0 : now - at < 7 * 24 * 3_600_000 ? 1 : 2;
      buckets[bucket]!.sessions.push(session);
    }
    return buckets.filter((bucket) => bucket.sessions.length);
  }, [visible]);

  /**
   * Four permanently visible icon buttons per row (C14) made a scannable list
   * into a wall of controls. They collapse into one `⋯` that appears on hover
   * or keyboard focus — the menu is always reachable, just not always shouting.
   */
  const row = (session: AssistantSession) => (
    <div className={`assistant-session-row ${assistant.activeId === session.id ? "active" : ""}`} key={session.id}>
      <button className="assistant-session-open" onClick={() => assistant.setActiveId(session.id)}>
        <MessageCircle size={15} aria-hidden="true" />
        <span>
          <strong>{session.title}</strong>
          <small>{relativeTime(session.lastMessageAt)}{firstClause(session.summary) ? ` · ${firstClause(session.summary)}` : ""}</small>
        </span>
        {session.obsidianSync?.status === "synced"
          ? <Check size={13} aria-label="Synced to Obsidian" />
          : session.obsidianSync ? <LoaderCircle size={13} aria-label={`Obsidian ${session.obsidianSync.status}`} /> : null}
      </button>
      <Menu
        label={`Actions for ${session.title}`}
        trigger={<button className="assistant-session-overflow" aria-label={`More actions for ${session.title}`}><MoreHorizontal size={14} /></button>}
        items={[
          { label: session.pinned ? "Unpin" : "Pin", icon: <Pin size={14} />, onSelect: () => void assistant.updateSession(session.id, { pinned: !session.pinned }) },
          { label: "Rename", icon: <Edit3 size={14} />, onSelect: () => onRename(session) },
          { label: session.archived ? "Restore" : "Archive", icon: session.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />, onSelect: () => void assistant.updateSession(session.id, { archived: !session.archived }) },
          { label: "Delete", icon: <Trash2 size={14} />, destructive: true, onSelect: () => onDelete(session) },
        ]}
      />
    </div>
  );

  return (
    <aside className="assistant-history" aria-label="Assistant conversations">
      <div className="assistant-history-head">
        <strong>Conversations</strong>
        <span>
          <button onClick={assistant.newConversation} aria-label="New conversation"><Plus size={16} /></button>
          {onCollapse ? <button onClick={onCollapse} aria-label="Collapse conversation sidebar"><ChevronLeft size={16} /></button> : null}
        </span>
      </div>
      <label className="assistant-history-search">
        <Search size={14} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" />
      </label>
      <nav>
        {pinned.length ? <><small className="assistant-history-label">Pinned</small>{pinned.map(row)}</> : null}
        {showArchived
          ? <><small className="assistant-history-label">Archived</small>{visible.filter((session) => !session.pinned).map(row)}</>
          : grouped.map((bucket) => <div key={bucket.label}><small className="assistant-history-label">{bucket.label}</small>{bucket.sessions.map(row)}</div>)}
        {!visible.length ? <p>{search ? "No matching conversations." : "Your conversations will appear here after you start."}</p> : null}
      </nav>
      <button className="assistant-archive-toggle" onClick={() => setShowArchived((shown) => !shown)}>
        {showArchived ? <MessageCircle size={14} /> : <Archive size={14} />}
        {showArchived ? "Back to active" : "Archived conversations"}
      </button>
    </aside>
  );
}
