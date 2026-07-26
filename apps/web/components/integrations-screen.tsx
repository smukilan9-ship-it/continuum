"use client";

import { BookOpen, Check, ChevronDown, Clipboard, Download, ExternalLink, Eye, EyeOff, KeyRound, Laptop, Library, Link2, LoaderCircle, RefreshCw, ShieldCheck, Unplug, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Badge, Button, LoadingButton, Modal } from "@/components/ui";

type Status = {
  mcp: { endpoint: string; status: string; connections: Array<{ clientId: string; name: string; scopes: string[]; connectedAt: string; lastUsedAt?: string; calls: number }>; claude: { instructions: string[] } };
  zotero: { connected: boolean; available: boolean; username?: string; lastSyncAt?: string; scopes: string[] };
  notebooklm: { mode: "source_pack"; accountConnectionAvailable: false };
  obsidian: { available: boolean; tokens: Array<{ id: string; name: string; scopes: string[]; lastUsedAt?: string; expiresAt?: string; createdAt: string }> };
};

type CredentialProvider = "openalex" | "youtube";
type CredentialRecord = {
  provider: CredentialProvider;
  name: string;
  purpose: string;
  privacy: string;
  docs: string;
  status?: "connected" | "degraded" | "invalid" | "revoked";
  masked?: string;
  lastValidatedAt?: string;
  lastUsedAt?: string;
  reconfigurationRequired?: boolean;
  problem?: string;
};
type CredentialPayload = {
  providers: Array<Omit<CredentialRecord, "status" | "masked" | "lastValidatedAt" | "lastUsedAt">>;
  configured: CredentialRecord[];
};

type Toast = (message: string | null) => void;

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
};

function ConnectionCard({ id, icon, title, status, connected, description, children }: { id?: string; icon: ReactNode; title: string; status: string; connected?: boolean; description: string; children: ReactNode }) {
  return (
    <article className="connection-card" id={id}>
      <div className="connection-card-head">
        <span className="connection-mark">{icon}</span>
        <div><h2>{title}</h2><p>{description}</p></div>
        <Badge tone={connected ? "green" : "neutral"}>{connected ? <Check size={12} /> : null}{status}</Badge>
      </div>
      {children}
    </article>
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

function ProviderCredentialRow({
  provider,
  configured,
  busy,
  onAction,
}: {
  provider: Omit<CredentialRecord, "status" | "masked" | "lastValidatedAt" | "lastUsedAt">;
  configured?: CredentialRecord;
  busy: string;
  onAction: (action: "validate" | "configure" | "test" | "disconnect", provider: CredentialProvider, secret?: string, currentPassword?: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [secret, setSecret] = useState("");
  const [password, setPassword] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [testState, setTestState] = useState<{ ok: boolean; message: string }>();
  const working = busy === `credential-${provider.provider}`;
  const connected = configured?.status === "connected";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await onAction("configure", provider.provider, secret, configured ? password : undefined);
    if (result.ok) {
      setSecret("");
      setPassword("");
      setExpanded(false);
      setTestState(undefined);
      setStep(1);
    }
  }

  async function testNewSecret() {
    const result = await onAction("validate", provider.provider, secret);
    setTestState(result);
  }

  return (
    <article className="settings-row">
      <div className="settings-row-copy">
        <div className="settings-row-title">
          <h3>{provider.name}</h3>
          <Badge tone={connected ? "green" : configured?.status === "invalid" ? "red" : "neutral"}>
            {configured?.status === "connected" ? "Connected" : configured?.status === "degraded" ? "Needs attention" : configured?.status === "invalid" ? "Invalid" : "Not configured"}
          </Badge>
        </div>
        <p>{provider.purpose}</p>
        <small>{provider.privacy} <a href={provider.docs} target="_blank" rel="noreferrer">Official docs<ExternalLink size={11} /></a></small>
        {configured ? <div className="credential-facts"><span>{configured.masked}</span><span>Checked {dateLabel(configured.lastValidatedAt)}</span>{configured.lastUsedAt ? <span>Used {dateLabel(configured.lastUsedAt)}</span> : null}</div> : null}
        {configured?.problem ? <p className="field-error" role="alert">{configured.problem}</p> : null}
      </div>
      <div className="settings-row-actions">
        {configured ? <Button className="button-secondary" disabled={working} onClick={() => void onAction("test", provider.provider)}>{working ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}Test</Button> : null}
        <Button className={configured ? "button-quiet" : "button-primary"} disabled={working} onClick={() => { setStep(1); setTestState(undefined); setExpanded(true); }}>{configured ? "Replace" : "Configure"}</Button>
      </div>
      <Modal
        open={expanded}
        onOpenChange={(open) => { setExpanded(open); if (!open) { setTestState(undefined); setStep(1); } }}
        title={`${configured ? "Replace" : "Connect"} ${provider.name}`}
        description={`Continuum uses this key only to ${provider.purpose.charAt(0).toLowerCase()}${provider.purpose.slice(1)}`}
        dirty={Boolean(secret || password)}
        dirtyMessage="Close without saving this connection? The value you entered will be discarded."
        footer={step === 1
          ? <><Button className="button-secondary" type="button" onClick={() => setExpanded(false)}>Cancel</Button><Button className="button-primary" type="button" onClick={() => setStep(2)}>Continue</Button></>
          : <><Button className="button-secondary" type="button" disabled={working} onClick={() => setStep(1)}>Back</Button><LoadingButton form={`credential-${provider.provider}`} className="button-primary" loading={working} loadingLabel="Saving…" disabled={!testState?.ok}>{configured ? "Save replacement" : "Save connection"}</LoadingButton></>}
      >
        {step === 1 ? <div className="guided-config">
          <div className="guided-step">Step 1 of 2</div>
          <h3>Get a dedicated {provider.name} API key</h3>
          <p><strong>Why it is needed:</strong> {provider.purpose}</p>
          <ol>{provider.provider === "openalex"
            ? <><li>Open the official OpenAlex developer portal.</li><li>Create or sign in to an OpenAlex account.</li><li>Create a key for Continuum and copy it.</li></>
            : <><li>Open Google Cloud’s YouTube Data API setup guide.</li><li>Create a project and enable YouTube Data API v3.</li><li>Create a restricted API key and copy it.</li></>}</ol>
          <a className="button button-secondary" href={provider.docs} target="_blank" rel="noreferrer">Open official setup guide <ExternalLink size={13} /></a>
          <p className="privacy-note">{provider.privacy} The key is submitted over HTTPS, encrypted before storage, never returned by the API, and can be disconnected here.</p>
        </div> : <form id={`credential-${provider.provider}`} className="guided-config" onSubmit={(event) => void save(event)}>
          <div className="guided-step">Step 2 of 2</div>
          <label htmlFor={`credential-secret-${provider.provider}`}>API key</label>
          <div className="secret-field"><input id={`credential-secret-${provider.provider}`} autoFocus type={showSecret ? "text" : "password"} autoComplete="off" required minLength={8} value={secret} onChange={(event) => { setSecret(event.target.value); setTestState(undefined); }} placeholder={provider.provider === "openalex" ? "Example: your OpenAlex API key" : "Example: AIza…"} /><button type="button" aria-label={showSecret ? "Hide API key" : "Show API key"} onClick={() => setShowSecret((shown) => !shown)}>{showSecret ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
          {configured ? <label>Current Continuum password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label> : null}
          <Button className="button-secondary" type="button" disabled={working || secret.trim().length < 8} onClick={() => void testNewSecret()}>{working ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}Test connection</Button>
          {testState ? <div className={testState.ok ? "config-test-success" : "config-test-error"} role="status"><strong>{testState.ok ? "Connection successful" : "Connection failed"}</strong><span>{testState.message}</span></div> : null}
          {configured ? <Button type="button" className="button-quiet danger" disabled={working || !password} onClick={async () => { if (window.confirm(`Disconnect ${provider.name}?`)) { const done = await onAction("disconnect", provider.provider, undefined, password); if (done.ok) setExpanded(false); } }}>Disconnect {provider.name}</Button> : null}
        </form>}
      </Modal>
    </article>
  );
}

function PublicProviderRow({ name, status, purpose, privacy, href, action }: { name: string; status: string; purpose: string; privacy: string; href: string; action: string }) {
  return (
    <article className="settings-row settings-row-static">
      <div className="settings-row-copy">
        <div className="settings-row-title"><h3>{name}</h3><Badge tone="neutral">{status}</Badge></div>
        <p>{purpose}</p>
        <small>{privacy}</small>
      </div>
      <a className="button button-secondary" href={href} target="_blank" rel="noreferrer">{action}<ExternalLink size={13} /></a>
    </article>
  );
}

export function IntegrationsScreen({ showToast }: { showToast: Toast }) {
  const [status, setStatus] = useState<Status>();
  const [credentials, setCredentials] = useState<CredentialPayload>();
  const [credentialError, setCredentialError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [zoteroKey, setZoteroKey] = useState("");
  const [zoteroOpen, setZoteroOpen] = useState(false);
  const [zoteroStep, setZoteroStep] = useState<1 | 2>(1);
  const [zoteroTest, setZoteroTest] = useState<{ ok: boolean; message: string }>();
  const [showZoteroKey, setShowZoteroKey] = useState(false);
  const [obsidianOpen, setObsidianOpen] = useState(false);
  const [obsidianToken, setObsidianToken] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://127.0.0.1:11434");
  const [ollamaState, setOllamaState] = useState<{ reachable: boolean; models: Array<{ name: string; size: number }> }>();
  const [ollamaModel, setOllamaModel] = useState("");
  const [ollamaOpen, setOllamaOpen] = useState(false);
  const [claudeOpen, setClaudeOpen] = useState(false);
  const [claudeTest, setClaudeTest] = useState<{ ok: boolean; message: string }>();

  const refresh = useCallback(async () => {
    setError("");
    setCredentialError("");
    const [connectionsResult, credentialsResult] = await Promise.allSettled([
      fetch("/api/integrations", { cache: "no-store" }),
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
    if (credentialsResult.status === "fulfilled") {
      try {
        const payload = await credentialsResult.value.json() as CredentialPayload & { error?: string };
        if (credentialsResult.value.ok) setCredentials(payload);
        else setCredentialError(payload.error ?? "Provider settings are unavailable");
      } catch {
        setCredentialError("Provider settings returned an invalid response. Try again.");
      }
    } else setCredentialError("Provider settings are unavailable");
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
    try {
      const url = new URL(ollamaUrl);
      if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Only a local Ollama address is allowed");
      const response = await fetch(new URL("/api/tags", url), { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
      const payload = await response.json() as { models?: Array<{ name: string; size?: number }> };
      const models = (payload.models ?? []).map((model) => ({ name: model.name, size: model.size ?? 0 }));
      setOllamaState({ reachable: true, models });
      const current = models.find((model) => model.name === ollamaModel && model.size <= 8 * 1024 ** 3);
      const recommended = [...models].filter((model) => !model.size || model.size <= 8 * 1024 ** 3).sort((left, right) => left.size - right.size)[0];
      setOllamaModel(current?.name ?? recommended?.name ?? models[0]?.name ?? "");
      showToast(models.length ? `Ollama responded with ${models.length} local model${models.length === 1 ? "" : "s"}. Save to use this setup.` : "Ollama is reachable. Install a model before saving this setup.");
    } catch (cause) { setOllamaState({ reachable: false, models: [] }); showToast(cause instanceof Error ? cause.message : "Ollama is unavailable"); }
    finally { setBusy(""); }
  }

  function saveOllama() {
    if (!ollamaState?.reachable || !ollamaModel) return;
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

  async function credentialAction(actionName: "validate" | "configure" | "test" | "disconnect", provider: CredentialProvider, secret?: string, currentPassword?: string) {
    const key = `credential-${provider}`;
    setBusy(key);
    try {
      const response = await fetch("/api/integrations/credentials", {
        method: actionName === "disconnect" ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(actionName === "disconnect"
          ? { provider, currentPassword }
          : actionName === "configure"
            ? { action: "configure", provider, secret, currentPassword }
            : actionName === "validate"
              ? { action: "validate", provider, secret }
              : { action: "test", provider }),
      });
      const payload = await response.json() as { error?: string; status?: string; message?: string };
      if (!response.ok) return { ok: false, message: payload.error ?? "Continuum could not complete this connection check." };
      const message = payload.message ?? (actionName === "validate" ? "The provider accepted this key. It has not been saved yet." : actionName === "test" ? `Provider health: ${payload.status ?? "connected"}.` : actionName === "disconnect" ? "Provider credential disconnected." : "Provider credential validated and encrypted.");
      showToast(message);
      if (actionName !== "validate") await refresh();
      return { ok: true, message };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The provider setting could not be updated";
      showToast(message);
      return { ok: false, message };
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="screen connections-screen">
      <header className="page-intro connections-intro">
        <div><p className="eyebrow">CONNECTIONS</p><h1>Bring your academic context with you.</h1><p className="page-description">Each connection is optional. You can see what it reads, choose when it syncs, and revoke access without deleting your work.</p></div>
        <Button className="button-secondary" onClick={() => void refresh()} disabled={busy === "refresh"}><RefreshCw size={15} />Refresh</Button>
      </header>
      {error ? <div className="inline-alert" role="alert"><Unplug size={17} /><span>{error}</span><button onClick={() => void refresh()}>Try again</button></div> : null}

      <section className="connection-section provider-settings" aria-labelledby="providers-title">
        <div className="section-heading"><div><p className="eyebrow">RESEARCH PROVIDERS</p><h2 id="providers-title">Optional discovery connections</h2></div><p>Continuum AI is included with your account. These optional keys only add metadata or video-search access and are never used for model access.</p></div>
        {credentialError ? <div className="inline-alert" role="alert"><Unplug size={17} /><span>{credentialError}</span><button onClick={() => void refresh()}>Try again</button></div> : null}

        <div className="settings-group">
          <div className="settings-group-label"><span>Research</span><small>Discovery and citation data</small></div>
          {credentials?.providers.filter((provider) => provider.provider === "openalex").map((provider) => <ProviderCredentialRow key={provider.provider} provider={provider} configured={credentials.configured.find((item) => item.provider === provider.provider)} busy={busy} onAction={credentialAction} />)}
          <PublicProviderRow name="Crossref" status="Public · no key needed" purpose="Verified DOI metadata and citation lookups through the public REST API." privacy="Research terms and identifiers are sent to Crossref only when you search." href="https://www.crossref.org/documentation/retrieve-metadata/rest-api/" action="API policy" />
        </div>

        <div className="settings-group">
          <div className="settings-group-label"><span>Learning resources</span><small>Real, attributable material</small></div>
          {credentials?.providers.filter((provider) => provider.provider === "youtube").map((provider) => <ProviderCredentialRow key={provider.provider} provider={provider} configured={credentials.configured.find((item) => item.provider === provider.provider)} busy={busy} onAction={credentialAction} />)}
          <PublicProviderRow name="PhET Interactive Simulations" status="Verified curated registry" purpose="Open subject-matched simulations from PhET's maintained public catalog." privacy="Continuum stores the verified destination and attribution, not a fabricated API connection." href="https://phet.colorado.edu/en/simulations/browse" action="Browse PhET" />
        </div>
      </section>

      <section className="connection-section" aria-labelledby="assistants-title">
        <div className="section-heading"><div><p className="eyebrow">DEVELOPER & ASSISTANTS</p><h2 id="assistants-title">One memory, wherever you work</h2></div><p>Claude retrieves only the relevant context it requests. It never receives a raw history dump.</p></div>
        <ConnectionCard id="claude" icon={<Link2 size={20} />} title="Claude" status={status?.mcp.connections.length ? "Connected" : "Ready to connect"} connected={Boolean(status?.mcp.connections.length)} description="Use your Continuum goals, projects, sources, decisions, progress, and schedule from Claude through remote MCP.">
          <div className="permission-line"><ShieldCheck size={15} /><span>OAuth sign-in · permission-scoped tools · consequential writes require approval</span></div>
          <div className="connection-actions"><Button className="button-primary" disabled={!status?.mcp.endpoint} onClick={() => { setClaudeTest(undefined); setClaudeOpen(true); }}><Link2 size={15} />Connect Claude</Button></div>
          <Guide title="Connect Claude in four steps" steps={status?.mcp.claude.instructions ?? ["Open Claude Customize → Connectors.", "Add a custom connector.", "Paste the Continuum connector URL.", "Sign in and review permissions."]} official={[{ label: "Claude's official connector guide", href: links.claude }]} />
          {status?.mcp.connections.map((connection) => <div className="connected-account" key={connection.clientId}><div><strong>{connection.name}</strong><span>{connection.scopes.map((scope) => scope.replace(":", " ")).join(" · ")}</span><small>{connection.lastUsedAt ? `Last used ${dateLabel(connection.lastUsedAt)}` : `Connected ${dateLabel(connection.connectedAt)}`}</small></div><button onClick={async () => { if (window.confirm(`Revoke ${connection.name}'s access to Continuum?`)) { await action("/api/integrations", { action: "revoke_mcp_client", clientId: connection.clientId }, connection.clientId); showToast("Claude access revoked."); } }}>Revoke</button></div>)}
        </ConnectionCard>
      </section>

      <section className="connection-section" aria-labelledby="study-tools-title">
        <div className="section-heading"><div><p className="eyebrow">PRODUCTIVITY</p><h2 id="study-tools-title">Sources and notes</h2></div><p>Continuum’s planner uses its own editable schedule. These optional tools add research and note context.</p></div>
        <div className="connection-list">
          <ConnectionCard icon={<Library size={20} />} title="Zotero" status={status?.zotero.connected ? "Connected" : "Not connected"} connected={status?.zotero.connected} description="Index citation metadata and abstracts from your private Zotero library so research retrieval can find the right paper again.">
            {status?.zotero.connected ? <><div className="connected-summary"><strong>{status.zotero.username ?? "Private Zotero library"}</strong><span>Last sync: {dateLabel(status.zotero.lastSyncAt)}</span></div><div className="connection-actions"><Button className="button-primary" disabled={busy === "zotero-sync"} onClick={async () => { const result = await action("/api/connections/zotero", { action: "sync" }, "zotero-sync"); if (result) showToast(result.hasMore ? `${result.indexed ?? 0} items indexed. ${result.remaining ?? 0} remain; sync again to continue.` : `Zotero sync complete: ${result.indexed ?? 0} changed items indexed.`); }}>{busy === "zotero-sync" ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}Sync library</Button><Button className="button-quiet danger" onClick={async () => { if (window.confirm("Disconnect Zotero? Already indexed source metadata stays in Continuum until you delete it from Research.")) await action("/api/connections/zotero", { action: "disconnect" }, "zotero-disconnect"); }}>Disconnect</Button></div></> : null}
            {!status?.zotero.connected ? <div className="connection-actions"><Button className="button-primary" disabled={!status?.zotero.available} onClick={() => { setZoteroStep(1); setZoteroTest(undefined); setZoteroOpen(true); }}><KeyRound size={15} />Connect Zotero</Button></div> : null}
            <Guide title="Create the safest Zotero key" steps={["Open Zotero's official key page and create a new key named Continuum.", "Allow access to your personal library. Leave write access off; Continuum only needs to read.", "Paste the key above. Continuum validates it directly with Zotero before storing it encrypted.", "Run Sync library. Attachments and full-text PDFs are not imported automatically."]} official={[{ label: "Create a Zotero key", href: links.zoteroKey }, { label: "Zotero Web API guide", href: links.zoteroApi }]} />
          </ConnectionCard>

          <ConnectionCard icon={<BookOpen size={20} />} title="NotebookLM" status="Handoff" description="Create a concise Continuum source pack, then choose whether to add it to a NotebookLM notebook.">
            <p className="connection-note">Personal NotebookLM does not expose a general account-connection API. Continuum will not pretend it is connected or upload your work without you.</p>
            <div className="integration-tier-list"><span><strong>Source pack</strong> Available now</span><span><strong>Local connector</strong> Experimental · not installed</span><span><strong>Managed API</strong> Unavailable for personal accounts</span></div>
            <div className="connection-actions"><a className="button button-primary" href="/api/connections/notebooklm/export"><Download size={15} />Download source pack</a><Button className="button-secondary" disabled={busy === "notebook-query"} onClick={() => void copyNotebookQuery()}><Clipboard size={14} />{busy === "notebook-query" ? "Preparing…" : "Copy research query"}</Button><a className="button button-secondary" href="/api/connections/notebooklm/export?format=citations"><Download size={14} />Export citations</a><a className="button button-secondary" href={links.notebooklm} target="_blank" rel="noreferrer">Open NotebookLM<ExternalLink size={14} /></a></div>
            <Guide title="Continue in NotebookLM" steps={["Download the source pack. It contains projects, decisions, indexed-source titles, and recent verified outcomes—not your passwords or provider settings.", "Open NotebookLM and create or choose a notebook.", "Add the Markdown source pack as a source.", "Return to Continuum to record verified progress and keep your schedule current."]} official={[{ label: "Open NotebookLM", href: links.notebooklm }, { label: "Official NotebookLM help", href: links.notebookHelp }]} />
          </ConnectionCard>

          <ConnectionCard icon={<BookOpen size={20} />} title="Obsidian" status={status?.obsidian.tokens.length ? "Token active" : "Optional"} connected={Boolean(status?.obsidian.tokens.length)} description="Sync a folder you choose from a local Obsidian vault. Ordinary notes remain under your control.">
            <div className="connection-actions"><Button className="button-primary" disabled={!status?.obsidian.available || busy === "obsidian"} onClick={() => setObsidianOpen(true)}><KeyRound size={15} />Set up Obsidian</Button></div>
            {status?.obsidian.tokens.map((token) => <div className="connected-account" key={token.id}><div><strong>{token.name}</strong><span>Selected documents · memory updates</span><small>{token.lastUsedAt ? `Last used ${dateLabel(token.lastUsedAt)}` : `Created ${dateLabel(token.createdAt)}`}</small></div><button onClick={async () => { if (window.confirm(`Revoke ${token.name}?`)) await action("/api/integrations", { action: "revoke_integration_token", tokenId: token.id }, token.id); }}>Revoke</button></div>)}
            <Guide title="Install Continuum Sync" steps={["Install the Continuum Sync plugin files into your chosen vault's .obsidian/plugins/continuum-sync folder.", "Review and enable it under Settings → Community plugins.", "Create a token here and paste it into the plugin's secret prompt.", "Choose one folder and run a manual sync before enabling any automatic sync."]} official={[{ label: "Official Obsidian plugin guide", href: links.obsidian }, { label: "Official plugin security guide", href: links.obsidianSecurity }]} />
          </ConnectionCard>
        </div>
      </section>

      <section className="connection-section" aria-labelledby="local-title">
        <div className="section-heading"><div><p className="eyebrow">LOCAL AI</p><h2 id="local-title">Keep coding help on this computer</h2></div><p>Ollama is optional. Its URL and selected model stay in this browser.</p></div>
        <ConnectionCard icon={<Laptop size={20} />} title="Ollama" status={ollamaState?.reachable ? "Available locally" : "Optional"} connected={ollamaState?.reachable} description="Use a model running on your own computer from the Code workspace.">
          <div className="connection-actions"><Button className="button-primary" onClick={() => setOllamaOpen(true)}><Laptop size={15} />Choose local AI</Button></div>
          {ollamaState?.models.length ? <p className="connection-note"><strong>Installed:</strong> {ollamaState.models.slice(0, 6).map((model) => model.name).join(" · ")}</p> : null}
          <Guide title="Set up Ollama" steps={["Install Ollama from its official download page.", "Use Ollama's official CLI to install at least one code-capable model, then start Ollama.", "If your browser blocks the local request, allow only your Continuum origin in OLLAMA_ORIGINS.", "Test the connection here, then choose Ollama in the Code workspace."]} official={[{ label: "Official Ollama download", href: links.ollama }, { label: "Official Ollama API guide", href: links.ollamaApi }]} />
        </ConnectionCard>
      </section>
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
        footer={<><Button className="button-secondary" type="button" onClick={() => setOllamaOpen(false)}>Cancel</Button><Button className="button-primary" type="button" disabled={!ollamaState?.reachable || !ollamaModel || Boolean(ollamaState.models.find((model) => model.name === ollamaModel && model.size > 8 * 1024 ** 3))} onClick={saveOllama}>Save local AI</Button></>}
      >
        <div className="guided-config">
          <p><strong>Why it is needed:</strong> This address lets the Code tab request optional explanations from a model running on your computer.</p>
          <ol><li>Install Ollama from the official download page.</li><li>Install at least one code-capable model and start Ollama.</li><li>If the browser blocks the request, allow only your Continuum origin in <code>OLLAMA_ORIGINS</code>.</li><li>Enter the local address and test it before saving.</li></ol>
          <a className="button button-secondary" href={links.ollama} target="_blank" rel="noreferrer">Download Ollama <ExternalLink size={13} /></a>
          <label>Local Ollama address<input autoFocus inputMode="url" value={ollamaUrl} onChange={(event) => { setOllamaUrl(event.target.value); setOllamaState(undefined); }} placeholder="Example: http://127.0.0.1:11434" /></label>
          <Button className="button-secondary" type="button" disabled={busy === "ollama"} onClick={() => void testOllama()}>{busy === "ollama" ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}{busy === "ollama" ? "Testing…" : "Test connection"}</Button>
          {ollamaState?.reachable && ollamaState.models.length ? <label>Model<select value={ollamaModel} onChange={(event) => setOllamaModel(event.target.value)}>{ollamaState.models.map((model) => <option key={model.name} value={model.name}>{model.name} · {model.size ? `${(model.size / 1024 ** 3).toFixed(1)} GB` : "size unknown"}</option>)}</select><small>For a 16 GB Mac, choose a model below 8 GB. Continuum caps local requests to an 8K context so the computer remains responsive.</small></label> : null}
          {ollamaState ? <div className={ollamaState.reachable && ollamaState.models.length ? "config-test-success" : "config-test-error"} role="status"><strong>{ollamaState.reachable && ollamaState.models.length ? "Local AI is ready" : "Setup is incomplete"}</strong><span>{ollamaState.reachable ? (ollamaState.models.length ? `Found ${ollamaState.models.slice(0, 4).map((model) => model.name).join(", ")}.` : "Ollama responded, but no model is installed. Install a model, then test again.") : "Continuum could not reach this local address. Confirm Ollama is running and the address is correct."}</span></div> : null}
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
    </div>
  );
}
