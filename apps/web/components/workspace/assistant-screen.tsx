"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowUp,
  BookOpen,
  BrainCircuit,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Edit3,
  FileSearch,
  FolderKanban,
  KeyRound,
  LoaderCircle,
  MessageCircle,
  Paperclip,
  Pin,
  Plus,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Square,
  MoreHorizontal,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge, Button, ConfirmationDialog, LoadingButton, Modal } from "@/components/ui";
import { conceptLabel, formatLabel } from "@/lib/labels";
import { text, type WorkspaceState } from "./types";

type Toast = (message: string | null) => void;
type ContextScope = "conversation" | "selected_files" | "current_project" | "current_learning" | "research_library" | "zotero" | "obsidian" | "approved_memory" | "code_workspace" | "workspace";
type AssistantMode = "auto" | "fast" | "deep" | "coding" | "document";
type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  mode?: string;
  metadata?: {
    attachmentIds?: string[];
    contextScopes?: ContextScope[];
    usedContext?: Array<{ type: string; id: string; label: string }>;
    mode?: AssistantMode;
  };
};
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

type AssistantSession = {
  id: string;
  title: string;
  status: string;
  summary?: string;
  memoryExcluded?: boolean;
  pinned?: boolean;
  archived?: boolean;
  groupLabel?: string;
  contextSettings?: { contextScopes?: ContextScope[]; mode?: AssistantMode };
  lastMessageAt?: string;
  messages?: AssistantMessage[];
  obsidianSync?: {
    syncId: string;
    status: "pending" | "syncing" | "retry" | "conflict" | "synced";
    error?: string;
    acknowledgedAt?: string;
  };
};
type AssistantAttachment = { id: string; name: string; type: string; size: number; state: "extracting" | "ready" | "error"; message?: string };
type MemoryDraft = {
  summary: string;
  decisions: string[];
  unresolvedQuestions: string[];
  createdTasks: string[];
  importantFacts: string[];
  linkedEntityIds: string[];
};
type PersonalProvider = "featherless" | "groq" | "gemini";
type PersonalCredential = {
  provider: PersonalProvider;
  name: string;
  purpose: string;
  privacy: string;
  docs: string;
  status?: "connected" | "degraded" | "invalid";
  masked?: string;
  lastValidatedAt?: string;
  category?: "model" | "scholarly";
};

const welcomes = [
  "What are we working on today?",
  "Pick up where you left off.",
  "Learn, build, research, or organize—start anywhere.",
  "Your workspace is ready. What should we tackle?",
];

const contextOptions: Array<{ value: ContextScope; label: string; description: string }> = [
  { value: "conversation", label: "This conversation only", description: "Do not retrieve prior workspace records." },
  { value: "selected_files", label: "Selected files", description: "Use only files attached to this message." },
  { value: "current_project", label: "Current project", description: "Retrieve relevant project decisions, sources, and notes." },
  { value: "current_learning", label: "Current learning path", description: "Use relevant concepts, progress, and verified outcomes." },
  { value: "research_library", label: "Research library", description: "Search saved sources and research notes." },
  { value: "zotero", label: "Zotero", description: "Retrieve synchronized Zotero metadata when relevant." },
  { value: "obsidian", label: "Obsidian notes", description: "Retrieve synchronized vault notes when relevant." },
  { value: "approved_memory", label: "Approved memory", description: "Use only compact memories you previously approved." },
  { value: "code_workspace", label: "Code workspace", description: "Use saved code context when relevant." },
  { value: "workspace", label: "Scoped workspace retrieval", description: "Search across workspace records without sending the full workspace." },
];

function welcomeIndex(userId: string, serverNow: string) {
  return Array.from(`${userId}:${serverNow.slice(0, 16)}`).reduce((total, character) => total + character.charCodeAt(0), 0) % welcomes.length;
}

function starterActions(state: WorkspaceState) {
  const weak = state.learningStates.find((item) => ["misconception_detected", "decaying"].includes(text(item, "status")));
  const activeTask = state.tasks.find((item) => text(item, "status") !== "done");
  const project = state.projects[0];
  return [
    weak ? { icon: BrainCircuit, label: "Review my weak concepts", prompt: `Help me review ${conceptLabel(text(weak, "conceptId"), "my weakest concept")}. Start by checking what I remember.` } : { icon: BookOpen, label: "Start a learning session", prompt: "Help me choose one concept to learn next and check what I already know." },
    project ? { icon: FileSearch, label: "Summarize my latest research", prompt: `Summarize the current state of ${text(project, "title")}, separating evidence, decisions, and unresolved questions.` } : { icon: FileSearch, label: "Explore my research", prompt: "Help me decide what research question to work on next." },
    { icon: Code2, label: "Help debug my code", prompt: "Help me debug a coding problem. Ask for the language, exact code, and actual error before suggesting a fix." },
    activeTask ? { icon: FolderKanban, label: "Organize today’s work", prompt: `Help me make a realistic plan starting with “${text(activeTask, "title")}”. Use my current tasks and schedule.` } : { icon: FolderKanban, label: "Organize today’s work", prompt: "Help me identify one useful next action from my goals." },
  ];
}

function lines(value: string) {
  return value.split("\n").map((item) => item.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
}

function MemoryListField({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (value: string[]) => void; placeholder: string }) {
  return <label>{label}<textarea value={value.join("\n")} onChange={(event) => onChange(lines(event.target.value))} placeholder={placeholder} /><small>One item per line</small></label>;
}

export function AssistantScreen({ state, userId, serverNow, showToast, onRefresh }: { state: WorkspaceState; userId: string; serverNow: string; showToast: Toast; onRefresh: () => Promise<void> }) {
  const [sessions, setSessions] = useState<AssistantSession[]>(() => state.assistantSessions as AssistantSession[]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const [renameTarget, setRenameTarget] = useState<AssistantSession>();
  const [confirmRequest, setConfirmRequest] = useState<{ title: string; description: string; confirmLabel: string; run: () => void | Promise<void> }>();
  const [showArchived, setShowArchived] = useState(false);
  const [activeId, setActiveId] = useState(() => text(state.assistantSessions[0], "id"));
  const [active, setActive] = useState<AssistantSession>();
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState("");
  const [route, setRoute] = useState("Continuum Auto");
  const [credentialMode, setCredentialMode] = useState<"platform" | "user">("platform");
  const [assistantMode, setAssistantMode] = useState<AssistantMode>("auto");
  const [contextScopes, setContextScopes] = useState<ContextScope[]>(["approved_memory"]);
  const [contextOpen, setContextOpen] = useState(false);
  const [attachments, setAttachments] = useState<AssistantAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [credentialOpen, setCredentialOpen] = useState(false);
  const [credentialCatalog, setCredentialCatalog] = useState<PersonalCredential[]>([]);
  const [configuredCredentials, setConfiguredCredentials] = useState<PersonalCredential[]>([]);
  const [credentialProvider, setCredentialProvider] = useState<PersonalProvider>("gemini");
  const [credentialSecret, setCredentialSecret] = useState("");
  const [credentialPassword, setCredentialPassword] = useState("");
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memory, setMemory] = useState<MemoryDraft>();
  const [includeRawTranscript, setIncludeRawTranscript] = useState(false);
  const loadSequenceRef = useRef(0);
  const skipNextActiveLoadRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const welcome = welcomes[welcomeIndex(userId, serverNow)]!;
  const starters = useMemo(() => starterActions(state), [state]);
  const messages = active?.messages ?? [];
  const hasPersonalCredential = configuredCredentials.some((credential) => credential.status === "connected");
  const visibleSessions = sessions.filter((session) => {
    const matches = !sessionSearch.trim() || session.title.toLowerCase().includes(sessionSearch.trim().toLowerCase());
    return matches && (showArchived ? Boolean(session.archived) : !session.archived);
  });
  const pinnedSessions = visibleSessions.filter((session) => session.pinned);
  // Grouped by recency so a long list stays scannable; a bare reverse-chronological
  // run of identical-looking titles is what made this list unusable.
  const groupedSessions = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const buckets: Array<{ label: string; sessions: AssistantSession[] }> = [
      { label: "Today", sessions: [] },
      { label: "This week", sessions: [] },
      { label: "Earlier", sessions: [] },
    ];
    for (const session of visibleSessions.filter((entry) => !entry.pinned)) {
      const at = session.lastMessageAt ? Date.parse(session.lastMessageAt) : 0;
      const bucket = at >= startOfToday.getTime() ? 0 : now - at < 7 * 24 * 3600_000 ? 1 : 2;
      buckets[bucket]!.sessions.push(session);
    }
    return buckets.filter((bucket) => bucket.sessions.length);
  }, [visibleSessions]);

  const refreshCredentials = useCallback(async () => {
    const response = await fetch("/api/integrations/credentials", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { providers?: PersonalCredential[]; configured?: PersonalCredential[] };
    setCredentialCatalog((payload.providers ?? []).filter((credential) => credential.category === "model"));
    setConfiguredCredentials((payload.configured ?? []).filter((credential) => credential.category === "model"));
  }, []);

  const refreshSessions = useCallback(async () => {
    const response = await fetch("/api/assistant", { cache: "no-store" });
    const payload = await response.json() as { sessions?: AssistantSession[]; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Conversations are unavailable");
    setSessions(payload.sessions ?? []);
  }, []);

  // `silent` reconciles the session in the background without flashing the
  // loading state — used after a streamed reply is already on screen.
  const loadSession = useCallback(async (sessionId: string, silent = false) => {
    const sequence = ++loadSequenceRef.current;
    if (!sessionId) { setActive(undefined); setLoadingSession(false); return; }
    if (!silent) {
      setLoadingSession(true);
      setError("");
    }
    try {
      const response = await fetch(`/api/assistant?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      const payload = await response.json() as { session?: AssistantSession; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error ?? "Conversation could not be opened");
      if (sequence !== loadSequenceRef.current) return;
      setActive(payload.session);
    } catch (cause) {
      if (sequence !== loadSequenceRef.current || silent) return;
      setError(cause instanceof Error ? cause.message : "Conversation could not be opened");
    } finally {
      if (sequence === loadSequenceRef.current && !silent) setLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    if (skipNextActiveLoadRef.current === activeId) {
      skipNextActiveLoadRef.current = undefined;
      return;
    }
    void loadSession(activeId);
  }, [activeId, loadSession]);

  useEffect(() => {
    void refreshCredentials();
  }, [refreshCredentials]);

  useEffect(() => {
    if (window.matchMedia("(max-width: 840px)").matches) setSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, live]);

  useEffect(() => {
    if (active?.contextSettings?.contextScopes?.length) setContextScopes(active.contextSettings.contextScopes);
    if (active?.contextSettings?.mode) setAssistantMode(active.contextSettings.mode);
  }, [active?.id, active?.contextSettings]);

  async function createSession() {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", title: "New conversation" }),
    });
    const payload = await response.json() as { session?: AssistantSession; error?: string };
    if (!response.ok || !payload.session) throw new Error(payload.error ?? "A conversation could not be created");
    loadSequenceRef.current += 1;
    setSessions((current) => [payload.session!, ...current]);
    setActive(payload.session);
    skipNextActiveLoadRef.current = payload.session.id;
    setActiveId(payload.session.id);
    return payload.session;
  }

  async function updateSession(sessionId: string, changes: Partial<Pick<AssistantSession, "title" | "pinned" | "archived" | "groupLabel">>) {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update_session", sessionId, ...changes }),
    });
    const payload = await response.json() as { session?: AssistantSession; error?: string };
    if (!response.ok || !payload.session) throw new Error(payload.error ?? "Conversation could not be updated");
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, ...payload.session } : session));
    setActive((current) => current?.id === sessionId ? { ...current, ...payload.session } : current);
  }

  async function uploadFiles(files: File[]) {
    const accepted = files.slice(0, Math.max(0, 12 - attachments.length));
    for (const file of accepted) {
      const temporaryId = `upload_${crypto.randomUUID()}`;
      setAttachments((current) => [...current, { id: temporaryId, name: file.name, type: file.type || "file", size: file.size, state: "extracting" }]);
      try {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/sources", { method: "POST", body: form });
        const payload = await response.json() as { source?: { id?: string; title?: string }; duplicate?: boolean; error?: string };
        if (!response.ok || !payload.source?.id) throw new Error(payload.error ?? "Attachment could not be extracted");
        setAttachments((current) => current.map((attachment) => attachment.id === temporaryId ? {
          id: payload.source!.id!,
          name: payload.source!.title ?? file.name,
          type: file.type || "file",
          size: file.size,
          state: "ready",
          message: payload.duplicate ? "Already indexed · retrieved when needed" : "Indexed · retrieved when needed",
        } : attachment));
        setContextScopes((current) => current.includes("selected_files") ? current : [...current.filter((scope) => scope !== "conversation"), "selected_files"]);
      } catch (cause) {
        setAttachments((current) => current.map((attachment) => attachment.id === temporaryId ? { ...attachment, state: "error", message: cause instanceof Error ? cause.message : "Extraction failed" } : attachment));
      }
    }
  }

  async function commitRename(session: AssistantSession, title: string) {
    if (!title.trim() || title.trim() === session.title) { setRenameTarget(undefined); return; }
    try { await updateSession(session.id, { title: title.trim() }); setRenameTarget(undefined); }
    catch (cause) { showToast(cause instanceof Error ? cause.message : "Conversation could not be renamed"); }
  }

  async function send(message: string) {
    const clean = message.trim();
    const readyAttachments = attachments.filter((attachment) => attachment.state === "ready");
    if ((!clean && !readyAttachments.length) || busy) return;
    const outgoing = clean || "Please analyze the attached material.";
    setBusy(true);
    setError("");
    setLive("");
    setRoute(credentialMode === "user" ? "My API key" : ({ auto: "Continuum Auto", fast: "Fast", deep: "Deep Reasoning", coding: "Coding", document: "Document Analysis" } as const)[assistantMode]);
    const controller = new AbortController();
    abortRef.current = controller;
    let session = active;
    try {
      if (!session) session = await createSession();
      const targetSession = session;
      loadSequenceRef.current += 1;
      setLoadingSession(false);
      const optimistic: AssistantMessage = {
        id: `optimistic_${crypto.randomUUID()}`,
        role: "user",
        content: outgoing,
        createdAt: new Date().toISOString(),
        metadata: { attachmentIds: readyAttachments.map((attachment) => attachment.id), contextScopes, mode: assistantMode },
      };
      setActive((current) => {
        const target = current?.id === targetSession.id ? current : targetSession;
        return { ...target, messages: [...(target.messages ?? []), optimistic] };
      });
      setDraft("");
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          action: "message",
          sessionId: targetSession.id,
          message: outgoing,
          credentialMode,
          mode: assistantMode,
          contextScopes,
          attachmentIds: readyAttachments.map((attachment) => attachment.id),
        }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? "The Assistant could not respond");
      }
      setRoute(response.headers.get("x-continuum-mode") ?? (credentialMode === "user" ? "My API key" : "Continuum Auto"));
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (value) {
          const part = decoder.decode(value, { stream: !done });
          answer += part;
          setLive(answer);
        }
        if (done) break;
      }
      // The turn is finished the moment the stream ends. Commit the streamed
      // text locally and release the composer immediately; re-reading the
      // session, the session list and the workspace are reconciliation steps,
      // and awaiting them in series used to blank the reply behind a spinner
      // for the length of three round-trips.
      if (answer.trim()) {
        const settled: AssistantMessage = {
          id: `streamed_${crypto.randomUUID()}`,
          role: "assistant",
          content: answer,
          createdAt: new Date().toISOString(),
          metadata: { mode: assistantMode },
        };
        setActive((current) => (current?.id === targetSession.id
          ? { ...current, messages: [...(current.messages ?? []), settled] }
          : current));
      }
      setAttachments([]);
      abortRef.current = undefined;
      setBusy(false);
      setLive("");
      void Promise.allSettled([loadSession(targetSession.id, true), refreshSessions(), onRefresh()]);
      return;
    } catch (cause) {
      if ((cause as { name?: string }).name !== "AbortError") setError(cause instanceof Error ? cause.message : "The Assistant stopped unexpectedly");
    } finally {
      abortRef.current = undefined;
      setBusy(false);
      setLive("");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await send(draft);
  }

  async function prepareMemory() {
    if (!active) return;
    setMemoryBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "prepare_memory", sessionId: active.id }),
      });
      const payload = await response.json() as { memory?: MemoryDraft; error?: string; fallback?: boolean };
      if (!response.ok || !payload.memory) throw new Error(payload.error ?? "A memory proposal could not be prepared");
      setMemory(payload.memory);
      setIncludeRawTranscript(false);
      setMemoryOpen(true);
      if (payload.fallback) showToast("A private extractive summary was prepared because a model route was unavailable.");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "A memory proposal could not be prepared");
    } finally {
      setMemoryBusy(false);
    }
  }

  async function saveMemory() {
    if (!active || !memory) return;
    setMemoryBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save_memory", sessionId: active.id, includeRawTranscript, ...memory }),
      });
      const payload = await response.json() as { error?: string; obsidian?: { status?: string } };
      if (!response.ok) throw new Error(payload.error ?? "Session memory could not be saved");
      setMemoryOpen(false);
      await Promise.all([loadSession(active.id), refreshSessions(), onRefresh()]);
      showToast(payload.obsidian?.status === "unavailable"
        ? "Session memory saved. Obsidian is unavailable, so no vault write was queued."
        : "Session memory saved and queued for Obsidian. It will show as synced only after the vault acknowledges it.");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Session memory could not be saved");
    } finally {
      setMemoryBusy(false);
    }
  }

  async function excludeMemory() {
    if (!active) return;
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "exclude_memory", sessionId: active.id }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { showToast(payload.error ?? "Memory could not be excluded"); return; }
    setMemoryOpen(false);
    await loadSession(active.id);
    showToast("This conversation remains in session history but is excluded from durable memory.");
  }

  function deleteSession(target = active) {
    if (!target) return;
    setConfirmRequest({
      title: `Delete “${target.title}”?`,
      description: "The conversation and its saved memory are removed, and that memory is excluded from future retrieval. Your goals, tasks, and research are unaffected.",
      confirmLabel: "Delete conversation",
      run: () => performDeleteSession(target),
    });
  }

  async function performDeleteSession(target: AssistantSession) {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", sessionId: target.id }),
    });
    if (!response.ok) { showToast("Conversation could not be deleted"); return; }
    const remaining = sessions.filter((session) => session.id !== target.id);
    setSessions(remaining);
    if (active?.id === target.id) {
      setActive(undefined);
      setActiveId(remaining.find((session) => !session.archived)?.id ?? "");
    }
    showToast("Conversation deleted and excluded from memory.");
  }

  function regenerateLast() {
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (lastUser) void send(lastUser.content);
  }

  async function savePersonalCredential(event: FormEvent) {
    event.preventDefault();
    setCredentialBusy(true);
    try {
      const existing = configuredCredentials.some((credential) => credential.provider === credentialProvider);
      const response = await fetch("/api/integrations/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "configure",
          provider: credentialProvider,
          secret: credentialSecret,
          ...(existing ? { currentPassword: credentialPassword } : {}),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The API key could not be saved");
      setCredentialSecret("");
      setCredentialPassword("");
      await refreshCredentials();
      setCredentialMode("user");
      setCredentialOpen(false);
      showToast("Your API key is encrypted and will be used only for Assistant requests you send in My API Key mode.");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "The API key could not be saved");
    } finally {
      setCredentialBusy(false);
    }
  }

  function deletePersonalCredential(provider: PersonalProvider) {
    if (!credentialPassword) {
      showToast("Enter your current Continuum password before deleting this key.");
      return;
    }
    setConfirmRequest({
      title: "Delete this Assistant API key?",
      description: "Continuum Auto keeps working. Only messages you explicitly send in My API Key mode use a personal key.",
      confirmLabel: "Delete API key",
      run: () => performDeleteCredential(provider),
    });
  }

  async function performDeleteCredential(provider: PersonalProvider) {
    setCredentialBusy(true);
    try {
      const response = await fetch("/api/integrations/credentials", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, currentPassword: credentialPassword }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The API key could not be deleted");
      setCredentialMode("platform");
      setCredentialPassword("");
      await refreshCredentials();
      showToast("Assistant API key deleted.");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "The API key could not be deleted");
    } finally {
      setCredentialBusy(false);
    }
  }

  const sessionRow = (session: AssistantSession) => <div className={`assistant-session-row ${activeId === session.id ? "active" : ""}`} key={session.id}>
    <button className="assistant-session-open" onClick={() => setActiveId(session.id)}>
      <MessageCircle size={15} aria-hidden="true" />
      <span>
        <strong>{session.title}</strong>
        <small>{relativeTime(session.lastMessageAt)}{session.summary ? ` · ${session.summary.replace(/\s+/g, " ").slice(0, 60)}` : ""}</small>
      </span>
      {session.obsidianSync?.status === "synced" ? <Check size={13} aria-label="Synced to Obsidian" /> : session.obsidianSync ? <LoaderCircle size={13} aria-label={`Obsidian ${session.obsidianSync.status}`} /> : null}
    </button>
    <div className="assistant-session-actions">
      <button onClick={() => void updateSession(session.id, { pinned: !session.pinned })} aria-label={session.pinned ? "Unpin conversation" : "Pin conversation"}><Pin size={12} /></button>
      <button onClick={() => setRenameTarget(session)} aria-label={`Rename ${session.title}`}><Edit3 size={12} /></button>
      <button onClick={() => void updateSession(session.id, { archived: !session.archived })} aria-label={session.archived ? "Restore conversation" : "Archive conversation"}>{session.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}</button>
      <button onClick={() => void deleteSession(session)} aria-label="Delete conversation"><Trash2 size={12} /></button>
    </div>
  </div>;

  return (
    <div className={`screen assistant-screen ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="assistant-history" aria-label="Assistant conversations">
        <div className="assistant-history-head"><strong>Conversations</strong><span><button onClick={() => { setActive(undefined); setActiveId(""); setError(""); }} aria-label="New conversation"><Plus size={16} /></button><button onClick={() => setSidebarCollapsed(true)} aria-label="Collapse conversation sidebar"><ChevronLeft size={16} /></button></span></div>
        <label className="assistant-history-search"><Search size={14} /><input value={sessionSearch} onChange={(event) => setSessionSearch(event.target.value)} placeholder="Search conversations" /></label>
        <nav>
          {pinnedSessions.length ? <><small className="assistant-history-label">Pinned</small>{pinnedSessions.map(sessionRow)}</> : null}
          {showArchived
            ? <><small className="assistant-history-label">Archived</small>{visibleSessions.filter((session) => !session.pinned).map(sessionRow)}</>
            : groupedSessions.map((bucket) => <div key={bucket.label}><small className="assistant-history-label">{bucket.label}</small>{bucket.sessions.map(sessionRow)}</div>)}
          {!visibleSessions.length ? <p>{sessionSearch ? "No matching conversations." : "Your conversations will appear here after you start."}</p> : null}
        </nav>
        <button className="assistant-archive-toggle" onClick={() => setShowArchived((shown) => !shown)}>{showArchived ? <MessageCircle size={14} /> : <Archive size={14} />}{showArchived ? "Back to active" : "Archived conversations"}</button>
      </aside>
      {sidebarCollapsed ? <button className="assistant-sidebar-expand" onClick={() => setSidebarCollapsed(false)} aria-label="Open conversation sidebar"><ChevronRight size={17} /></button> : null}

      <section className="assistant-workspace">
        <header className="assistant-topline">
          <div><span className="assistant-presence"><i />Workspace context ready</span><small>{route} · only relevant records are selected</small></div>
          {active ? <div>
            {active.obsidianSync ? <Badge tone={active.obsidianSync.status === "synced" ? "green" : active.obsidianSync.status === "conflict" ? "orange" : "neutral"}>Obsidian: {active.obsidianSync.status === "synced" ? "synced" : active.obsidianSync.status === "conflict" ? "needs review" : "pending"}</Badge> : null}
            {/* Review memory and Delete are rare and destructive; they no longer sit
                in the primary header. */}
            <details className="assistant-overflow">
              <summary aria-label="More conversation actions"><MoreHorizontal size={16} /></summary>
              <div>
                <LoadingButton className="button-quiet" loading={memoryBusy} loadingLabel="Preparing…" disabled={messages.length < 2} onClick={() => void prepareMemory()}><Save size={14} aria-hidden="true" />Review memory</LoadingButton>
                <Button className="button-quiet" onClick={() => active && setRenameTarget(active)}><Edit3 size={14} aria-hidden="true" />Rename conversation</Button>
                <Button className="button-quiet danger" onClick={() => void deleteSession()}><Trash2 size={14} aria-hidden="true" />Delete conversation</Button>
              </div>
            </details>
          </div> : null}
        </header>

        <div className={`assistant-thread ${messages.length || live ? "has-messages" : ""}`}>
          {loadingSession ? <div className="assistant-loading"><LoaderCircle className="spin" size={24} />Opening conversation…</div> : null}
          {!loadingSession && !messages.length && !live ? <div className="assistant-welcome">
            <span><Sparkles size={22} /></span>
            <h1>{welcome}</h1>
            <p>Continuum can use your goals, learning progress, research, sources, code checkpoints, and saved memory—only when they are relevant.</p>
            <div className="assistant-starters">{starters.map((starter) => { const Icon = starter.icon; return <button key={starter.label} onClick={() => void send(starter.prompt)}><Icon size={18} /><span><strong>{starter.label}</strong><small>{starter.prompt}</small></span></button>; })}</div>
          </div> : null}

          {messages.map((message) => <article key={message.id} className={`assistant-message ${message.role}`}>
            <div className="assistant-message-author">{message.role === "user" ? "You" : <><Sparkles size={14} />Continuum</>}</div>
            {message.metadata?.attachmentIds?.length ? <div className="assistant-message-attachments">{message.metadata.attachmentIds.map((sourceId) => <span key={sourceId}><Paperclip size={12} />{text(state.sources.find((source) => text(source, "id") === sourceId), "title", "Attached source")}</span>)}</div> : null}
            {message.role === "assistant" ? <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown> : <p>{message.content}</p>}
            {message.metadata?.usedContext?.length ? <details className="assistant-used-context"><summary><SlidersHorizontal size={12} aria-hidden="true" />Answered using {message.metadata.usedContext.length} record{message.metadata.usedContext.length === 1 ? "" : "s"} from your workspace</summary><p>Continuum retrieved only these records — the smallest set relevant to your message. Nothing else from your workspace was sent.</p><ul>{message.metadata.usedContext.map((item) => <li key={`${item.type}:${item.id}`}><span>{formatLabel(item.type)}</span>{item.label}</li>)}</ul></details> : null}
            <div className="assistant-message-actions">
              <button onClick={() => void navigator.clipboard.writeText(message.content)}><Copy size={12} />Copy</button>
              {message.role === "user" ? <button onClick={() => { setDraft(message.content); document.querySelector<HTMLTextAreaElement>(".assistant-composer textarea")?.focus(); }}><Edit3 size={12} />Edit and resend</button> : <button onClick={regenerateLast}><RefreshCw size={12} />Regenerate</button>}
            </div>
          </article>)}
          {busy ? <article className="assistant-message assistant current"><div className="assistant-message-author"><Sparkles size={14} />Continuum</div>{live ? <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]}>{live}</ReactMarkdown> : <p className="assistant-thinking"><LoaderCircle className="spin" size={16} />Selecting the smallest useful context…</p>}</article> : null}
          {error ? <div className="assistant-error" role="alert"><span>{error}</span><button onClick={() => setError("")}><X size={14} />Dismiss</button></div> : null}
          <div ref={messagesEndRef} />
        </div>

        <form
          className={`assistant-composer ${dragging ? "dragging" : ""}`}
          onSubmit={submit}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); void uploadFiles(Array.from(event.dataTransfer.files)); }}
        >
          <input ref={attachmentInputRef} className="sr-only" aria-label="Attach files to this conversation" type="file" multiple accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json,.yaml,.yml,.tex,.py,.js,.jsx,.ts,.tsx,.java,.c,.cpp,.h,.hpp,.rs,.go,.rb,.php,.swift,.kt,.sql,.html,.css,.png,.jpg,.jpeg,.webp" onChange={(event) => { void uploadFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
          {attachments.length ? <div className="assistant-attachment-tray">{attachments.map((attachment) => <div className={`assistant-attachment ${attachment.state}`} key={attachment.id}>{attachment.state === "extracting" ? <LoaderCircle className="spin" size={14} /> : attachment.state === "error" ? <X size={14} /> : <Paperclip size={14} />}<span><strong>{attachment.name}</strong><small>{attachment.state === "extracting" ? "Extracting safely…" : attachment.message ?? `${(attachment.size / 1024).toFixed(0)} KB · retrieved when needed`}</small></span><button type="button" onClick={() => setAttachments((current) => current.filter((candidate) => candidate.id !== attachment.id))} aria-label={`Remove ${attachment.name}`}><X size={13} /></button></div>)}</div> : null}
          {dragging ? <div className="assistant-drop-hint"><UploadCloud size={20} />Drop files to extract and attach</div> : null}
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files);
              if (files.length) { event.preventDefault(); void uploadFiles(files); }
            }}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (draft.trim() || attachments.some((attachment) => attachment.state === "ready")) void send(draft); } }}
            placeholder="Ask about your learning, code, research, notes, or plan…"
            maxLength={12_000}
            rows={1}
            aria-label="Message Continuum Assistant"
          />
          <Button type="button" className="assistant-attach" onClick={() => attachmentInputRef.current?.click()} aria-label="Attach files"><Paperclip size={16} /></Button>
          {busy ? <Button type="button" className="assistant-send stop" onClick={() => abortRef.current?.abort()} aria-label="Stop response"><Square size={15} /></Button> : <Button className="assistant-send" disabled={!draft.trim() && !attachments.some((attachment) => attachment.state === "ready")} aria-label="Send message"><ArrowUp size={17} /></Button>}
          <div className="assistant-composer-options">
            <label>
              <span className="sr-only">Assistant mode</span>
              <select value={credentialMode === "user" ? "byok" : assistantMode} onChange={(event) => {
                if (event.target.value === "byok") setCredentialMode("user");
                else { setCredentialMode("platform"); setAssistantMode(event.target.value as AssistantMode); }
              }}>
                {/* Bare mode names told a new user nothing about what changes. */}
                <option value="auto">Continuum Auto — picks the right model per message</option>
                <option value="fast">Fast — quick answers, lighter reasoning</option>
                <option value="deep">Deep Reasoning — slower, for hard problems</option>
                <option value="coding">Coding — code, tests, and debugging</option>
                <option value="document">Document Analysis — long sources and attachments</option>
                {hasPersonalCredential ? <option value="byok">My API key — billed to your own provider</option> : null}
              </select>
            </label>
            <button type="button" onClick={() => setContextOpen(true)} title="Choose which parts of your workspace this conversation may retrieve from"><SlidersHorizontal size={13} aria-hidden="true" />{contextScopes.length} context source{contextScopes.length === 1 ? "" : "s"}</button>
            <button type="button" onClick={() => setCredentialOpen(true)}><KeyRound size={13} />{hasPersonalCredential ? "Manage API key" : "Use my API key"}</button>
          </div>
          <div className="assistant-context-chips">{contextScopes.slice(0, 3).map((scope) => <span key={scope}>{contextOptions.find((option) => option.value === scope)?.label}</span>)}{contextScopes.length > 3 ? <span>+{contextScopes.length - 3}</span> : null}</div>
          <small><Badge tone="neutral">Private workspace</Badge> Enter to send · Shift+Enter for a new line · files use targeted retrieval</small>
        </form>
      </section>

      <Modal
        open={Boolean(renameTarget)}
        onOpenChange={(open) => { if (!open) setRenameTarget(undefined); }}
        title="Rename conversation"
        description="A clear name makes a long list scannable."
      >
        {renameTarget ? <form className="workspace-form" onSubmit={(event) => { event.preventDefault(); void commitRename(renameTarget, String(new FormData(event.currentTarget).get("title") ?? "")); }}>
          <label>Conversation name<input name="title" autoFocus maxLength={120} defaultValue={renameTarget.title} /></label>
          <div className="form-actions"><Button className="button-secondary" type="button" onClick={() => setRenameTarget(undefined)}>Cancel</Button><Button className="button-primary" type="submit">Rename</Button></div>
        </form> : null}
      </Modal>

      <ConfirmationDialog
        open={Boolean(confirmRequest)}
        onOpenChange={(open) => { if (!open) setConfirmRequest(undefined); }}
        title={confirmRequest?.title ?? ""}
        description={confirmRequest?.description ?? ""}
        confirmLabel={confirmRequest?.confirmLabel ?? "Confirm"}
        destructive
        busy={credentialBusy}
        onConfirm={() => { const request = confirmRequest; setConfirmRequest(undefined); void request?.run(); }}
      />

      <Modal open={contextOpen} onOpenChange={setContextOpen} title="Choose context for this conversation" description="Continuum retrieves only relevant records within the scopes you select. It never sends an entire large library or document to every request.">
        <div className="assistant-context-selector">
          {contextOptions.map((option) => {
            const checked = contextScopes.includes(option.value);
            return <label key={option.value}><input type="checkbox" checked={checked} onChange={(event) => {
              if (option.value === "conversation") {
                setContextScopes(event.target.checked ? ["conversation"] : ["approved_memory"]);
                return;
              }
              setContextScopes((current) => event.target.checked
                ? [...current.filter((scope) => scope !== "conversation" && scope !== option.value), option.value]
                : current.filter((scope) => scope !== option.value));
            }} /><span><strong>{option.label}</strong><small>{option.description}</small></span></label>;
          })}
          <div className="modal-inline-actions"><Button className="button-secondary" onClick={() => setContextScopes(["approved_memory"])}>Privacy-conscious default</Button><Button className="button-primary" onClick={() => setContextOpen(false)}>Done</Button></div>
        </div>
      </Modal>

      <Modal open={memoryOpen} onOpenChange={setMemoryOpen} title="Review session memory" description="Nothing becomes durable until you save. Edit, remove, or exclude anything that should not return in future context." dirty={Boolean(memory)} dirtyMessage="Close without saving this memory proposal?">
        {memory ? <div className="assistant-memory-form">
          <label>Session summary<textarea value={memory.summary} onChange={(event) => setMemory((current) => current ? { ...current, summary: event.target.value } : current)} /></label>
          <div className="assistant-memory-grid">
            <MemoryListField label="Decisions" value={memory.decisions} onChange={(value) => setMemory((current) => current ? { ...current, decisions: value } : current)} placeholder="Decisions worth remembering" />
            <MemoryListField label="Next actions" value={memory.createdTasks} onChange={(value) => setMemory((current) => current ? { ...current, createdTasks: value } : current)} placeholder="Tasks created or agreed" />
            <MemoryListField label="Unresolved questions" value={memory.unresolvedQuestions} onChange={(value) => setMemory((current) => current ? { ...current, unresolvedQuestions: value } : current)} placeholder="Open questions" />
            <MemoryListField label="Important facts" value={memory.importantFacts} onChange={(value) => setMemory((current) => current ? { ...current, importantFacts: value } : current)} placeholder="Durable facts only" />
          </div>
          <p className="assistant-memory-note"><Archive size={15} />Raw chat is kept as session history. Future retrieval uses this compact memory, not the full transcript.</p>
          <label className="assistant-memory-transcript"><input type="checkbox" checked={includeRawTranscript} onChange={(event) => setIncludeRawTranscript(event.target.checked)} />Also include the raw transcript in the Obsidian note</label>
          <div className="modal-inline-actions"><Button className="button-quiet danger" onClick={() => void excludeMemory()}>Exclude from memory</Button><Button className="button-secondary" onClick={() => setMemoryOpen(false)}>Cancel</Button><LoadingButton className="button-primary" loading={memoryBusy} loadingLabel="Saving…" disabled={memory.summary.trim().length < 3} onClick={() => void saveMemory()}>Save memory</LoadingButton></div>
        </div> : null}
      </Modal>

      <Modal open={credentialOpen} onOpenChange={setCredentialOpen} title="Optional Assistant API key" description="Continuum Auto works without setup. A personal key is used only for Workspace Assistant messages sent in My API Key mode." dirty={Boolean(credentialSecret || credentialPassword)} dirtyMessage="Close without saving the API key you entered?">
        <div className="assistant-credential-panel">
          {configuredCredentials.map((credential) => <article key={credential.provider}><div><strong>{credential.name}</strong><span>{credential.masked} · {credential.status}</span></div><Badge tone={credential.status === "connected" ? "green" : "orange"}>{credential.status ?? "Saved"}</Badge></article>)}
          <form onSubmit={savePersonalCredential}>
            <label>Provider<select value={credentialProvider} onChange={(event) => setCredentialProvider(event.target.value as PersonalProvider)}>{credentialCatalog.map((provider) => <option key={provider.provider} value={provider.provider}>{provider.name}</option>)}</select></label>
            <label>API key<input type="password" autoComplete="off" minLength={8} maxLength={2_000} required value={credentialSecret} onChange={(event) => setCredentialSecret(event.target.value)} placeholder="Paste a dedicated Assistant key" /></label>
            {configuredCredentials.some((credential) => credential.provider === credentialProvider) ? <label>Current Continuum password<input type="password" autoComplete="current-password" required value={credentialPassword} onChange={(event) => setCredentialPassword(event.target.value)} /></label> : null}
            <p>The key is validated server-side, encrypted at rest, masked after saving, and unavailable to Learn, Research, grading, Code, extraction, and background jobs.</p>
            <div className="modal-inline-actions">
              {configuredCredentials.some((credential) => credential.provider === credentialProvider) ? <Button className="button-quiet danger" type="button" disabled={credentialBusy} onClick={() => void deletePersonalCredential(credentialProvider)}>Delete key</Button> : null}
              <Button className="button-secondary" type="button" onClick={() => setCredentialOpen(false)}>Cancel</Button>
              <LoadingButton className="button-primary" loading={credentialBusy} loadingLabel="Validating…" disabled={credentialSecret.trim().length < 8}>Validate and save</LoadingButton>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
