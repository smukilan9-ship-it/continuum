"use client";

import { AlertTriangle, BookOpen, Check, ChevronDown, Clipboard, Download, ExternalLink, Eye, EyeOff, KeyRound, Laptop, Library, Link2, LoaderCircle, Pause, Play, RefreshCw, ShieldCheck, Unplug, Video, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Badge, Button, ConfirmationDialog, LoadingButton, Modal } from "@/components/ui";
import { PageHeader } from "@/components/workspace/page-header";

type Status = {
  mcp: { endpoint: string; status: string; connections: Array<{ clientId: string; name: string; scopes: string[]; connectedAt: string; lastUsedAt?: string; calls: number }>; claude: { instructions: string[] } };
  zotero: { connected: boolean; available: boolean; username?: string; lastSyncAt?: string; scopes: string[] };
  notebooklm: { mode: "source_pack"; accountConnectionAvailable: false };
  obsidian: { available: boolean; tokens: Array<{ id: string; name: string; scopes: string[]; lastUsedAt?: string; expiresAt?: string; createdAt: string }> };
};

type Toast = (message: string | null) => void;
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

const links = {
  claude: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
  zoteroKey: "https://www.zotero.org/settings/keys/new",
  zoteroApi: "https://www.zotero.org/support/dev/web_api/v3/start",
  notebooklm: "https://notebooklm.google.com/",
  notebookHelp: "https://support.google.com/notebooklm/answer/14278184",
  obsidian: "https://obsidian.md/help/community-plugins",
  obsidianSecurity: "https://obsidian.md/help/Extending%2BObsidian/Plugin%2Bsecurity",
  ollama: "https://ollama.com/download",
  ollamaApi: "https://docs.ollama.com/api/introduction",
  openAlexKey: "https://openalex.org/settings/api",
  openAlexAuth: "https://developers.openalex.org/guides/authentication",
  youtubeConsole: "https://console.cloud.google.com/apis/credentials",
  youtubeEnable: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
  youtubeDocs: "https://developers.google.com/youtube/v3/getting-started",
};

/**
 * One row per integration, expanded on click.
 *
 * Every card used to render fully expanded at once, producing a page several
 * screens long in which nothing stood out. Connected integrations open by
 * default because that is where the controls you came for live.
 */
function ConnectionCard({ id, icon, title, status, connected, description, children }: { id?: string; icon: ReactNode; title: string; status: string; connected?: boolean; description: string; children: ReactNode }) {
  return (
    <details className="connection-card" id={id} open={connected}>
      <summary className="connection-card-head">
        <span className="connection-mark">{icon}</span>
        <div><h2>{title}</h2><p>{description}</p></div>
        <Badge tone={connected ? "green" : "neutral"}>{connected ? <Check size={12} aria-hidden="true" /> : null}{status}</Badge>
        <ChevronDown className="connection-card-chevron" size={17} aria-hidden="true" />
      </summary>
      <div className="connection-card-body">{children}</div>
    </details>
  );
}

function Guide({ title, steps, official }: { title: string; steps: string[]; official: Array<{ label: string; href: string }> }) {
  return (
    <details className="connection-guide">
      <summary><span>{title}</span><ChevronDown size={16} /></summary>
      <ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol>
      <div className="official-links">{official.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label}<ExternalLink size={13} /></a>)}</div>
    </details>
  );
}

function dateLabel(value?: string) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not synced yet";
}

function isSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  return /Safari/i.test(navigator.userAgent) && !/(Chrome|Chromium|CriOS|Edg|OPR)/i.test(navigator.userAgent);
}

export function IntegrationsScreen({ showToast }: { showToast: Toast }) {
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [zoteroKey, setZoteroKey] = useState("");
  const [zoteroOpen, setZoteroOpen] = useState(false);
  const [zoteroStep, setZoteroStep] = useState<1 | 2>(1);
  const [zoteroTest, setZoteroTest] = useState<{ ok: boolean; message: string }>();
  const [showZoteroKey, setShowZoteroKey] = useState(false);
  const [obsidianOpen, setObsidianOpen] = useState(false);
  const [obsidianToken, setObsidianToken] = useState("");
  const [obsidianDashboard, setObsidianDashboard] = useState<ObsidianDashboard>();
  const [ollamaUrl, setOllamaUrl] = useState("http://127.0.0.1:11434");
  const [ollamaState, setOllamaState] = useState<{
    reachable: boolean;
    testPassed: boolean;
    models: Array<{ name: string; size: number }>;
    latencyMs?: number;
    firstTokenMs?: number;
    testedModel?: string;
    code?: "not_running" | "connection_blocked" | "request_timed_out" | "incompatible_endpoint" | "model_unavailable" | "invalid_response";
    message?: string;
  }>();
  const [ollamaModel, setOllamaModel] = useState("");
  const [ollamaOpen, setOllamaOpen] = useState(false);
  const [claudeOpen, setClaudeOpen] = useState(false);
  const [claudeTest, setClaudeTest] = useState<{ ok: boolean; message: string }>();
  const [openAlexCredential, setOpenAlexCredential] = useState<ServiceCredential>();
  const [openAlexOpen, setOpenAlexOpen] = useState(false);
  const [openAlexKey, setOpenAlexKey] = useState("");
  const [openAlexPassword, setOpenAlexPassword] = useState("");
  const [showOpenAlexKey, setShowOpenAlexKey] = useState(false);
  const [openAlexTest, setOpenAlexTest] = useState<{ ok: boolean; message: string }>();
  const [youtubeCredential, setYouTubeCredential] = useState<ServiceCredential>();
  const [youtubeOpen, setYouTubeOpen] = useState(false);
  const [youtubeKey, setYouTubeKey] = useState("");
  const [youtubePassword, setYouTubePassword] = useState("");
  const [showYouTubeKey, setShowYouTubeKey] = useState(false);
  const [youtubeTest, setYouTubeTest] = useState<{ ok: boolean; message: string }>();
  // Every destructive confirmation on this screen goes through the app's own
  // dialog. Native `window.confirm` is unstyled, untestable, and suppressed in
  // some embedded contexts.
  const [confirmRequest, setConfirmRequest] = useState<{ title: string; description: string; confirmLabel: string; run: () => void | Promise<void> }>();

  const refresh = useCallback(async () => {
    setError("");
    const [connectionsResult, obsidianResult, credentialsResult] = await Promise.allSettled([
      fetch("/api/integrations", { cache: "no-store" }),
      fetch("/api/integrations/obsidian", { cache: "no-store" }),
      fetch("/api/integrations/credentials", { cache: "no-store" }),
    ]);
    if (connectionsResult.status === "fulfilled") {
      try {
        const payload = await connectionsResult.value.json() as Status & { error?: string };
        if (connectionsResult.value.ok) setStatus(payload);
        else setError(payload.error ?? "Connections are unavailable");
      } catch {
        setError("Connections are temporarily unavailable. Provider settings remain safe and usable.");
      }
    } else setError("Connections are unavailable");
    if (obsidianResult.status === "fulfilled" && obsidianResult.value.ok) {
      setObsidianDashboard(await obsidianResult.value.json() as ObsidianDashboard);
    }
    if (credentialsResult.status === "fulfilled" && credentialsResult.value.ok) {
      const payload = await credentialsResult.value.json() as { configured?: ServiceCredential[] };
      setOpenAlexCredential(payload.configured?.find((credential) => credential.provider === "openalex"));
      setYouTubeCredential(payload.configured?.find((credential) => credential.provider === "youtube"));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const saved = window.localStorage.getItem("continuum_ollama_url");
    if (saved) setOllamaUrl(saved);
    setOllamaModel(window.localStorage.getItem("continuum_ollama_model") ?? "");
    const query = new URLSearchParams(window.location.search);
    if (query.get("connection") === "claude") showToast("Claude connected. Its approved permissions are shown below.");
    if (query.get("connection") === "cancelled") showToast("Claude was not connected. No permissions were granted.");
  }, [refresh, showToast]);

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); showToast(`${label} copied.`); }
    catch { showToast(`Could not copy ${label.toLowerCase()}. Select it manually.`); }
  }

  async function copyNotebookQuery() {
    setBusy("notebook-query");
    try {
      const response = await fetch("/api/connections/notebooklm/export?format=query", { cache: "no-store" });
      if (!response.ok) throw new Error("The prepared query is unavailable");
      await copy(await response.text(), "Prepared research query");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "The prepared query is unavailable");
    } finally {
      setBusy("");
    }
  }

  async function action(path: string, body: Record<string, unknown> | undefined, key: string) {
    setBusy(key);
    try {
      const response = await fetch(path, { method: "POST", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const payload = await response.json() as { error?: string; token?: string; imported?: number; exported?: number; indexed?: number; remaining?: number; hasMore?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "The connection could not be updated");
      if (payload.token) setObsidianToken(payload.token);
      await refresh();
      return payload;
    } catch (cause) { showToast(cause instanceof Error ? cause.message : "The connection could not be updated"); }
    finally { setBusy(""); }
  }

  async function obsidianAction(body: Record<string, unknown>, success: string) {
    const result = await action("/api/integrations/obsidian", body, `obsidian-${String(body.action)}`);
    if (result) showToast(success);
  }

  async function connectZotero(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await action("/api/connections/zotero", { action: "connect", apiKey: zoteroKey }, "zotero-connect");
    if (result) {
      setZoteroKey("");
      setZoteroTest(undefined);
      setZoteroStep(1);
      setZoteroOpen(false);
      showToast("Zotero connected. Run the first library sync when ready.");
    }
  }

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
      const result = response.ok
        ? { ok: true, message: payload.message ?? "Zotero accepted this key. It has not been saved yet." }
        : { ok: false, message: payload.error ?? "Zotero rejected this key. Confirm personal-library read access and try again." };
      setZoteroTest(result);
    } catch {
      setZoteroTest({ ok: false, message: "Continuum could not reach Zotero. Check your connection, then try again." });
    } finally {
      setBusy("");
    }
  }

  async function testOllama() {
    setBusy("ollama");
    const startedAt = performance.now();
    try {
      const url = new URL(ollamaUrl);
      if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Only a local Ollama address is allowed");
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Use an http:// or https:// local Ollama address");
      const response = await fetch(new URL("/api/tags", url), { signal: AbortSignal.timeout(6_000) });
      if (response.status === 404) {
        setOllamaState({ reachable: true, testPassed: false, models: [], code: "incompatible_endpoint", message: "This server does not expose Ollama’s /api/tags endpoint. Use the Ollama API address, usually http://127.0.0.1:11434." });
        return;
      }
      if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status} while listing models`);
      const payload = await response.json() as { models?: Array<{ name: string; size?: number }> };
      const models = (payload.models ?? []).map((model) => ({ name: model.name, size: model.size ?? 0 }));
      const current = models.find((model) => model.name === ollamaModel && model.size <= 8 * 1024 ** 3);
      const recommended = [...models].filter((model) => !model.size || model.size <= 8 * 1024 ** 3).sort((left, right) => left.size - right.size)[0];
      const selectedModel = current?.name ?? recommended?.name;
      setOllamaModel(selectedModel ?? models[0]?.name ?? "");
      if (!models.length) {
        setOllamaState({ reachable: true, testPassed: false, models, code: "model_unavailable", message: "Ollama is running, but no model is installed. Install a small model, then test again." });
        return;
      }
      if (!selectedModel) {
        setOllamaState({ reachable: true, testPassed: false, models, code: "model_unavailable", message: "The installed models are over Continuum’s 8 GB local-safety limit. Install or select a smaller model." });
        return;
      }

      const testStartedAt = performance.now();
      const testResponse = await fetch(new URL("/api/chat", url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          model: selectedModel,
          stream: true,
          think: false,
          options: { temperature: 0, num_ctx: 1024, num_predict: 8 },
          messages: [{ role: "user", content: "Reply with READY only." }],
        }),
      });
      if (testResponse.status === 404) {
        setOllamaState({ reachable: true, testPassed: false, models, code: "incompatible_endpoint", message: "Model listing works, but /api/chat is unavailable. Update Ollama and confirm this is its native API address." });
        return;
      }
      if (!testResponse.ok || !testResponse.body) {
        const modelMissing = testResponse.status === 400 || testResponse.status === 404;
        setOllamaState({
          reachable: true,
          testPassed: false,
          models,
          code: modelMissing ? "model_unavailable" : "invalid_response",
          message: modelMissing ? `Ollama could not load ${selectedModel}. Run the model once in Ollama, then test again.` : `Ollama returned HTTP ${testResponse.status} for the test request.`,
        });
        return;
      }
      const reader = testResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let output = "";
      let firstTokenMs: number | undefined;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const packet = JSON.parse(line) as { message?: { content?: string }; error?: string };
          if (packet.error) throw new Error(packet.error);
          if (packet.message?.content) {
            firstTokenMs ??= Math.round(performance.now() - testStartedAt);
            output += packet.message.content;
          }
        }
        if (done) break;
      }
      if (!output.trim()) {
        setOllamaState({ reachable: true, testPassed: false, models, code: "invalid_response", message: "Ollama streamed a response, but it contained no text. Try another installed model." });
        return;
      }
      const latencyMs = Math.round(performance.now() - testStartedAt);
      setOllamaState({ reachable: true, testPassed: true, models, latencyMs, firstTokenMs, testedModel: selectedModel, message: `Streaming test passed with ${selectedModel}.` });
      showToast(`Local AI is ready. The streaming test completed in ${(latencyMs / 1_000).toFixed(1)} seconds.`);
    } catch (cause) {
      const elapsed = performance.now() - startedAt;
      const timedOut = cause instanceof DOMException && (cause.name === "TimeoutError" || cause.name === "AbortError");
      const blocked = cause instanceof TypeError;
      const code = timedOut ? "request_timed_out" : blocked ? "connection_blocked" : elapsed < 1_500 ? "not_running" : "invalid_response";
      const message = timedOut
        ? "Ollama was reached but did not answer in 20 seconds. Start the selected model once in Ollama or choose a smaller model."
        : blocked
          ? isSafariBrowser()
            ? "Safari blocks an HTTPS Continuum page from calling Ollama’s HTTP loopback API. Ollama may be healthy; open Continuum in Chrome or Edge for local AI, then test again there."
            : "The browser blocked or could not reach the local API. Confirm Ollama is running, allow Continuum’s Local Network Access site permission, and include this exact Continuum origin in OLLAMA_ORIGINS."
          : cause instanceof Error ? cause.message : "Ollama is unavailable";
      setOllamaState({ reachable: false, testPassed: false, models: [], code, message });
      showToast(message);
    }
    finally { setBusy(""); }
  }

  function saveOllama() {
    if (!ollamaState?.testPassed || ollamaState.testedModel !== ollamaModel) return;
    const url = new URL(ollamaUrl);
    window.localStorage.setItem("continuum_ollama_url", url.origin);
    window.localStorage.setItem("continuum_ollama_model", ollamaModel);
    setOllamaOpen(false);
    showToast(`Local AI saved with ${ollamaModel}.`);
  }

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
      setClaudeTest({ ok: true, message: "OAuth discovery and the protected MCP address are responding correctly." });
    } catch (cause) {
      setClaudeTest({ ok: false, message: cause instanceof Error ? `Continuum could not verify the connector: ${cause.message}` : "Continuum could not verify the connector." });
    } finally { setBusy(""); }
  }

  async function testOpenAlex() {
    setBusy("openalex-test");
    setOpenAlexTest(undefined);
    try {
      const response = await fetch("/api/integrations/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "validate", provider: "openalex", secret: openAlexKey }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      const result = response.ok
        ? { ok: true, message: payload.message ?? "OpenAlex accepted this API key. It has not been saved yet." }
        : { ok: false, message: payload.error ?? "OpenAlex rejected this API key." };
      setOpenAlexTest(result);
    } catch {
      setOpenAlexTest({ ok: false, message: "Continuum could not reach OpenAlex. Check your connection and try again." });
    } finally {
      setBusy("");
    }
  }

  async function connectOpenAlex(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("openalex-connect");
    try {
      const response = await fetch("/api/integrations/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "configure",
          provider: "openalex",
          secret: openAlexKey,
          ...(openAlexCredential ? { currentPassword: openAlexPassword } : {}),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The OpenAlex key could not be saved.");
      setOpenAlexKey("");
      setOpenAlexPassword("");
      setOpenAlexTest(undefined);
      setOpenAlexOpen(false);
      await refresh();
      showToast(openAlexCredential ? "OpenAlex API key replaced." : "OpenAlex connected. Scholarly search is ready.");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "The OpenAlex key could not be saved.");
    } finally {
      setBusy("");
    }
  }

  function disconnectOpenAlex() {
    if (!openAlexPassword) {
      showToast("Enter your current Continuum password before disconnecting OpenAlex.");
      return;
    }
    setConfirmRequest({
      title: "Disconnect OpenAlex?",
      description: "Saved papers and entities stay in Continuum. Live scholarly search falls back to the deployment key, or to the unauthenticated public API.",
      confirmLabel: "Disconnect OpenAlex",
      run: () => performDisconnectOpenAlex(),
    });
  }

  async function performDisconnectOpenAlex() {
    setBusy("openalex-disconnect");
    try {
      const response = await fetch("/api/integrations/credentials", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "openalex", currentPassword: openAlexPassword }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "OpenAlex could not be disconnected.");
      setOpenAlexCredential(undefined);
      setOpenAlexPassword("");
      setOpenAlexKey("");
      setOpenAlexTest(undefined);
      setOpenAlexOpen(false);
      showToast("OpenAlex disconnected. Saved research was not deleted.");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "OpenAlex could not be disconnected.");
    } finally {
      setBusy("");
    }
  }

  async function testYouTube() {
    setBusy("youtube-test");
    setYouTubeTest(undefined);
    try {
      const response = await fetch("/api/integrations/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "validate", provider: "youtube", secret: youtubeKey }),
      });
      const payload = await response.json() as { error?: string; message?: string };
      setYouTubeTest(response.ok
        ? { ok: true, message: payload.message ?? "YouTube accepted this API key. It has not been saved yet." }
        : { ok: false, message: payload.error ?? "YouTube rejected this API key. Confirm the YouTube Data API v3 is enabled." });
    } catch {
      setYouTubeTest({ ok: false, message: "Continuum could not reach YouTube. Check your connection and try again." });
    } finally {
      setBusy("");
    }
  }

  async function connectYouTube(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("youtube-connect");
    try {
      const response = await fetch("/api/integrations/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "configure",
          provider: "youtube",
          secret: youtubeKey,
          ...(youtubeCredential ? { currentPassword: youtubePassword } : {}),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The YouTube API key could not be saved.");
      setYouTubeKey("");
      setYouTubePassword("");
      setYouTubeTest(undefined);
      setYouTubeOpen(false);
      await refresh();
      showToast(youtubeCredential ? "YouTube Data API key replaced." : "YouTube connected. Learning-video search is ready.");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "The YouTube API key could not be saved.");
    } finally {
      setBusy("");
    }
  }

  function disconnectYouTube() {
    if (!youtubePassword) {
      showToast("Enter your current Continuum password before disconnecting YouTube.");
      return;
    }
    setConfirmRequest({
      title: "Disconnect the YouTube Data API?",
      description: "Saved learning progress stays in Continuum. Live video search will use the deployment key only if one is available.",
      confirmLabel: "Disconnect YouTube",
      run: () => performDisconnectYouTube(),
    });
  }

  async function performDisconnectYouTube() {
    setBusy("youtube-disconnect");
    try {
      const response = await fetch("/api/integrations/credentials", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "youtube", currentPassword: youtubePassword }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "YouTube could not be disconnected.");
      setYouTubeCredential(undefined);
      setYouTubePassword("");
      setYouTubeKey("");
      setYouTubeTest(undefined);
      setYouTubeOpen(false);
      showToast("YouTube disconnected. Learning progress was not deleted.");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "YouTube could not be disconnected.");
    } finally {
      setBusy("");
    }
  }

  const openObsidianConflicts = obsidianDashboard?.conflicts.filter((conflict) => conflict.status === "open") ?? [];
  const pendingObsidianOperations = obsidianDashboard?.operations.filter((operation) => ["pending", "syncing", "retry", "error"].includes(operation.status)) ?? [];
  const acknowledgedObsidianOperations = obsidianDashboard?.operations.filter((operation) => operation.status === "completed" && operation.bridge_acknowledged_at) ?? [];

  return (
    <div className="screen connections-screen">
      <PageHeader
        title="Connections"
        description="Bring your academic context with you. Each connection is optional — you can see what it reads, choose when it syncs, and revoke access without deleting your work."
        actions={<Button className="button-secondary compact-button" onClick={() => void refresh()} disabled={busy === "refresh"}><RefreshCw size={15} aria-hidden="true" />Refresh</Button>}
      />
      {error ? <div className="inline-alert" role="alert"><Unplug size={17} /><span>{error}</span><button onClick={() => void refresh()}>Try again</button></div> : null}

      <section className="connection-section" aria-labelledby="assistants-title">
        <div className="section-heading"><div><h2 id="assistants-title">Assistants</h2></div><p>Claude retrieves only the relevant context it requests. It never receives a raw history dump.</p></div>
        <ConnectionCard id="claude" icon={<Link2 size={20} />} title="Claude" status={status?.mcp.connections.length ? "Connected" : "Ready to connect"} connected={Boolean(status?.mcp.connections.length)} description="Use your Continuum goals, projects, sources, decisions, progress, and schedule from Claude through remote MCP.">
          <div className="permission-line"><ShieldCheck size={15} /><span>OAuth sign-in · permission-scoped tools · consequential writes require approval</span></div>
          <div className="connection-actions"><Button className="button-primary" disabled={!status?.mcp.endpoint} onClick={() => { setClaudeTest(undefined); setClaudeOpen(true); }}><Link2 size={15} />Connect Claude</Button></div>
          <Guide title="Connect Claude in four steps" steps={status?.mcp.claude.instructions ?? ["Open Claude Customize → Connectors.", "Add a custom connector.", "Paste the Continuum connector URL.", "Sign in and review permissions."]} official={[{ label: "Claude's official connector guide", href: links.claude }]} />
          {status?.mcp.connections.map((connection) => <div className="connected-account" key={connection.clientId}><div><strong>{connection.name}</strong><span>{connection.scopes.map((scope) => scope.replace(":", " ")).join(" · ")}</span><small>{connection.lastUsedAt ? `Last used ${dateLabel(connection.lastUsedAt)}` : `Connected ${dateLabel(connection.connectedAt)}`}</small></div><button onClick={() => setConfirmRequest({ title: `Revoke ${connection.name}?`, description: `${connection.name} will immediately lose access to your Continuum context. Your data is unchanged and you can reconnect at any time.`, confirmLabel: "Revoke access", run: async () => { await action("/api/integrations", { action: "revoke_mcp_client", clientId: connection.clientId }, connection.clientId); showToast("Claude access revoked."); } })}>Revoke</button></div>)}
        </ConnectionCard>
      </section>

      <section className="connection-section" aria-labelledby="study-tools-title">
        <div className="section-heading"><div><h2 id="study-tools-title">Sources and notes</h2></div><p>Continuum’s planner uses its own editable schedule. These optional tools add research and note context.</p></div>
        <div className="connection-list">
          {/* Search works without a key through OpenAlex's polite pool, so the
              status has to describe whether the feature works — not whether a
              key was supplied. Reporting "Not connected" for a capability the
              user can already use reads as a broken integration. */}
          <ConnectionCard
            icon={<Library size={20} />}
            title="OpenAlex"
            status={openAlexCredential?.status === "connected" ? "Connected" : openAlexCredential?.status === "degraded" ? "Needs a check" : openAlexCredential ? "Replace key" : "Working — no setup needed"}
            connected={openAlexCredential?.status === "connected" || !openAlexCredential}
            description="Search the public scholarly graph across works, authors, institutions, sources, topics, references, citations, and related works."
          >
            {openAlexCredential ? <div className="connected-summary"><strong>{openAlexCredential.masked}</strong><span>{openAlexCredential.problem ?? `Last checked: ${dateLabel(openAlexCredential.lastValidatedAt)}`}</span>{openAlexCredential.lastUsedAt ? <small>Last used: {dateLabel(openAlexCredential.lastUsedAt)}</small> : null}</div> : <p className="connection-note">Scholarly search already works — OpenAlex answers Continuum without a key. Add your own free key only if you want higher rate limits during heavy searching.</p>}
            <div className="permission-line"><ShieldCheck size={15} /><span>Encrypted at rest · used only for OpenAlex requests · never returned to the browser</span></div>
            <div className="connection-actions"><Button className={openAlexCredential ? "button-primary" : "button-secondary"} onClick={() => { setOpenAlexTest(undefined); setOpenAlexOpen(true); }}><KeyRound size={15} />{openAlexCredential ? "Manage API key" : "Add a key for higher limits"}</Button></div>
            <Guide title="Add an OpenAlex API key (optional)" steps={["Search already works without this — add a key only if you hit rate limits during heavy searching.", "Open your OpenAlex account settings and create or copy your free API key.", "Paste the single key into Continuum. No OAuth app, client secret, scope selection, or redirect URL is needed.", "Test the key live, then save it encrypted to your Continuum account.", "Continuum uses it only when you search or navigate OpenAlex scholarly data."]} official={[{ label: "OpenAlex API key settings", href: links.openAlexKey }, { label: "Official authentication guide", href: links.openAlexAuth }]} />
          </ConnectionCard>

          <ConnectionCard
            icon={<Video size={20} />}
            title="YouTube Data API"
            status={youtubeCredential?.status === "connected" ? "Connected" : youtubeCredential?.status === "degraded" ? "Needs a check" : youtubeCredential ? "Replace key" : "Not connected"}
            connected={youtubeCredential?.status === "connected"}
            description="Search public, embeddable learning videos from Learn using your own YouTube Data API quota."
          >
            {youtubeCredential ? <div className="connected-summary"><strong>{youtubeCredential.masked}</strong><span>{youtubeCredential.problem ?? `Last checked: ${dateLabel(youtubeCredential.lastValidatedAt)}`}</span>{youtubeCredential.lastUsedAt ? <small>Last used: {dateLabel(youtubeCredential.lastUsedAt)}</small> : null}</div> : <p className="connection-note">Public video search uses one API key. OAuth is not needed because Continuum does not access your YouTube account, subscriptions, playlists, or private data.</p>}
            <div className="permission-line"><ShieldCheck size={15} /><span>Public search only · encrypted at rest · no YouTube account access</span></div>
            <div className="connection-actions"><Button className="button-primary" onClick={() => { setYouTubeTest(undefined); setYouTubeOpen(true); }}><KeyRound size={15} />{youtubeCredential ? "Manage API key" : "Connect YouTube"}</Button></div>
            <Guide title="Create a restricted YouTube API key" steps={["Create or select a Google Cloud project.", "Enable YouTube Data API v3 for that project.", "Create an API key under APIs & Services → Credentials.", "Restrict the key to YouTube Data API v3, then paste and test it here. Do not create an OAuth client for Continuum’s public search."]} official={[{ label: "Enable YouTube Data API v3", href: links.youtubeEnable }, { label: "Open API credentials", href: links.youtubeConsole }, { label: "Official getting-started guide", href: links.youtubeDocs }]} />
          </ConnectionCard>

          <ConnectionCard icon={<Library size={20} />} title="Zotero" status={status?.zotero.connected ? "Connected" : "Not connected"} connected={status?.zotero.connected} description="Index citation metadata and abstracts from your private Zotero library so research retrieval can find the right paper again.">
            {status?.zotero.connected ? <><div className="connected-summary"><strong>{status.zotero.username ?? "Private Zotero library"}</strong><span>Last sync: {dateLabel(status.zotero.lastSyncAt)}</span></div><div className="connection-actions"><Button className="button-primary" disabled={busy === "zotero-sync"} onClick={async () => { const result = await action("/api/connections/zotero", { action: "sync" }, "zotero-sync"); if (result) showToast(result.hasMore ? `${result.indexed ?? 0} items indexed. ${result.remaining ?? 0} remain; sync again to continue.` : `Zotero sync complete: ${result.indexed ?? 0} changed items indexed.`); }}>{busy === "zotero-sync" ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}Sync library</Button><Button className="button-quiet danger" onClick={() => setConfirmRequest({ title: "Disconnect Zotero?", description: "Already-indexed source metadata stays in Continuum until you delete it from Research.", confirmLabel: "Disconnect Zotero", run: async () => { await action("/api/connections/zotero", { action: "disconnect" }, "zotero-disconnect"); } })}>Disconnect</Button></div></> : null}
            {!status?.zotero.connected ? <div className="connection-actions"><Button className="button-primary" disabled={!status?.zotero.available} onClick={() => { setZoteroStep(1); setZoteroTest(undefined); setZoteroOpen(true); }}><KeyRound size={15} />Connect Zotero</Button></div> : null}
            <Guide title="Create the safest Zotero key" steps={["Open Zotero's official key page and create a new key named Continuum.", "Allow access to your personal library. Leave write access off; Continuum only needs to read.", "Paste the key above. Continuum validates it directly with Zotero before storing it encrypted.", "Run Sync library. Attachments and full-text PDFs are not imported automatically."]} official={[{ label: "Create a Zotero key", href: links.zoteroKey }, { label: "Zotero Web API guide", href: links.zoteroApi }]} />
          </ConnectionCard>

          <ConnectionCard icon={<BookOpen size={20} />} title="NotebookLM" status="Handoff" description="Create a concise Continuum source pack, then choose whether to add it to a NotebookLM notebook.">
            <p className="connection-note">Personal NotebookLM does not expose a general account-connection API. Continuum will not pretend it is connected or upload your work without you.</p>
            <div className="integration-tier-list"><span><strong>Source pack</strong> Available now</span><span><strong>Local connector</strong> Experimental · not installed</span><span><strong>Managed API</strong> Unavailable for personal accounts</span></div>
            <div className="connection-actions"><a className="button button-primary" href="/api/connections/notebooklm/export"><Download size={15} />Download source pack</a><Button className="button-secondary" disabled={busy === "notebook-query"} onClick={() => void copyNotebookQuery()}><Clipboard size={14} />{busy === "notebook-query" ? "Preparing…" : "Copy research query"}</Button><a className="button button-secondary" href="/api/connections/notebooklm/export?format=citations"><Download size={14} />Export citations</a><a className="button button-secondary" href={links.notebooklm} target="_blank" rel="noreferrer">Open NotebookLM<ExternalLink size={14} /></a></div>
            <Guide title="Continue in NotebookLM" steps={["Download the source pack. It contains projects, decisions, indexed-source titles, and recent verified outcomes—not your passwords or provider settings.", "Open NotebookLM and create or choose a notebook.", "Add the Markdown source pack as a source.", "Return to Continuum to record verified progress and keep your schedule current."]} official={[{ label: "Open NotebookLM", href: links.notebooklm }, { label: "Official NotebookLM help", href: links.notebookHelp }]} />
          </ConnectionCard>

          <ConnectionCard icon={<BookOpen size={20} />} title="Obsidian" status={obsidianDashboard?.paused ? "Paused" : openObsidianConflicts.length ? "Needs review" : status?.obsidian.tokens.length ? "Connected" : "Optional"} connected={Boolean(status?.obsidian.tokens.length) && !openObsidianConflicts.length} description="Conflict-aware, two-way Markdown sync through the local Continuum Sync plugin. Ordinary notes remain under your control.">
            <div className="connection-actions">
              <Button className="button-primary" disabled={!status?.obsidian.available || busy === "obsidian"} onClick={() => setObsidianOpen(true)}><KeyRound size={15} />Set up Obsidian</Button>
              {status?.obsidian.tokens.length ? <Button className="button-secondary" disabled={busy.startsWith("obsidian-")} onClick={() => void obsidianAction({ action: "set_paused", paused: !obsidianDashboard?.paused }, obsidianDashboard?.paused ? "Obsidian sync resumed. Queued changes remain durable." : "Obsidian sync paused. Queued changes will wait.")}>{obsidianDashboard?.paused ? <Play size={14} /> : <Pause size={14} />}{obsidianDashboard?.paused ? "Resume sync" : "Pause sync"}</Button> : null}
              {pendingObsidianOperations.some((operation) => ["retry", "error", "syncing"].includes(operation.status)) ? <Button className="button-secondary" disabled={busy.startsWith("obsidian-")} onClick={() => void obsidianAction({ action: "retry" }, "Failed Obsidian writes are ready to retry.")}><RefreshCw size={14} />Retry failed</Button> : null}
            </div>
            {obsidianDashboard ? <div className="obsidian-sync-health" aria-label="Obsidian sync health">
              <span><strong>{obsidianDashboard.records.length}</strong> tracked notes</span>
              <span><strong>{pendingObsidianOperations.length}</strong> pending</span>
              <span><strong>{acknowledgedObsidianOperations.length}</strong> acknowledged</span>
              <span className={openObsidianConflicts.length ? "warning" : ""}><strong>{openObsidianConflicts.length}</strong> conflicts</span>
            </div> : null}
            {openObsidianConflicts.map((conflict) => {
              const record = obsidianDashboard?.records.find((candidate) => candidate.sync_id === conflict.sync_id);
              return <article className="obsidian-conflict" key={conflict.id}>
                <div><AlertTriangle size={17} /><span><strong>{record?.title ?? "Synchronized note needs review"}</strong><small>Continuum and Obsidian both changed after their common base.</small></span></div>
                <details><summary>Compare versions</summary><div className="obsidian-conflict-compare"><section><strong>Continuum · {conflict.server_path}</strong><pre>{conflict.server_content}</pre></section><section><strong>Obsidian · {conflict.local_path}</strong><pre>{conflict.local_content}</pre></section></div></details>
                <div className="connection-actions"><Button className="button-secondary" disabled={busy.startsWith("obsidian-")} onClick={() => void obsidianAction({ action: "resolve_conflict", conflictId: conflict.id, resolution: "use_continuum" }, "Continuum’s version was queued for the vault.")}>Use Continuum</Button><Button className="button-secondary" disabled={busy.startsWith("obsidian-")} onClick={() => void obsidianAction({ action: "resolve_conflict", conflictId: conflict.id, resolution: "use_obsidian" }, "Obsidian’s version was accepted.")}>Use Obsidian</Button><Button className="button-secondary" disabled={busy.startsWith("obsidian-")} onClick={() => void obsidianAction({ action: "resolve_conflict", conflictId: conflict.id, resolution: "duplicate_both" }, "Both versions were preserved as separate notes.")}>Keep both</Button></div>
              </article>;
            })}
            {obsidianDashboard?.operations.length ? <details className="connection-guide obsidian-activity"><summary><span>Recent sync activity</span><ChevronDown size={16} /></summary><div>{obsidianDashboard.operations.slice(0, 12).map((operation) => {
              const record = obsidianDashboard.records.find((candidate) => candidate.sync_id === operation.sync_id);
              return <div className="obsidian-operation" key={operation.id}><span><strong>{record?.title ?? operation.operation_type}</strong><small>{operation.operation_type} · {dateLabel(operation.updated_at)}</small></span><Badge tone={operation.status === "completed" ? "green" : operation.status === "conflict" || operation.latest_error ? "orange" : "neutral"}>{operation.status === "completed" && operation.bridge_acknowledged_at ? "acknowledged" : operation.status}</Badge>{operation.latest_error ? <p>{operation.latest_error}</p> : null}</div>;
            })}</div></details> : null}
            {status?.obsidian.tokens.map((token) => <div className="connected-account" key={token.id}><div><strong>{token.name}</strong><span>Selected documents · memory updates</span><small>{token.lastUsedAt ? `Last used ${dateLabel(token.lastUsedAt)}` : `Created ${dateLabel(token.createdAt)}`}</small></div><button onClick={() => setConfirmRequest({ title: `Revoke ${token.name}?`, description: "The Obsidian bridge using this token will stop syncing. Notes already in your vault are untouched.", confirmLabel: "Revoke token", run: async () => { await action("/api/integrations", { action: "revoke_integration_token", tokenId: token.id }, token.id); } })}>Revoke</button></div>)}
            <Guide title="Install Continuum Sync" steps={["Install the Continuum Sync plugin files into your chosen vault's .obsidian/plugins/continuum-sync folder.", "Review and enable it under Settings → Community plugins.", "Create a token here and paste it into the plugin's secret prompt.", "Choose one folder and run a manual sync before enabling any automatic sync."]} official={[{ label: "Official Obsidian plugin guide", href: links.obsidian }, { label: "Official plugin security guide", href: links.obsidianSecurity }]} />
          </ConnectionCard>
        </div>
      </section>

      <section className="connection-section" aria-labelledby="local-title">
        <div className="section-heading"><div><p className="eyebrow">LOCAL AI</p><h2 id="local-title">Keep coding help on this computer</h2></div><p>Ollama is optional. Its URL and selected model stay in this browser.</p></div>
        <ConnectionCard icon={<Laptop size={20} />} title="Ollama" status={ollamaState?.testPassed ? "Streaming verified" : ollamaState?.reachable ? "Setup incomplete" : "Optional"} connected={ollamaState?.testPassed} description="Use a model running on your own computer from the Code workspace.">
          <div className="connection-actions"><Button className="button-primary" onClick={() => setOllamaOpen(true)}><Laptop size={15} />Choose local AI</Button></div>
          {ollamaState?.models.length ? <p className="connection-note"><strong>Installed:</strong> {ollamaState.models.slice(0, 6).map((model) => model.name).join(" · ")}</p> : null}
          <Guide title="Set up Ollama" steps={["Install Ollama from its official download page.", "Use Ollama's official CLI to install at least one code-capable model, then start Ollama.", "Allow only your Continuum origin in OLLAMA_ORIGINS.", "Use Chrome or Edge for local AI and allow Continuum’s Local Network Access site permission. Safari blocks a secure website from calling Ollama’s HTTP loopback API.", "Test the connection here, then choose Ollama in the Code workspace."]} official={[{ label: "Official Ollama download", href: links.ollama }, { label: "Official Ollama API guide", href: links.ollamaApi }]} />
        </ConnectionCard>
      </section>
      <Modal
        open={openAlexOpen}
        onOpenChange={(open) => {
          setOpenAlexOpen(open);
          if (!open) {
            setOpenAlexKey("");
            setOpenAlexPassword("");
            setOpenAlexTest(undefined);
          }
        }}
        title={openAlexCredential ? "Manage your OpenAlex key" : "Connect OpenAlex"}
        description="One free API key enables live scholarly search. OpenAlex does not require OAuth or a client secret for this integration."
        dirty={Boolean(openAlexKey || openAlexPassword)}
        dirtyMessage="Close without saving? The OpenAlex key and password you entered will be discarded."
        footer={<>
          {openAlexCredential ? <Button className="button-quiet danger" type="button" disabled={busy.startsWith("openalex-")} onClick={() => void disconnectOpenAlex()}>Disconnect</Button> : null}
          <Button className="button-secondary" type="button" onClick={() => setOpenAlexOpen(false)}>Cancel</Button>
          <LoadingButton className="button-primary" form="openalex-connect-form" loading={busy === "openalex-connect"} loadingLabel="Saving…" disabled={!openAlexTest?.ok || Boolean(openAlexCredential && !openAlexPassword)}>Save key</LoadingButton>
        </>}
      >
        <form id="openalex-connect-form" className="guided-config" onSubmit={(event) => void connectOpenAlex(event)}>
          <p><strong>What is sent:</strong> only public scholarly queries, identifiers, filters, and pagination parameters. Your Continuum password, memories, and private notes are never sent to OpenAlex.</p>
          <a className="button button-secondary" href={links.openAlexKey} target="_blank" rel="noreferrer">Get an OpenAlex API key <ExternalLink size={13} /></a>
          <label htmlFor="openalex-api-key">{openAlexCredential ? "Replacement OpenAlex API key" : "OpenAlex API key"}</label>
          <div className="secret-field"><input id="openalex-api-key" autoFocus type={showOpenAlexKey ? "text" : "password"} autoComplete="off" required minLength={8} maxLength={2000} value={openAlexKey} onChange={(event) => { setOpenAlexKey(event.target.value); setOpenAlexTest(undefined); }} placeholder="Paste your OpenAlex API key" /><button type="button" aria-label={showOpenAlexKey ? "Hide OpenAlex key" : "Show OpenAlex key"} onClick={() => setShowOpenAlexKey((shown) => !shown)}>{showOpenAlexKey ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
          <Button className="button-secondary" type="button" disabled={busy === "openalex-test" || openAlexKey.trim().length < 8} onClick={() => void testOpenAlex()}>{busy === "openalex-test" ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}{busy === "openalex-test" ? "Testing…" : "Test connection"}</Button>
          {openAlexTest ? <div className={openAlexTest.ok ? "config-test-success" : "config-test-error"} role="status"><strong>{openAlexTest.ok ? "Connection successful" : "Connection failed"}</strong><span>{openAlexTest.message}</span></div> : null}
          {openAlexCredential ? <label htmlFor="openalex-current-password">Current Continuum password<input id="openalex-current-password" type="password" autoComplete="current-password" required value={openAlexPassword} onChange={(event) => setOpenAlexPassword(event.target.value)} /><small>Required to replace or disconnect an existing secret.</small></label> : null}
          <p className="privacy-note">After saving, Continuum shows only the final four characters. The full key is encrypted before database storage and is never included in exports.</p>
        </form>
      </Modal>
      <Modal
        open={youtubeOpen}
        onOpenChange={(open) => {
          setYouTubeOpen(open);
          if (!open) {
            setYouTubeKey("");
            setYouTubePassword("");
            setYouTubeTest(undefined);
          }
        }}
        title={youtubeCredential ? "Manage your YouTube API key" : "Connect YouTube video search"}
        description="A YouTube Data API key enables public learning-video search. OAuth is unnecessary because Continuum never accesses your YouTube account."
        dirty={Boolean(youtubeKey || youtubePassword)}
        dirtyMessage="Close without saving? The YouTube key and password you entered will be discarded."
        footer={<>
          {youtubeCredential ? <Button className="button-quiet danger" type="button" disabled={busy.startsWith("youtube-")} onClick={() => void disconnectYouTube()}>Disconnect</Button> : null}
          <Button className="button-secondary" type="button" onClick={() => setYouTubeOpen(false)}>Cancel</Button>
          <LoadingButton className="button-primary" form="youtube-connect-form" loading={busy === "youtube-connect"} loadingLabel="Saving…" disabled={!youtubeTest?.ok || Boolean(youtubeCredential && !youtubePassword)}>Save key</LoadingButton>
        </>}
      >
        <form id="youtube-connect-form" className="guided-config" onSubmit={(event) => void connectYouTube(event)}>
          <p><strong>What is sent:</strong> only your public learning-video search terms and filters. Continuum does not read your watch history, subscriptions, playlists, uploads, or private account data.</p>
          <div className="modal-inline-actions"><a className="button button-secondary" href={links.youtubeEnable} target="_blank" rel="noreferrer">Enable the API <ExternalLink size={13} /></a><a className="button button-secondary" href={links.youtubeConsole} target="_blank" rel="noreferrer">Create API key <ExternalLink size={13} /></a></div>
          <label htmlFor="youtube-api-key">{youtubeCredential ? "Replacement YouTube API key" : "YouTube Data API key"}</label>
          <div className="secret-field"><input id="youtube-api-key" autoFocus type={showYouTubeKey ? "text" : "password"} autoComplete="off" required minLength={8} maxLength={2000} value={youtubeKey} onChange={(event) => { setYouTubeKey(event.target.value); setYouTubeTest(undefined); }} placeholder="Paste your restricted YouTube API key" /><button type="button" aria-label={showYouTubeKey ? "Hide YouTube key" : "Show YouTube key"} onClick={() => setShowYouTubeKey((shown) => !shown)}>{showYouTubeKey ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
          <Button className="button-secondary" type="button" disabled={busy === "youtube-test" || youtubeKey.trim().length < 8} onClick={() => void testYouTube()}>{busy === "youtube-test" ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}{busy === "youtube-test" ? "Testing…" : "Test connection"}</Button>
          {youtubeTest ? <div className={youtubeTest.ok ? "config-test-success" : "config-test-error"} role="status"><strong>{youtubeTest.ok ? "Connection successful" : "Connection failed"}</strong><span>{youtubeTest.message}</span></div> : null}
          {youtubeCredential ? <label htmlFor="youtube-current-password">Current Continuum password<input id="youtube-current-password" type="password" autoComplete="current-password" required value={youtubePassword} onChange={(event) => setYouTubePassword(event.target.value)} /><small>Required to replace or disconnect an existing secret.</small></label> : null}
          <p className="privacy-note">Restrict this key to YouTube Data API v3 in Google Cloud. Continuum encrypts it before storage, shows only its final four characters, and excludes it from account exports.</p>
        </form>
      </Modal>
      <Modal
        open={zoteroOpen}
        onOpenChange={(open) => { setZoteroOpen(open); if (!open) { setZoteroStep(1); setZoteroTest(undefined); } }}
        title="Connect your Zotero library"
        description="A read-only Zotero key lets Continuum index citation metadata and abstracts you choose to sync."
        dirty={Boolean(zoteroKey)}
        dirtyMessage="Close without saving? The Zotero key you entered will be discarded."
        footer={zoteroStep === 1
          ? <><Button className="button-secondary" type="button" onClick={() => setZoteroOpen(false)}>Cancel</Button><Button className="button-primary" type="button" onClick={() => setZoteroStep(2)}>Continue</Button></>
          : <><Button className="button-secondary" type="button" disabled={busy.startsWith("zotero-")} onClick={() => setZoteroStep(1)}>Back</Button><LoadingButton className="button-primary" form="zotero-connect-form" loading={busy === "zotero-connect"} loadingLabel="Saving…" disabled={!zoteroTest?.ok}>Save connection</LoadingButton></>}
      >
        {zoteroStep === 1 ? <div className="guided-config">
          <div className="guided-step">Step 1 of 2</div>
          <h3>Create a dedicated read-only key</h3>
          <p><strong>Why it is needed:</strong> Continuum uses the key only when you ask it to sync your personal Zotero library.</p>
          <ol><li>Open Zotero’s official key page.</li><li>Create a key named Continuum.</li><li>Allow personal-library read access and leave write access off.</li><li>Copy the new key.</li></ol>
          <a className="button button-secondary" href={links.zoteroKey} target="_blank" rel="noreferrer">Create a Zotero key <ExternalLink size={13} /></a>
          <p className="privacy-note">Continuum validates the key directly with Zotero, encrypts it before database storage, and never returns it to the browser again. Files and PDFs are not imported automatically.</p>
        </div> : <form id="zotero-connect-form" className="guided-config" onSubmit={(event) => void connectZotero(event)}>
          <div className="guided-step">Step 2 of 2</div>
          <label htmlFor="zotero-private-key">Zotero private key</label>
          <div className="secret-field"><input id="zotero-private-key" autoFocus type={showZoteroKey ? "text" : "password"} autoComplete="off" required minLength={16} maxLength={256} value={zoteroKey} onChange={(event) => { setZoteroKey(event.target.value); setZoteroTest(undefined); }} placeholder="Example: a dedicated read-only Zotero key" /><button type="button" aria-label={showZoteroKey ? "Hide Zotero key" : "Show Zotero key"} onClick={() => setShowZoteroKey((shown) => !shown)}>{showZoteroKey ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
          <Button className="button-secondary" type="button" disabled={busy === "zotero-test" || zoteroKey.trim().length < 16} onClick={() => void testZotero()}>{busy === "zotero-test" ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}{busy === "zotero-test" ? "Testing…" : "Test connection"}</Button>
          {zoteroTest ? <div className={zoteroTest.ok ? "config-test-success" : "config-test-error"} role="status"><strong>{zoteroTest.ok ? "Connection successful" : "Connection failed"}</strong><span>{zoteroTest.message}</span></div> : null}
        </form>}
      </Modal>
      <Modal
        open={obsidianOpen}
        onOpenChange={(open) => { setObsidianOpen(open); if (!open) setObsidianToken(""); }}
        title="Connect an Obsidian vault"
        description="A one-time token lets the Continuum Sync plugin exchange only the folders and note actions you approve."
        footer={<><Button className="button-secondary" type="button" onClick={() => setObsidianOpen(false)}>{obsidianToken ? "Done" : "Cancel"}</Button>{!obsidianToken ? <LoadingButton className="button-primary" loading={busy === "obsidian"} loadingLabel="Creating token…" onClick={() => void action("/api/integrations", { action: "create_obsidian_token", name: "My Obsidian vault" }, "obsidian")}><KeyRound size={15} />Create vault token</LoadingButton> : null}</>}
      >
        <div className="guided-config">
          <p><strong>Why it is needed:</strong> The local plugin needs a revocable token to authenticate without learning your Continuum password.</p>
          <ol><li>Install the Continuum Sync plugin files in the selected vault.</li><li>Review and enable the plugin under Settings → Community plugins.</li><li>Create a token below, copy it immediately, and paste it into the plugin’s secret prompt.</li><li>Select one folder and run a manual sync before enabling automatic sync.</li></ol>
          <div className="official-links"><a href={links.obsidian} target="_blank" rel="noreferrer">Official plugin guide <ExternalLink size={13} /></a><a href={links.obsidianSecurity} target="_blank" rel="noreferrer">Plugin security guide <ExternalLink size={13} /></a></div>
          {obsidianToken ? <div className="one-time-token" role="status"><div><strong>Copy this token now</strong><button onClick={() => setObsidianToken("")} aria-label="Hide token"><X size={14} /></button></div><code>{obsidianToken}</code><Button className="button-secondary" onClick={() => void copy(obsidianToken, "Vault token")}><Clipboard size={14} />Copy</Button><small>Only its SHA-256 hash is stored. Continuum cannot show this token again.</small></div> : null}
          <p className="privacy-note">The token can read selected documents and write approved memory updates. Revoke it from Connections at any time.</p>
        </div>
      </Modal>
      <Modal
        open={ollamaOpen}
        onOpenChange={setOllamaOpen}
        title="Choose local AI for coding help"
        description="Ollama is optional and affects AI help only. Running code in Continuum does not use Ollama or any other model."
        footer={<><Button className="button-secondary" type="button" onClick={() => setOllamaOpen(false)}>Cancel</Button><Button className="button-primary" type="button" disabled={!ollamaState?.testPassed || ollamaState.testedModel !== ollamaModel || Boolean(ollamaState.models.find((model) => model.name === ollamaModel && model.size > 8 * 1024 ** 3))} onClick={saveOllama}>Save local AI</Button></>}
      >
        <div className="guided-config">
          <p><strong>Why it is needed:</strong> This address lets the Code tab request optional explanations from a model running on your computer.</p>
          <ol><li>Install Ollama from the official download page.</li><li>Install at least one code-capable model and start Ollama.</li><li>Allow only your Continuum origin in <code>OLLAMA_ORIGINS</code>.</li><li>Use Chrome or Edge for local AI and allow Continuum’s Local Network Access site permission. Safari blocks the secure Continuum page from calling Ollama’s HTTP loopback API.</li><li>Enter the local address and test it before saving.</li></ol>
          <a className="button button-secondary" href={links.ollama} target="_blank" rel="noreferrer">Download Ollama <ExternalLink size={13} /></a>
          <label>Local Ollama address<input autoFocus inputMode="url" value={ollamaUrl} onChange={(event) => { setOllamaUrl(event.target.value); setOllamaState(undefined); }} placeholder="Example: http://127.0.0.1:11434" /></label>
          <Button className="button-secondary" type="button" disabled={busy === "ollama"} onClick={() => void testOllama()}>{busy === "ollama" ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}{busy === "ollama" ? "Testing…" : "Test connection"}</Button>
          {ollamaState?.reachable && ollamaState.models.length ? <label>Model<select value={ollamaModel} onChange={(event) => { setOllamaModel(event.target.value); setOllamaState((current) => current ? { ...current, testPassed: current.testedModel === event.target.value } : current); }}>{ollamaState.models.map((model) => <option key={model.name} value={model.name}>{model.name} · {model.size ? `${(model.size / 1024 ** 3).toFixed(1)} GB` : "size unknown"}</option>)}</select><small>For a 16 GB Mac, choose a model below 8 GB. If you change models, test again before saving. Continuum caps local requests to an 8K context so the computer remains responsive.</small></label> : null}
          {ollamaState ? <div className={ollamaState.testPassed ? "config-test-success" : "config-test-error"} role="status"><strong>{ollamaState.testPassed ? "Local AI is ready" : "Setup is incomplete"}</strong><span>{ollamaState.message ?? "Test the local API before saving."}{ollamaState.testPassed && ollamaState.latencyMs ? ` First text: ${((ollamaState.firstTokenMs ?? ollamaState.latencyMs) / 1_000).toFixed(1)}s · complete: ${(ollamaState.latencyMs / 1_000).toFixed(1)}s.` : ""}</span></div> : null}
          {ollamaState?.models.find((model) => model.name === ollamaModel && model.size > 8 * 1024 ** 3) ? <div className="config-test-error" role="alert"><strong>This model is too large for reliable local help</strong><span>Choose a model under 8 GB. Larger weights can force macOS to swap memory and make the whole computer appear frozen.</span></div> : null}
          <p className="privacy-note">The address and selected model are stored only in this browser. Code still runs in Continuum’s isolated browser runtime; local AI is called only when you explicitly request AI help.</p>
        </div>
      </Modal>
      <Modal
        open={claudeOpen}
        onOpenChange={setClaudeOpen}
        title="Connect Claude to Continuum"
        description="Claude uses Continuum’s remote MCP address to request only the goals, research, learning, or schedule permissions you approve."
        footer={<><Button className="button-secondary" type="button" onClick={() => setClaudeOpen(false)}>Cancel</Button><Button className="button-primary" type="button" disabled={!status?.mcp.endpoint} onClick={() => void copy(status?.mcp.endpoint ?? "", "Connector URL")}><Clipboard size={14} />Copy connector URL</Button></>}
      >
        <div className="guided-config">
          <p><strong>Why it is needed:</strong> Claude needs the connector URL so it can open Continuum’s secure OAuth approval page. No API key is required.</p>
          <ol>{(status?.mcp.claude.instructions ?? ["Open Claude Customize → Connectors.", "Add a custom connector.", "Paste the Continuum connector URL.", "Sign in and review permissions."]).map((instruction) => <li key={instruction}>{instruction}</li>)}</ol>
          <label>Continuum connector URL<div className="copy-field"><input readOnly value={status?.mcp.endpoint ?? "Loading connector address…"} /><Button className="button-secondary" type="button" disabled={!status?.mcp.endpoint} onClick={() => void copy(status?.mcp.endpoint ?? "", "Connector URL")}>Copy</Button></div></label>
          <Button className="button-secondary" type="button" disabled={busy === "claude-test"} onClick={() => void testClaudeConnector()}>{busy === "claude-test" ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}{busy === "claude-test" ? "Testing…" : "Test connector"}</Button>
          {claudeTest ? <div className={claudeTest.ok ? "config-test-success" : "config-test-error"} role="status"><strong>{claudeTest.ok ? "Connector is ready" : "Connector check failed"}</strong><span>{claudeTest.message}</span></div> : null}
          <a href={links.claude} target="_blank" rel="noreferrer">Open Claude’s official connector guide <ExternalLink size={13} /></a>
          <p className="privacy-note">Continuum stores the approved Claude client, scopes, and revocation state. OAuth tokens are short-lived or revocable; the connector never receives your Continuum password.</p>
        </div>
      </Modal>

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
