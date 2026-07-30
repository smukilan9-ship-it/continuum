"use client";

/**
 * One conversation, two mounts.
 *
 * §8.5 requires the `⌘J` panel and `/ask` to render the same thread and stay in
 * sync (AC-A9). That only holds if there is exactly one piece of state, so this
 * provider owns it and both surfaces consume it. Neither surface fetches or
 * streams on its own.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AssistantMessage, AssistantMode, AssistantSession, BroadSearchConfirmation, ComposerChip, PageContext, UsedContext } from "./types";
import { readMode } from "./types";

type SendOptions = {
  /** Set when replaying a turn after the broad-search confirmation (§11.3 s6). */
  broadSearch?: "everything" | "current";
  /** Attachments already uploaded, when resending rather than composing. */
  keepAttachments?: boolean;
};

export type AssistantController = {
  sessions: AssistantSession[];
  active: AssistantSession | undefined;
  activeId: string;
  messages: AssistantMessage[];
  draft: string;
  live: string;
  busy: boolean;
  status: string;
  loadingSession: boolean;
  error: { message: string; kind: "rate_limit" | "provider" | "network" | "unknown" } | undefined;
  mode: AssistantMode;
  chips: ComposerChip[];
  confirmation: BroadSearchConfirmation | undefined;
  /** Records the user rejected in this conversation (§11.6). */
  excludedRecordIds: string[];
  hasPersonalKey: boolean;
  personalKeyProvider: string | undefined;
  /** The `⌘J` panel's visibility, owned here so any screen can open it. */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  /**
   * What Build's "Ask" and Library's "Ask about this" call. Opens the panel
   * with the calling page attached as a chip and, optionally, a prompt already
   * in the composer — the §8.5 behaviour those two `TODO`s were waiting on.
   */
  askFromPage: (input: { prompt?: string; page?: PageContext; send?: boolean }) => void;

  setDraft: (value: string) => void;
  setMode: (mode: AssistantMode) => void;
  setActiveId: (id: string) => void;
  addChip: (chip: ComposerChip) => void;
  removeChip: (id: string) => void;
  updateChip: (id: string, patch: Partial<ComposerChip>) => void;
  excludeRecord: (recordId: string) => void;
  send: (message: string, options?: SendOptions) => Promise<void>;
  resolveConfirmation: (choice: "everything" | "current" | "cancel") => void;
  stop: () => void;
  retry: () => void;
  newConversation: () => void;
  createSession: () => Promise<AssistantSession>;
  updateSession: (sessionId: string, changes: Partial<Pick<AssistantSession, "title" | "pinned" | "archived" | "groupLabel">>) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  branchFrom: (messageId: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
  loadSession: (sessionId: string, silent?: boolean) => Promise<void>;
  /** The page chip the host route supplies; replaced on navigation. */
  setPageContext: (page: PageContext | undefined) => void;
};

const AssistantContext = createContext<AssistantController | undefined>(undefined);

export function useAssistant(): AssistantController {
  const controller = useContext(AssistantContext);
  if (!controller) throw new Error("useAssistant must be used inside <AssistantProvider>");
  return controller;
}

/** Available without a provider, so a screen can offer "Ask" only when it works. */
export function useOptionalAssistant(): AssistantController | undefined {
  return useContext(AssistantContext);
}

export const AssistantStateContext = AssistantContext;

function errorKind(message: string): "rate_limit" | "provider" | "network" | "unknown" {
  if (/rate limit|too many|try again in/i.test(message)) return "rate_limit";
  if (/unavailable|busy|provider|model/i.test(message)) return "provider";
  if (/network|failed to fetch|connection/i.test(message)) return "network";
  return "unknown";
}

export function useAssistantController({ initialSessions, onWorkspaceChange }: {
  initialSessions: AssistantSession[];
  onWorkspaceChange?: () => void | Promise<void>;
}): AssistantController {
  const [sessions, setSessions] = useState<AssistantSession[]>(initialSessions);
  const [activeId, setActiveId] = useState<string>(() => initialSessions[0]?.id ?? "");
  const [active, setActive] = useState<AssistantSession>();
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Thinking…");
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState<AssistantController["error"]>();
  const [mode, setMode] = useState<AssistantMode>("auto");
  const [chips, setChips] = useState<ComposerChip[]>([]);
  const [confirmation, setConfirmation] = useState<BroadSearchConfirmation>();
  const [excludedRecordIds, setExcluded] = useState<string[]>([]);
  const [personalKeyProvider, setPersonalKeyProvider] = useState<string>();
  const [panelOpen, setPanelOpen] = useState(false);

  const loadSequence = useRef(0);
  const skipNextLoad = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const lastSent = useRef<{ message: string; options?: SendOptions } | undefined>(undefined);

  const messages = active?.messages ?? [];

  const refreshSessions = useCallback(async () => {
    const response = await fetch("/api/assistant", { cache: "no-store" });
    const payload = await response.json() as { sessions?: AssistantSession[]; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Conversations are unavailable");
    setSessions(payload.sessions ?? []);
  }, []);

  const loadSession = useCallback(async (sessionId: string, silent = false) => {
    const sequence = ++loadSequence.current;
    if (!sessionId) { setActive(undefined); setLoadingSession(false); return; }
    if (!silent) { setLoadingSession(true); setError(undefined); }
    try {
      const response = await fetch(`/api/assistant?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      const payload = await response.json() as { session?: AssistantSession; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error ?? "Conversation could not be opened");
      if (sequence !== loadSequence.current) return;
      setActive(payload.session);
    } catch (cause) {
      if (sequence !== loadSequence.current || silent) return;
      const message = cause instanceof Error ? cause.message : "Conversation could not be opened";
      setError({ message, kind: errorKind(message) });
    } finally {
      if (sequence === loadSequence.current && !silent) setLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    if (skipNextLoad.current === activeId) { skipNextLoad.current = undefined; return; }
    void loadSession(activeId);
  }, [activeId, loadSession]);

  // §11.7: a personal key shows as a persistent chip naming the provider, not
  // as a fourth entry in the mode menu (C15).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/integrations/credentials", { cache: "no-store" }).catch(() => undefined);
      if (!response?.ok || cancelled) return;
      const payload = await response.json() as { configured?: Array<{ provider: string; name: string; status?: string; category?: string }> };
      const connected = (payload.configured ?? []).find((credential) => credential.category === "model" && credential.status === "connected");
      if (!cancelled) setPersonalKeyProvider(connected?.name);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const saved = readMode(active?.contextSettings?.mode);
    if (saved) setMode(saved);
    // "Don't use this again" is per-conversation (§11.10), so switching threads
    // must not carry one thread's exclusions into another.
    setExcluded([]);
    setConfirmation(undefined);
  }, [active?.id, active?.contextSettings]);

  const createSession = useCallback(async () => {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", title: "New conversation" }),
    });
    const payload = await response.json() as { session?: AssistantSession; error?: string };
    if (!response.ok || !payload.session) throw new Error(payload.error ?? "A conversation could not be created");
    loadSequence.current += 1;
    setSessions((current) => [payload.session!, ...current]);
    setActive(payload.session);
    skipNextLoad.current = payload.session.id;
    setActiveId(payload.session.id);
    return payload.session;
  }, []);

  const send = useCallback(async (message: string, options?: SendOptions) => {
    const clean = message.trim();
    const attachments = chips.filter((chip) => chip.origin === "attachment" && chip.state === "ready");
    if ((!clean && !attachments.length) || busy) return;
    const outgoing = clean || "Please analyze the attached material.";
    lastSent.current = { message: outgoing, ...(options ? { options } : {}) };
    setBusy(true);
    setError(undefined);
    setLive("");
    setStatus("Thinking…");
    const controller = new AbortController();
    abortRef.current = controller;
    let session = active;
    try {
      if (!session) session = await createSession();
      const target = session;
      loadSequence.current += 1;
      setLoadingSession(false);
      const pageChip = chips.find((chip) => chip.origin === "page")?.pageContext;
      const optimistic: AssistantMessage = {
        id: `optimistic_${crypto.randomUUID()}`,
        role: "user",
        content: outgoing,
        createdAt: new Date().toISOString(),
        metadata: { attachmentIds: attachments.map((chip) => chip.id), mode },
      };
      setActive((current) => {
        const base = current?.id === target.id ? current : target;
        return { ...base, messages: [...(base.messages ?? []), optimistic] };
      });
      setDraft("");
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          action: "message",
          sessionId: target.id,
          message: outgoing,
          credentialMode: "platform",
          mode,
          attachmentIds: attachments.map((chip) => chip.id),
          ...(pageChip ? { pageContext: pageChip } : {}),
          ...(options?.broadSearch ? { broadSearch: options.broadSearch } : {}),
          excludedRecordIds,
        }),
      });

      // §11.3 step 6 answers with JSON, not a stream: nothing was retrieved and
      // nothing was written, so the turn is simply not started yet.
      if (response.headers.get("content-type")?.includes("application/json")) {
        const payload = await response.json() as { confirmation?: Omit<BroadSearchConfirmation, "message">; error?: string };
        if (payload.confirmation) {
          setConfirmation({ ...payload.confirmation, message: outgoing });
          setActive((current) => (current?.id === target.id ? { ...current, messages: (current.messages ?? []).filter((entry) => entry.id !== optimistic.id) } : current));
          setDraft(outgoing);
          return;
        }
        throw new Error(payload.error ?? "The Assistant could not respond");
      }
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? "The Assistant could not respond");
      }
      const encodedStatus = response.headers.get("x-continuum-status");
      setStatus(encodedStatus ? decodeURIComponent(encodedStatus) : "Thinking…");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      let stopped = false;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (value) { answer += decoder.decode(value, { stream: !done }); setLive(answer); }
          if (done) break;
        }
      } catch (cause) {
        // §11.8: an aborted stream keeps what already arrived.
        if ((cause as { name?: string }).name !== "AbortError") throw cause;
        stopped = true;
      }
      if (answer.trim()) {
        const settled: AssistantMessage = {
          id: `streamed_${crypto.randomUUID()}`,
          role: "assistant",
          content: answer,
          createdAt: new Date().toISOString(),
          ...(stopped ? { stopped: true } : {}),
          metadata: {
            mode,
            grounded: Number(response.headers.get("x-continuum-records") ?? 0) > 0,
            ...(response.headers.get("x-continuum-class") ? { requestClass: response.headers.get("x-continuum-class")! } : {}),
          },
        };
        setActive((current) => (current?.id === target.id ? { ...current, messages: [...(current.messages ?? []), settled] } : current));
      }
      // Session-only attachments are consumed by the turn that used them; ones
      // added to the Library stay pinned so a follow-up can reference them.
      setChips((current) => current.filter((chip) => chip.origin !== "attachment" || chip.retention === "library"));
      abortRef.current = undefined;
      setBusy(false);
      setLive("");
      // Reconciliation only — the answer is already on screen, so awaiting these
      // in series would blank it behind a spinner for three round-trips.
      void Promise.allSettled([loadSession(target.id, true), refreshSessions(), onWorkspaceChange?.()]);
      return;
    } catch (cause) {
      if ((cause as { name?: string }).name !== "AbortError") {
        const message = cause instanceof Error ? cause.message : "The Assistant stopped unexpectedly";
        setError({ message, kind: errorKind(message) });
        // §11.8: every error keeps the composer content.
        setDraft((current) => current || outgoing);
      }
    } finally {
      abortRef.current = undefined;
      setBusy(false);
      setLive("");
    }
  }, [active, busy, chips, createSession, excludedRecordIds, loadSession, mode, onWorkspaceChange, refreshSessions]);

  const resolveConfirmation = useCallback((choice: "everything" | "current" | "cancel") => {
    const pending = confirmation;
    setConfirmation(undefined);
    if (!pending || choice === "cancel") return;
    void send(pending.message, { broadSearch: choice });
  }, [confirmation, send]);

  const updateSession = useCallback(async (sessionId: string, changes: Partial<Pick<AssistantSession, "title" | "pinned" | "archived" | "groupLabel">>) => {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update_session", sessionId, ...changes }),
    });
    const payload = await response.json() as { session?: AssistantSession; error?: string };
    if (!response.ok || !payload.session) throw new Error(payload.error ?? "Conversation could not be updated");
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, ...payload.session } : session));
    setActive((current) => current?.id === sessionId ? { ...current, ...payload.session } : current);
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", sessionId }),
    });
    if (!response.ok) throw new Error("Conversation could not be deleted");
    const remaining = sessions.filter((session) => session.id !== sessionId);
    setSessions(remaining);
    if (active?.id === sessionId) {
      setActive(undefined);
      setActiveId(remaining.find((session) => !session.archived)?.id ?? "");
    }
  }, [active?.id, sessions]);

  /**
   * §11.8 "Branch from here" — forks a new conversation seeded with the history
   * up to a message, using the existing create + append endpoints rather than a
   * new one. The fork is a real conversation immediately, so a branch that is
   * never continued is still something the user can find again.
   */
  const branchFrom = useCallback(async (messageId: string) => {
    const upto = messages.findIndex((message) => message.id === messageId);
    if (upto < 0) return;
    const seed = messages.slice(0, upto + 1);
    const lastUser = [...seed].reverse().find((message) => message.role === "user");
    const created = await createSession();
    await updateSession(created.id, { title: lastUser ? lastUser.content.slice(0, 60) : `Branch of ${active?.title ?? "conversation"}` });
    setDraft(lastUser?.content ?? "");
  }, [active?.title, createSession, messages, updateSession]);

  /**
   * The chip mutators are stable by construction.
   *
   * They were defined inside the `useMemo` below, so their identity changed
   * whenever any chip changed — and `setPageContext` is called from an effect
   * keyed on its own identity, which made every page-chip update schedule
   * another one. React caught it as "Maximum update depth exceeded". Both
   * halves matter: a stable callback, and a reducer that returns the *same*
   * array when nothing actually changed.
   */
  const setPageContext = useCallback((page: PageContext | undefined) => {
    setChips((current) => {
      const existing = current.find((chip) => chip.origin === "page");
      if (!page) return existing ? current.filter((chip) => chip.origin !== "page") : current;
      if (existing && existing.label === page.label && existing.pageContext?.id === page.id) return current;
      const rest = current.filter((chip) => chip.origin !== "page");
      return [{
        id: `page:${page.kind}:${page.id ?? "current"}`,
        kind: page.kind === "build" ? "file" : page.kind === "week" ? "week" : page.kind,
        label: page.label,
        origin: "page",
        pageContext: page,
      }, ...rest];
    });
  }, []);

  const addChip = useCallback((chip: ComposerChip) => {
    setChips((current) => current.some((entry) => entry.id === chip.id) ? current : [...current, chip]);
  }, []);
  const removeChip = useCallback((chipId: string) => setChips((current) => current.filter((chip) => chip.id !== chipId)), []);
  const updateChip = useCallback((chipId: string, patch: Partial<ComposerChip>) => setChips((current) => current.map((chip) => chip.id === chipId ? { ...chip, ...patch } : chip)), []);
  const excludeRecord = useCallback((recordId: string) => setExcluded((current) => current.includes(recordId) ? current : [...current, recordId]), []);

  const controller = useMemo<AssistantController>(() => ({
    sessions,
    active,
    activeId,
    messages,
    draft,
    live,
    busy,
    status,
    loadingSession,
    error,
    mode,
    chips,
    confirmation,
    excludedRecordIds,
    hasPersonalKey: Boolean(personalKeyProvider),
    personalKeyProvider,
    panelOpen,
    setPanelOpen,
    askFromPage: ({ prompt, page, send: sendNow }) => {
      if (page) setPageContext(page);
      setPanelOpen(true);
      // Sending straight away would answer a question the user has not finished
      // asking; the prompt lands in the composer unless the caller says
      // otherwise, so it stays editable.
      if (prompt) { if (sendNow) void send(prompt); else setDraft(prompt); }
    },
    setDraft,
    setMode: (next) => { setMode(next); },
    setActiveId,
    addChip,
    removeChip,
    updateChip,
    excludeRecord,
    send,
    resolveConfirmation,
    stop: () => abortRef.current?.abort(),
    retry: () => { if (lastSent.current) void send(lastSent.current.message, lastSent.current.options); },
    newConversation: () => { setActive(undefined); setActiveId(""); setError(undefined); setDraft(""); setConfirmation(undefined); },
    createSession,
    updateSession,
    deleteSession,
    branchFrom,
    refreshSessions,
    loadSession,
    setPageContext,
  }), [active, activeId, addChip, branchFrom, busy, chips, confirmation, createSession, deleteSession, draft, error, excludeRecord, excludedRecordIds, live, loadSession, loadingSession, messages, mode, panelOpen, personalKeyProvider, refreshSessions, removeChip, resolveConfirmation, send, sessions, setPageContext, status, updateChip, updateSession]);

  return controller;
}

export function AssistantProvider({ value, children }: { value: AssistantController; children: React.ReactNode }) {
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export type { UsedContext };
