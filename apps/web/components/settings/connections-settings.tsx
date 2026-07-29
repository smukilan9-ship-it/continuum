"use client";

import {
  AlertTriangle,
  BookOpen,
  Clipboard,
  Download,
  ExternalLink,
  KeyRound,
  Library,
  Link2,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Upload,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import {
  Badge,
  Banner,
  Button,
  ConfirmationDialog,
  Field,
  Input,
  LoadingButton,
  Modal,
} from "@/components/ui";
import { PageHeader } from "@/components/workspace/page-header";

import { ConnectionCard, ConnectionCardError, ConnectionCardSkeleton, ConnectionGroup } from "./connection-card";
import { OllamaCard, OllamaDialog, useOllama } from "./ollama";
import { SecretField, SetupDialog, SetupSteps, TestConnection, type TestResult } from "./setup-dialog";
import { CONNECTION_STATUS, type ConnectionStatus } from "./status";
import { useResource } from "./use-resource";

import "./settings.css";

type Toast = (message: string | null) => void;

type ConnectionsPayload = {
  mcp: {
    endpoint: string;
    connections: Array<{ clientId: string; name: string; scopes: string[]; connectedAt?: string; lastUsedAt?: string; calls: number }>;
    claude: { instructions: string[] };
  };
  zotero: { connected: boolean; available: boolean; username?: string; lastSyncAt?: string; scopes: string[] };
  obsidian: { available: boolean; tokens: Array<{ id: string; name: string; scopes: string[]; lastUsedAt?: string; expiresAt?: string; createdAt: string }> };
};

type ObsidianDashboard = {
  paused: boolean;
  pausedAt?: string;
  records: Array<{ sync_id: string; record_id: string; record_type: string; title: string; path: string; last_synced_at?: string; blocked_at?: string; updated_at: string }>;
  operations: Array<{ id: string; sync_id: string; operation_type: string; status: string; attempt_count: number; latest_error?: string; bridge_acknowledged_at?: string; created_at: string; updated_at: string }>;
  conflicts: Array<{ id: string; sync_id: string; status: string; server_content: string; local_content: string; server_path: string; local_path: string; created_at: string }>;
};

type ServiceCredential = {
  provider: "openalex" | "youtube";
  name: string;
  status: "connected" | "degraded" | "invalid";
  masked: string;
  lastValidatedAt?: string;
  lastUsedAt?: string;
  reconfigurationRequired?: boolean;
  problem?: string;
};

type CredentialsPayload = { configured?: ServiceCredential[] };

const links = {
  claude: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
  zoteroKey: "https://www.zotero.org/settings/keys/new",
  zoteroApi: "https://www.zotero.org/support/dev/web_api/v3/start",
  notebooklm: "https://notebooklm.google.com/",
  notebookHelp: "https://support.google.com/notebooklm/answer/14278184",
  obsidian: "https://obsidian.md/help/community-plugins",
  obsidianSecurity: "https://obsidian.md/help/Extending%2BObsidian/Plugin%2Bsecurity",
  openAlexKey: "https://openalex.org/settings/api",
  openAlexAuth: "https://developers.openalex.org/guides/authentication",
  youtubeConsole: "https://console.cloud.google.com/apis/credentials",
  youtubeEnable: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
  youtubeDocs: "https://developers.google.com/youtube/v3/getting-started",
};

/**
 * §12.4's scope table, in the words the user reads on the consent screen. The
 * raw scope name is never shown: `research:write` tells a student nothing, and
 * the old card printed `research write` — the colon replaced by a space — which
 * is worse than either.
 */
const SCOPE_COPY: Record<string, string> = {
  "memory:read": "Read your goals, plans, and saved work",
  "research:read": "Read your projects, sources, and decisions",
  "learning:read": "Read your study progress",
  "goals:read": "Read your goals and schedule",
  "schedule:read": "Read your goals and schedule",
  "resources:read": "Find learning resources for you",
  "memory:write": "Add progress notes and session summaries",
  "research:write": "Add notes and claims to your projects",
  "learning:write": "Record practice results",
  "goals:write": "Suggest changes for you to approve",
  "schedule:propose": "Suggest changes for you to approve",
  "schedule:commit": "Save schedule changes you have already approved",
  "routing:invoke": "Ask Continuum for bounded specialist help",
};

const CLAUDE_CAN_READ = [
  "Read your goals, plans, and saved work",
  "Read your projects, sources, and decisions",
  "Read your study progress",
];

const CLAUDE_CAN_ADD = [
  "Add progress notes and session summaries",
  "Add notes and claims to your projects",
  "Record practice results",
  "Suggest changes for you to approve",
];

/** §12.4's explicit negative list. Stating it is the point of the section. */
const CLAUDE_CAN_NEVER = [
  "Change or delete your goals, tasks, or schedule without your approval",
  "Accept a research decision",
  "Read your password or API keys",
  "Access anything outside your account",
];

function scopeSentences(scopes: string[]) {
  return [...new Set(scopes.map((scope) => SCOPE_COPY[scope]).filter((value): value is string => Boolean(value)))];
}

function dateLabel(value?: string) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not synced yet";
}

export function ConnectionsSettings({ showToast, embedded = false }: { showToast: Toast; embedded?: boolean }) {
  const [connections, reloadConnections] = useResource<ConnectionsPayload>("/api/integrations", "Connections are unavailable right now.");
  const [obsidian, reloadObsidian] = useResource<ObsidianDashboard>("/api/integrations/obsidian", "Obsidian sync status is unavailable right now.");
  const [credentials, reloadCredentials] = useResource<CredentialsPayload>("/api/integrations/credentials", "Your saved API keys are unavailable right now.");

  const [busy, setBusy] = useState("");
  const [confirmRequest, setConfirmRequest] = useState<{ title: string; description: string; confirmLabel: string; run: () => void | Promise<void> }>();

  const [claudeOpen, setClaudeOpen] = useState(false);
  const [claudeTest, setClaudeTest] = useState<TestResult>();

  const [zoteroOpen, setZoteroOpen] = useState(false);
  const [zoteroKey, setZoteroKey] = useState("");
  const [zoteroTest, setZoteroTest] = useState<TestResult>();

  const [obsidianOpen, setObsidianOpen] = useState(false);
  const [obsidianToken, setObsidianToken] = useState("");

  const [openAlexOpen, setOpenAlexOpen] = useState(false);
  const [openAlexKey, setOpenAlexKey] = useState("");
  const [openAlexPassword, setOpenAlexPassword] = useState("");
  const [openAlexTest, setOpenAlexTest] = useState<TestResult>();

  const [youtubeOpen, setYouTubeOpen] = useState(false);
  const [youtubeKey, setYouTubeKey] = useState("");
  const [youtubePassword, setYouTubePassword] = useState("");
  const [youtubeTest, setYouTubeTest] = useState<TestResult>();

  const [ollamaOpen, setOllamaOpen] = useState(false);
  const ollama = useOllama(showToast);

  const status = connections.data;
  const dashboard = obsidian.data;
  const openAlexCredential = credentials.data?.configured?.find((credential) => credential.provider === "openalex");
  const youtubeCredential = credentials.data?.configured?.find((credential) => credential.provider === "youtube");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("connection") === "claude") showToast("Claude connected. Its approved permissions are shown below.");
    if (query.get("connection") === "cancelled") showToast("Claude was not connected. No permissions were granted.");
  }, [showToast]);

  const copy = useCallback(async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); showToast(`${label} copied.`); }
    catch { showToast(`Could not copy ${label.toLowerCase()}. Select it manually.`); }
  }, [showToast]);

  const post = useCallback(async (path: string, body: Record<string, unknown> | undefined, key: string) => {
    setBusy(key);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json() as { error?: string; token?: string; indexed?: number; remaining?: number; hasMore?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "That change could not be saved.");
      if (payload.token) setObsidianToken(payload.token);
      return payload;
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "That change could not be saved.");
    } finally {
      setBusy("");
    }
  }, [showToast]);

  async function obsidianAction(body: Record<string, unknown>, success: string) {
    const result = await post("/api/integrations/obsidian", body, `obsidian-${String(body.action)}`);
    if (result) { await reloadObsidian(); showToast(success); }
  }

  // --- Claude ---------------------------------------------------------------

  async function testClaudeConnector() {
    setBusy("claude-test");
    setClaudeTest(undefined);
    try {
      const [authorization, resource] = await Promise.all([
        fetch("/.well-known/oauth-authorization-server", { cache: "no-store", signal: AbortSignal.timeout(8_000) }),
        fetch("/.well-known/oauth-protected-resource/mcp", { cache: "no-store", signal: AbortSignal.timeout(8_000) }),
      ]);
      if (!authorization.ok || !resource.ok) throw new Error(`OAuth discovery returned ${authorization.status}/${resource.status}`);
      const [authorizationBody, resourceBody] = await Promise.all([authorization.json(), resource.json()]) as [Record<string, unknown>, Record<string, unknown>];
      if (!authorizationBody.authorization_endpoint || !authorizationBody.token_endpoint || resourceBody.resource !== status?.mcp.endpoint) {
        throw new Error("The connector metadata does not match this Continuum address.");
      }
      setClaudeTest({ ok: true, message: "OAuth discovery and the protected connector address are responding correctly." });
    } catch (cause) {
      setClaudeTest({ ok: false, message: cause instanceof Error ? `Continuum could not verify the connector: ${cause.message}` : "Continuum could not verify the connector." });
    } finally { setBusy(""); }
  }

  // --- Zotero ---------------------------------------------------------------

  async function testZotero() {
    setBusy("zotero-test");
    setZoteroTest(undefined);
    try {
      const response = await fetch("/api/connections/zotero", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "validate", apiKey: zoteroKey }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      setZoteroTest(response.ok
        ? { ok: true, message: payload.message ?? "Zotero accepted this key. It has not been saved yet." }
        : { ok: false, message: payload.error ?? "Zotero rejected this key. Confirm personal-library read access and try again." });
    } catch {
      setZoteroTest({ ok: false, message: "Continuum could not reach Zotero. Check your connection, then try again." });
    } finally { setBusy(""); }
  }

  async function connectZotero(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await post("/api/connections/zotero", { action: "connect", apiKey: zoteroKey }, "zotero-connect");
    if (!result) return;
    setZoteroKey("");
    setZoteroTest(undefined);
    setZoteroOpen(false);
    await reloadConnections();
    showToast("Zotero connected. Run the first library sync when you are ready.");
  }

  // --- Personal service keys ------------------------------------------------

  async function testCredential(provider: "openalex" | "youtube", secret: string) {
    const setTest = provider === "openalex" ? setOpenAlexTest : setYouTubeTest;
    setBusy(`${provider}-test`);
    setTest(undefined);
    try {
      const response = await fetch("/api/integrations/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "validate", provider, secret }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      setTest(response.ok
        ? { ok: true, message: payload.message ?? "The provider accepted this key. It has not been saved yet." }
        : { ok: false, message: payload.error ?? "The provider rejected this key." });
    } catch {
      setTest({ ok: false, message: "Continuum could not reach the provider. Check your connection and try again." });
    } finally { setBusy(""); }
  }

  async function saveCredential(event: FormEvent<HTMLFormElement>, provider: "openalex" | "youtube") {
    event.preventDefault();
    const secret = provider === "openalex" ? openAlexKey : youtubeKey;
    const password = provider === "openalex" ? openAlexPassword : youtubePassword;
    const existing = provider === "openalex" ? openAlexCredential : youtubeCredential;
    setBusy(`${provider}-save`);
    try {
      const response = await fetch("/api/integrations/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "configure", provider, secret, ...(existing ? { currentPassword: password } : {}) }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The key could not be saved.");
      if (provider === "openalex") { setOpenAlexKey(""); setOpenAlexPassword(""); setOpenAlexTest(undefined); setOpenAlexOpen(false); }
      else { setYouTubeKey(""); setYouTubePassword(""); setYouTubeTest(undefined); setYouTubeOpen(false); }
      await reloadCredentials();
      showToast(existing ? "The API key was replaced." : "Connected. Your own key is in use from now on.");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "The key could not be saved.");
    } finally { setBusy(""); }
  }

  function disconnectCredential(provider: "openalex" | "youtube") {
    const password = provider === "openalex" ? openAlexPassword : youtubePassword;
    if (!password) {
      showToast("Enter your current Continuum password before disconnecting this key.");
      return;
    }
    setConfirmRequest({
      title: provider === "openalex" ? "Disconnect your OpenAlex key?" : "Disconnect your YouTube key?",
      description: provider === "openalex"
        ? "Saved papers stay in Continuum, and scholarly search keeps working without a key — just with lower rate limits."
        : "Saved learning progress stays in Continuum. Video search stops until another key is available.",
      confirmLabel: "Disconnect",
      run: async () => {
        setBusy(`${provider}-disconnect`);
        try {
          const response = await fetch("/api/integrations/credentials", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ provider, currentPassword: password }),
          });
          const payload = await response.json() as { error?: string };
          if (!response.ok) throw new Error(payload.error ?? "The key could not be disconnected.");
          if (provider === "openalex") { setOpenAlexPassword(""); setOpenAlexKey(""); setOpenAlexTest(undefined); setOpenAlexOpen(false); }
          else { setYouTubePassword(""); setYouTubeKey(""); setYouTubeTest(undefined); setYouTubeOpen(false); }
          await reloadCredentials();
          showToast("Disconnected. Nothing you saved was deleted.");
        } catch (cause) {
          showToast(cause instanceof Error ? cause.message : "The key could not be disconnected.");
        } finally { setBusy(""); }
      },
    });
  }

  // --- Derived status -------------------------------------------------------

  const claudeStatus: ConnectionStatus = status?.mcp.connections.length ? CONNECTION_STATUS.WORKING : CONNECTION_STATUS.NOT_CONNECTED;
  const zoteroStatus: ConnectionStatus = status?.zotero.connected ? CONNECTION_STATUS.WORKING : CONNECTION_STATUS.NOT_CONNECTED;

  const openConflicts = dashboard?.conflicts.filter((conflict) => conflict.status === "open") ?? [];
  const pendingOperations = dashboard?.operations.filter((operation) => ["pending", "syncing", "retry", "error"].includes(operation.status)) ?? [];
  const acknowledgedOperations = dashboard?.operations.filter((operation) => operation.status === "completed" && operation.bridge_acknowledged_at) ?? [];
  const obsidianStatus: ConnectionStatus = !status?.obsidian.tokens.length
    ? CONNECTION_STATUS.NOT_CONNECTED
    : dashboard?.paused
      ? CONNECTION_STATUS.PAUSED
      : openConflicts.length
        ? CONNECTION_STATUS.NEEDS_ATTENTION
        : pendingOperations.length
          ? CONNECTION_STATUS.SYNCING
          : CONNECTION_STATUS.WORKING;

  // C8: search already works through OpenAlex's polite pool, so the status has to
  // describe whether the capability works — not whether a key was supplied.
  const openAlexStatus: ConnectionStatus = !openAlexCredential
    ? CONNECTION_STATUS.WORKING_NO_SETUP
    : openAlexCredential.status === "connected"
      ? CONNECTION_STATUS.WORKING
      : openAlexCredential.status === "degraded"
        ? CONNECTION_STATUS.NEEDS_ATTENTION
        : CONNECTION_STATUS.EXPIRED;
  const youtubeStatus: ConnectionStatus = !youtubeCredential
    ? CONNECTION_STATUS.NOT_CONNECTED
    : youtubeCredential.status === "connected"
      ? CONNECTION_STATUS.WORKING
      : youtubeCredential.status === "degraded"
        ? CONNECTION_STATUS.NEEDS_ATTENTION
        : CONNECTION_STATUS.EXPIRED;

  function refreshAll() {
    void reloadConnections();
    void reloadObsidian();
    void reloadCredentials();
  }

  // A skeleton stands in for a card that has never loaded. A refresh of a card
  // that is already on screen keeps the card and updates in place — replacing
  // live content with a placeholder is a worse answer than a stale second.
  const connectionsPending = connections.status === "loading" && !status;
  const credentialsPending = credentials.status === "loading" && !credentials.data;

  return (
    <div className={embedded ? "connections-page connections-page-embedded" : "screen connections-page"}>
      {embedded ? null : (
        <PageHeader
          title="Connections"
          description="Each connection is optional. You can see what it reads, choose when it syncs, and revoke access without deleting your work."
          actions={<Button variant="secondary" onClick={refreshAll}><RefreshCw size={15} aria-hidden="true" />Refresh</Button>}
        />
      )}

      {/* 1 — the outcome most people came for, full width and first. */}
      <ConnectionGroup title="Use Continuum from Claude" summary="Keep one memory of your work, and reach it from the assistant you already use.">
        {connectionsPending ? <ConnectionCardSkeleton featured /> : null}
        {connections.status === "error" ? (
          <ConnectionCardError title="Claude" message={connections.error ?? ""} onRetry={() => void reloadConnections()} />
        ) : null}
        {status ? (
          <ConnectionCard
            id="claude"
            featured
            icon={<Sparkles size={19} />}
            title="Claude"
            outcome="Ask Claude about your Continuum work. It can read your goals, sources, and decisions, and propose changes you approve here."
            status={claudeStatus}
          >
            <div className="permission-columns">
              <div>
                <h3>What it can read</h3>
                <ul>{CLAUDE_CAN_READ.map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
              <div>
                <h3>What it can propose</h3>
                <ul>{CLAUDE_CAN_ADD.map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
              <div className="permission-never">
                <h3>What it can never do</h3>
                <ul>{CLAUDE_CAN_NEVER.map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
            </div>

            <div className="connection-actions">
              <Button variant="primary" disabled={!status.mcp.endpoint} onClick={() => { setClaudeTest(undefined); setClaudeOpen(true); }}>
                <Link2 size={15} aria-hidden="true" />{status.mcp.connections.length ? "Connect another client" : "Connect Claude"}
              </Button>
            </div>

            {status.mcp.connections.map((connection) => (
              <div className="connected-client" key={connection.clientId}>
                <div>
                  <strong>{connection.name}</strong>
                  <ul>{scopeSentences(connection.scopes).map((line) => <li key={line}>{line}</li>)}</ul>
                  <small>{connection.lastUsedAt ? `Last used ${dateLabel(connection.lastUsedAt)}` : `Connected ${dateLabel(connection.connectedAt)}`}</small>
                </div>
                <Button
                  variant="danger"
                  onClick={() => setConfirmRequest({
                    title: `Disconnect ${connection.name}?`,
                    description: `${connection.name} loses access to your Continuum work immediately. Nothing you saved is deleted, and you can reconnect at any time.`,
                    confirmLabel: "Disconnect",
                    run: async () => {
                      await post("/api/integrations", { action: "revoke_mcp_client", clientId: connection.clientId }, connection.clientId);
                      await reloadConnections();
                      showToast("Claude no longer has access.");
                    },
                  })}
                >
                  Disconnect
                </Button>
              </div>
            ))}

            <details className="connection-advanced">
              <summary>Advanced</summary>
              <Field label="Connector address" hint="Paste this into Claude's custom-connector dialog. It is not a secret, and it never carries your password.">
                {({ id, describedBy }) => (
                  <div className="copy-row">
                    <Input id={id} aria-describedby={describedBy} readOnly value={status.mcp.endpoint || "Loading…"} />
                    <Button variant="secondary" disabled={!status.mcp.endpoint} onClick={() => void copy(status.mcp.endpoint, "Connector address")}>
                      <Clipboard size={14} aria-hidden="true" />Copy
                    </Button>
                  </div>
                )}
              </Field>
            </details>
          </ConnectionCard>
        ) : null}
      </ConnectionGroup>

      {/* 2 — reading. */}
      <ConnectionGroup title="Bring in your reading" summary="Papers you already keep elsewhere become searchable alongside everything else.">
        {connectionsPending ? <ConnectionCardSkeleton /> : null}
        {status ? (
          <ConnectionCard
            id="zotero"
            icon={<Library size={19} />}
            title="Zotero"
            outcome="Find the right paper from your own library again, months later, by what it said."
            status={zoteroStatus}
            detail={status.zotero.connected ? `${status.zotero.username ?? "Private library"} · last sync ${dateLabel(status.zotero.lastSyncAt)}` : undefined}
          >
            {status.zotero.connected ? (
              <div className="connection-actions">
                <LoadingButton
                  variant="primary"
                  loading={busy === "zotero-sync"}
                  loadingLabel="Syncing…"
                  onClick={async () => {
                    const result = await post("/api/connections/zotero", { action: "sync" }, "zotero-sync");
                    if (!result) return;
                    await reloadConnections();
                    showToast(result.hasMore
                      ? `${result.indexed ?? 0} items indexed. ${result.remaining ?? 0} remain; sync again to continue.`
                      : `Zotero sync complete: ${result.indexed ?? 0} changed items indexed.`);
                  }}
                >
                  <RefreshCw size={15} aria-hidden="true" />Sync library
                </LoadingButton>
                <Button
                  variant="danger"
                  onClick={() => setConfirmRequest({
                    title: "Disconnect Zotero?",
                    description: "Source details already indexed stay in Continuum until you delete them from Library.",
                    confirmLabel: "Disconnect Zotero",
                    run: async () => { await post("/api/connections/zotero", { action: "disconnect" }, "zotero-disconnect"); await reloadConnections(); },
                  })}
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <div className="connection-actions">
                <Button variant="primary" disabled={!status.zotero.available} onClick={() => { setZoteroTest(undefined); setZoteroOpen(true); }}>
                  <KeyRound size={15} aria-hidden="true" />Connect Zotero
                </Button>
              </div>
            )}
          </ConnectionCard>
        ) : null}

        {/* Uploading is not a connection — it is something you do in Library. It
            appears here only because this is where people look for it. */}
        <ConnectionCard
          icon={<Upload size={19} />}
          title="Your own files"
          outcome="Upload a PDF or a document and ask questions answered from its exact passages."
          status={CONNECTION_STATUS.WORKING_NO_SETUP}
          detail="Nothing to set up. Uploading happens in Library, where your sources live."
        >
          <div className="connection-actions">
            <Link className="button button-secondary" href="/library">Open Library</Link>
          </div>
        </ConnectionCard>
      </ConnectionGroup>

      {/* 3 — notes. */}
      <ConnectionGroup title="Work from your notes" summary="Keep writing in Obsidian; Continuum reads the folder you choose and writes back only what you approve.">
        {connectionsPending ? <ConnectionCardSkeleton /> : null}
        {obsidian.status === "error" && status?.obsidian.tokens.length ? (
          <Banner tone="warning" title="Sync status is unavailable">{obsidian.error}</Banner>
        ) : null}
        {status ? (
          <ConnectionCard
            id="obsidian"
            icon={<BookOpen size={19} />}
            title="Obsidian"
            outcome="Two-way Markdown sync for one folder, with conflicts surfaced instead of silently overwritten."
            status={obsidianStatus}
          >
            <div className="connection-actions">
              <Button variant="primary" disabled={!status.obsidian.available} onClick={() => setObsidianOpen(true)}>
                <KeyRound size={15} aria-hidden="true" />{status.obsidian.tokens.length ? "Pair another vault" : "Set up Obsidian"}
              </Button>
              {status.obsidian.tokens.length ? (
                <Button
                  variant="secondary"
                  disabled={busy.startsWith("obsidian-")}
                  onClick={() => void obsidianAction(
                    { action: "set_paused", paused: !dashboard?.paused },
                    dashboard?.paused ? "Sync resumed. Queued changes are still here." : "Sync paused. Queued changes will wait.",
                  )}
                >
                  {dashboard?.paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
                  {dashboard?.paused ? "Resume sync" : "Pause sync"}
                </Button>
              ) : null}
              {pendingOperations.some((operation) => ["retry", "error", "syncing"].includes(operation.status)) ? (
                <Button variant="secondary" disabled={busy.startsWith("obsidian-")} onClick={() => void obsidianAction({ action: "retry" }, "Failed writes are queued to retry.")}>
                  <RefreshCw size={14} aria-hidden="true" />Retry failed
                </Button>
              ) : null}
            </div>

            {dashboard ? (
              <dl className="sync-health" aria-label="Obsidian sync health">
                <div><dt>Tracked notes</dt><dd>{dashboard.records.length}</dd></div>
                <div><dt>Pending</dt><dd>{pendingOperations.length}</dd></div>
                <div><dt>Acknowledged</dt><dd>{acknowledgedOperations.length}</dd></div>
                <div><dt>Conflicts</dt><dd>{openConflicts.length}</dd></div>
              </dl>
            ) : null}

            {openConflicts.map((conflict) => {
              const record = dashboard?.records.find((candidate) => candidate.sync_id === conflict.sync_id);
              return (
                <article className="sync-conflict" key={conflict.id}>
                  <header>
                    <AlertTriangle size={16} aria-hidden="true" />
                    <div>
                      <strong>{record?.title ?? "A synced note needs review"}</strong>
                      <small>Continuum and Obsidian both changed after their common base.</small>
                    </div>
                  </header>
                  <details>
                    <summary>Compare versions</summary>
                    <div className="sync-conflict-compare">
                      <section><strong>Continuum · {conflict.server_path}</strong><pre>{conflict.server_content}</pre></section>
                      <section><strong>Obsidian · {conflict.local_path}</strong><pre>{conflict.local_content}</pre></section>
                    </div>
                  </details>
                  <div className="connection-actions">
                    <Button variant="secondary" disabled={busy.startsWith("obsidian-")} onClick={() => void obsidianAction({ action: "resolve_conflict", conflictId: conflict.id, resolution: "use_continuum" }, "Continuum’s version was queued for the vault.")}>Use Continuum</Button>
                    <Button variant="secondary" disabled={busy.startsWith("obsidian-")} onClick={() => void obsidianAction({ action: "resolve_conflict", conflictId: conflict.id, resolution: "use_obsidian" }, "Obsidian’s version was accepted.")}>Use Obsidian</Button>
                    <Button variant="secondary" disabled={busy.startsWith("obsidian-")} onClick={() => void obsidianAction({ action: "resolve_conflict", conflictId: conflict.id, resolution: "duplicate_both" }, "Both versions were kept as separate notes.")}>Keep both</Button>
                  </div>
                </article>
              );
            })}

            {dashboard?.operations.length ? (
              <details className="connection-advanced">
                <summary>Recent sync activity</summary>
                <div className="sync-activity">
                  {dashboard.operations.slice(0, 12).map((operation) => {
                    const record = dashboard.records.find((candidate) => candidate.sync_id === operation.sync_id);
                    return (
                      <div key={operation.id}>
                        <span><strong>{record?.title ?? operation.operation_type}</strong><small>{operation.operation_type} · {dateLabel(operation.updated_at)}</small></span>
                        <Badge tone={operation.status === "completed" ? "green" : operation.status === "conflict" || operation.latest_error ? "orange" : "neutral"}>
                          {operation.status === "completed" && operation.bridge_acknowledged_at ? "acknowledged" : operation.status}
                        </Badge>
                        {operation.latest_error ? <p>{operation.latest_error}</p> : null}
                      </div>
                    );
                  })}
                </div>
              </details>
            ) : null}

            {status.obsidian.tokens.map((token) => (
              <div className="connected-client" key={token.id}>
                <div>
                  <strong>{token.name}</strong>
                  <ul><li>Read the documents you selected</li><li>Write back the memory updates you approved</li></ul>
                  <small>{token.lastUsedAt ? `Last used ${dateLabel(token.lastUsedAt)}` : `Created ${dateLabel(token.createdAt)}`}</small>
                </div>
                <Button
                  variant="danger"
                  onClick={() => setConfirmRequest({
                    title: `Revoke ${token.name}?`,
                    description: "The plugin using this token stops syncing straight away. Notes already in your vault are untouched.",
                    confirmLabel: "Revoke token",
                    run: async () => { await post("/api/integrations", { action: "revoke_integration_token", tokenId: token.id }, token.id); await reloadConnections(); },
                  })}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </ConnectionCard>
        ) : null}
      </ConnectionGroup>

      {/* 4 — local AI, collapsed: a minority need that used to sit level with Claude. */}
      <ConnectionGroup collapsed title="Run AI on your own machine" summary="Optional. Coding help from a model on your computer instead of Continuum’s.">
        <OllamaCard ollama={ollama} onOpen={() => setOllamaOpen(true)} />
      </ConnectionGroup>

      {/* 5 — personal keys, collapsed: an upgrade, not a requirement. */}
      <ConnectionGroup collapsed title="Advanced — your own API keys" summary="Only for higher limits or features Continuum cannot supply a key for. Nothing here is required.">
        {credentialsPending ? <><ConnectionCardSkeleton /><ConnectionCardSkeleton /></> : null}
        {credentials.status === "error" ? (
          <ConnectionCardError title="Your saved keys" message={credentials.error ?? ""} onRetry={() => void reloadCredentials()} />
        ) : null}
        {credentials.data ? (
          <>
            <ConnectionCard
              icon={<Library size={19} />}
              title="OpenAlex"
              outcome="OpenAlex works without a key. Add one only for higher rate limits."
              status={openAlexStatus}
              detail={openAlexCredential
                ? `${openAlexCredential.masked} · ${openAlexCredential.problem ?? `last checked ${dateLabel(openAlexCredential.lastValidatedAt)}`}`
                : "Scholarly search is already answering your searches through OpenAlex’s open pool."}
            >
              <div className="connection-actions">
                <Button variant={openAlexCredential ? "primary" : "secondary"} onClick={() => { setOpenAlexTest(undefined); setOpenAlexOpen(true); }}>
                  <KeyRound size={15} aria-hidden="true" />{openAlexCredential ? "Manage key" : "Add a key for higher limits"}
                </Button>
              </div>
            </ConnectionCard>

            <ConnectionCard
              icon={<Video size={19} />}
              title="YouTube"
              outcome="Add a YouTube key to search videos inside Learn."
              status={youtubeStatus}
              detail={youtubeCredential
                ? `${youtubeCredential.masked} · ${youtubeCredential.problem ?? `last checked ${dateLabel(youtubeCredential.lastValidatedAt)}`}`
                : "Public search only. Continuum never reads your account, subscriptions, playlists, or watch history."}
            >
              <div className="connection-actions">
                <Button variant="primary" onClick={() => { setYouTubeTest(undefined); setYouTubeOpen(true); }}>
                  <KeyRound size={15} aria-hidden="true" />{youtubeCredential ? "Manage key" : "Connect YouTube"}
                </Button>
              </div>
            </ConnectionCard>
          </>
        ) : null}
      </ConnectionGroup>

      {/* NotebookLM is not a connection and never was — there is no account API to
          connect to. It is an export, and §9.10 moves it off this page.
          TODO(library): fold this into Library's export menu (feature #97) and
          delete this block; the Library export surface is out of scope here. */}
      <section className="connection-group export-elsewhere" aria-label="Export elsewhere">
        <header>
          <h2>Export elsewhere</h2>
          <p>Not a connection. Continuum builds a source pack you choose what to do with.</p>
        </header>
        <div className="connection-actions">
          <a className="button button-secondary" href="/api/connections/notebooklm/export"><Download size={15} aria-hidden="true" />Download a source pack</a>
          <a className="button button-secondary" href="/api/connections/notebooklm/export?format=citations"><Download size={15} aria-hidden="true" />Export citations</a>
          <a className="button button-quiet" href={links.notebooklm} target="_blank" rel="noreferrer">Open NotebookLM<ExternalLink size={14} aria-hidden="true" /></a>
          <a className="button button-quiet" href={links.notebookHelp} target="_blank" rel="noreferrer">How to add a source<ExternalLink size={14} aria-hidden="true" /></a>
        </div>
      </section>

      {/* --- Dialogs ---------------------------------------------------------- */}

      <Modal
        open={claudeOpen}
        onOpenChange={setClaudeOpen}
        title="Connect Claude to Continuum"
        description="Claude opens Continuum’s approval page and receives only the permissions you tick there. No API key is involved."
        footer={
          <>
            <Button variant="secondary" onClick={() => setClaudeOpen(false)}>Close</Button>
            <Button variant="primary" disabled={!status?.mcp.endpoint} onClick={() => void copy(status?.mcp.endpoint ?? "", "Connector address")}>
              <Clipboard size={14} aria-hidden="true" />Copy connector address
            </Button>
          </>
        }
      >
        <div className="setup-body">
          <SetupSteps
            steps={status?.mcp.claude.instructions ?? [
              "In Claude, open Customize → Connectors.",
              "Choose Add custom connector.",
              "Paste the Continuum connector address.",
              "Sign in to Continuum and review the permissions.",
            ]}
            links={[{ label: "Claude’s connector guide", href: links.claude }]}
          />
          <Field label="Connector address">
            {({ id }) => (
              <div className="copy-row">
                <Input id={id} readOnly value={status?.mcp.endpoint ?? "Loading connector address…"} />
                <Button variant="secondary" disabled={!status?.mcp.endpoint} onClick={() => void copy(status?.mcp.endpoint ?? "", "Connector address")}>Copy</Button>
              </div>
            )}
          </Field>
          <TestConnection onTest={() => void testClaudeConnector()} busy={busy === "claude-test"} result={claudeTest} label="Test connector" />
          <p className="setup-privacy">
            Continuum records which client is connected, what it was granted, and when it last used its access. Tokens are short-lived or revocable, and the connector never receives your password.
          </p>
        </div>
      </Modal>

      <SetupDialog
        open={zoteroOpen}
        onOpenChange={(open) => { setZoteroOpen(open); if (!open) { setZoteroKey(""); setZoteroTest(undefined); } }}
        title="Connect your Zotero library"
        description="A read-only key lets Continuum index the citation details and abstracts you choose to sync."
        formId="zotero-form"
        dirty={Boolean(zoteroKey)}
        dirtyMessage="Close without saving? The Zotero key you entered will be discarded."
        testPassed={Boolean(zoteroTest?.ok)}
        testAttempted={Boolean(zoteroTest)}
        saving={busy === "zotero-connect"}
        saveLabel="Save connection"
      >
        <form id="zotero-form" className="setup-body" onSubmit={(event) => void connectZotero(event)}>
          <SetupSteps
            steps={[
              "Open Zotero’s key page and create a key named Continuum.",
              "Allow personal-library read access. Leave write access off — Continuum only reads.",
              "Copy the key and paste it below.",
              "Test it, then save. Files and PDFs are never imported automatically.",
            ]}
            links={[{ label: "Create a Zotero key", href: links.zoteroKey }, { label: "Zotero Web API guide", href: links.zoteroApi }]}
          />
          <SecretField
            label="Zotero private key"
            hint="Stored encrypted. Continuum never shows it again after saving."
            value={zoteroKey}
            onChange={(value) => { setZoteroKey(value); setZoteroTest(undefined); }}
            placeholder="Paste your read-only Zotero key"
            minLength={16}
            maxLength={256}
            autoFocus
          />
          <TestConnection onTest={() => void testZotero()} busy={busy === "zotero-test"} disabled={zoteroKey.trim().length < 16} result={zoteroTest} />
        </form>
      </SetupDialog>

      <Modal
        open={obsidianOpen}
        onOpenChange={(open) => { setObsidianOpen(open); if (!open) setObsidianToken(""); }}
        title="Pair an Obsidian vault"
        description="A one-time token lets the Continuum Sync plugin exchange only the folder and note actions you approve."
        footer={
          <>
            <Button variant="secondary" onClick={() => setObsidianOpen(false)}>{obsidianToken ? "Done" : "Cancel"}</Button>
            {obsidianToken ? null : (
              <LoadingButton
                variant="primary"
                loading={busy === "obsidian-token"}
                loadingLabel="Creating token…"
                onClick={async () => {
                  const result = await post("/api/integrations", { action: "create_obsidian_token", name: "My Obsidian vault" }, "obsidian-token");
                  if (result) await reloadConnections();
                }}
              >
                <KeyRound size={15} aria-hidden="true" />Create vault token
              </LoadingButton>
            )}
          </>
        }
      >
        <div className="setup-body">
          <SetupSteps
            steps={[
              "Install the Continuum Sync plugin files into the vault you want to use.",
              "Review and enable it under Settings → Community plugins.",
              "Create a token below, copy it immediately, and paste it into the plugin.",
              "Choose one folder and run a manual sync before turning on automatic sync.",
            ]}
            links={[{ label: "Obsidian plugin guide", href: links.obsidian }, { label: "Plugin security guide", href: links.obsidianSecurity }]}
          />
          {obsidianToken ? (
            <div className="one-time-token" role="status">
              <header>
                <strong>Copy this token now</strong>
                <button type="button" onClick={() => setObsidianToken("")} aria-label="Hide token"><X size={14} aria-hidden="true" /></button>
              </header>
              <code>{obsidianToken}</code>
              <Button variant="secondary" onClick={() => void copy(obsidianToken, "Vault token")}><Clipboard size={14} aria-hidden="true" />Copy</Button>
              <small>Only its hash is stored. Continuum cannot show this token again.</small>
            </div>
          ) : null}
          <p className="setup-privacy">The token reads the documents you select and writes the memory updates you approve. Revoke it here at any time.</p>
        </div>
      </Modal>

      <SetupDialog
        open={openAlexOpen}
        onOpenChange={(open) => { setOpenAlexOpen(open); if (!open) { setOpenAlexKey(""); setOpenAlexPassword(""); setOpenAlexTest(undefined); } }}
        title={openAlexCredential ? "Manage your OpenAlex key" : "Add an OpenAlex key"}
        description="Search already works without this. A free key raises your rate limit during heavy searching."
        formId="openalex-form"
        dirty={Boolean(openAlexKey || openAlexPassword)}
        dirtyMessage="Close without saving? The key and password you entered will be discarded."
        testPassed={Boolean(openAlexTest?.ok)}
        testAttempted={Boolean(openAlexTest)}
        blocked={Boolean(openAlexCredential && !openAlexPassword)}
        saving={busy === "openalex-save"}
        saveLabel="Save key"
        secondaryAction={openAlexCredential
          ? <Button variant="danger" disabled={busy.startsWith("openalex-")} onClick={() => disconnectCredential("openalex")}>Disconnect</Button>
          : undefined}
      >
        <form id="openalex-form" className="setup-body" onSubmit={(event) => void saveCredential(event, "openalex")}>
          <SetupSteps
            steps={[
              "Skip this entirely unless you are hitting rate limits — search works without a key.",
              "Open your OpenAlex settings and copy your free API key.",
              "Paste it below. No OAuth app, client secret, or redirect URL is involved.",
              "Test it live, then save it encrypted to your account.",
            ]}
            links={[{ label: "OpenAlex API key settings", href: links.openAlexKey }, { label: "Authentication guide", href: links.openAlexAuth }]}
          />
          <SecretField
            label={openAlexCredential ? "Replacement OpenAlex key" : "OpenAlex API key"}
            hint="Only public scholarly searches are sent to OpenAlex. Your notes and password never are."
            value={openAlexKey}
            onChange={(value) => { setOpenAlexKey(value); setOpenAlexTest(undefined); }}
            placeholder="Paste your OpenAlex API key"
            minLength={8}
            maxLength={2000}
            autoFocus
          />
          <TestConnection onTest={() => void testCredential("openalex", openAlexKey)} busy={busy === "openalex-test"} disabled={openAlexKey.trim().length < 8} result={openAlexTest} />
          {openAlexCredential ? (
            <Field label="Current Continuum password" hint="Required before replacing or removing a saved key.">
              {({ id, describedBy }) => (
                <Input id={id} aria-describedby={describedBy} type="password" autoComplete="current-password" value={openAlexPassword} onChange={(event) => setOpenAlexPassword(event.target.value)} />
              )}
            </Field>
          ) : null}
          <p className="setup-privacy">After saving, only the last four characters are ever shown. The key is encrypted before storage and excluded from account exports.</p>
        </form>
      </SetupDialog>

      <SetupDialog
        open={youtubeOpen}
        onOpenChange={(open) => { setYouTubeOpen(open); if (!open) { setYouTubeKey(""); setYouTubePassword(""); setYouTubeTest(undefined); } }}
        title={youtubeCredential ? "Manage your YouTube key" : "Connect YouTube video search"}
        description="One API key enables public learning-video search in Learn. Continuum never touches your YouTube account."
        formId="youtube-form"
        dirty={Boolean(youtubeKey || youtubePassword)}
        dirtyMessage="Close without saving? The key and password you entered will be discarded."
        testPassed={Boolean(youtubeTest?.ok)}
        testAttempted={Boolean(youtubeTest)}
        blocked={Boolean(youtubeCredential && !youtubePassword)}
        saving={busy === "youtube-save"}
        saveLabel="Save key"
        secondaryAction={youtubeCredential
          ? <Button variant="danger" disabled={busy.startsWith("youtube-")} onClick={() => disconnectCredential("youtube")}>Disconnect</Button>
          : undefined}
      >
        <form id="youtube-form" className="setup-body" onSubmit={(event) => void saveCredential(event, "youtube")}>
          <SetupSteps
            steps={[
              "Create or select a Google Cloud project.",
              "Enable YouTube Data API v3 for that project.",
              "Create an API key under APIs & Services → Credentials.",
              "Restrict the key to YouTube Data API v3, then paste and test it here. Do not create an OAuth client.",
            ]}
            links={[
              { label: "Enable YouTube Data API v3", href: links.youtubeEnable },
              { label: "Create an API key", href: links.youtubeConsole },
              { label: "Getting-started guide", href: links.youtubeDocs },
            ]}
          />
          <SecretField
            label={youtubeCredential ? "Replacement YouTube key" : "YouTube Data API key"}
            hint="Only your search terms and public filters are sent. Continuum never reads your account."
            value={youtubeKey}
            onChange={(value) => { setYouTubeKey(value); setYouTubeTest(undefined); }}
            placeholder="Paste your restricted YouTube API key"
            minLength={8}
            maxLength={2000}
            autoFocus
          />
          <TestConnection onTest={() => void testCredential("youtube", youtubeKey)} busy={busy === "youtube-test"} disabled={youtubeKey.trim().length < 8} result={youtubeTest} />
          {youtubeCredential ? (
            <Field label="Current Continuum password" hint="Required before replacing or removing a saved key.">
              {({ id, describedBy }) => (
                <Input id={id} aria-describedby={describedBy} type="password" autoComplete="current-password" value={youtubePassword} onChange={(event) => setYouTubePassword(event.target.value)} />
              )}
            </Field>
          ) : null}
          <p className="setup-privacy">Restrict the key to YouTube Data API v3 in Google Cloud. It is encrypted before storage and excluded from account exports.</p>
        </form>
      </SetupDialog>

      <OllamaDialog open={ollamaOpen} onOpenChange={setOllamaOpen} ollama={ollama} />

      <ConfirmationDialog
        open={Boolean(confirmRequest)}
        onOpenChange={(open) => { if (!open) setConfirmRequest(undefined); }}
        title={confirmRequest?.title ?? ""}
        description={confirmRequest?.description ?? ""}
        confirmLabel={confirmRequest?.confirmLabel ?? "Confirm"}
        destructive
        busy={Boolean(busy)}
        onConfirm={() => { const request = confirmRequest; setConfirmRequest(undefined); void request?.run(); }}
      />
    </div>
  );
}
