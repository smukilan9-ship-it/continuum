"use client";

import { BookOpen, CalendarDays, Check, ChevronDown, Clipboard, Download, ExternalLink, KeyRound, Laptop, Library, Link2, LoaderCircle, RefreshCw, ShieldCheck, Unplug, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Badge, Button } from "@/components/ui";

type Status = {
  mcp: { endpoint: string; status: string; connections: Array<{ clientId: string; name: string; scopes: string[]; connectedAt: string; lastUsedAt?: string; calls: number }>; claude: { instructions: string[] } };
  googleCalendar: { connected: boolean; available: boolean; email?: string; lastSyncAt?: string; scopes: string[] };
  zotero: { connected: boolean; available: boolean; username?: string; lastSyncAt?: string; scopes: string[] };
  notebooklm: { mode: "source_pack"; accountConnectionAvailable: false };
  obsidian: { available: boolean; tokens: Array<{ id: string; name: string; scopes: string[]; lastUsedAt?: string; expiresAt?: string; createdAt: string }> };
};

type CredentialProvider = "openalex" | "youtube" | "featherless" | "semantic-scholar";
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
};
type CredentialPayload = {
  providers: Array<Omit<CredentialRecord, "status" | "masked" | "lastValidatedAt" | "lastUsedAt">>;
  configured: CredentialRecord[];
};

type Toast = (message: string | null) => void;

const links = {
  claude: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
  google: "https://support.google.com/accounts/answer/3466521",
  googleCalendar: "https://calendar.google.com/",
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
  onAction: (action: "configure" | "test" | "disconnect", provider: CredentialProvider, secret?: string, currentPassword?: string) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [secret, setSecret] = useState("");
  const [password, setPassword] = useState("");
  const working = busy === `credential-${provider.provider}`;
  const connected = configured?.status === "connected";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onAction("configure", provider.provider, secret, configured ? password : undefined)) {
      setSecret("");
      setPassword("");
      setExpanded(false);
    }
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
      </div>
      <div className="settings-row-actions">
        {configured ? <Button className="button-secondary" disabled={working} onClick={() => void onAction("test", provider.provider)}>{working ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}Test</Button> : null}
        <Button className={configured ? "button-quiet" : "button-primary"} disabled={working} onClick={() => setExpanded((value) => !value)}>{configured ? "Replace" : "Configure"}</Button>
      </div>
      {expanded ? <form className="credential-editor" onSubmit={(event) => void save(event)}>
        <label htmlFor={`secret-${provider.provider}`}>Provider API key</label>
        <input id={`secret-${provider.provider}`} type="password" autoComplete="off" required minLength={8} value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="Paste the key once" />
        {configured ? <><label htmlFor={`password-${provider.provider}`}>Current Continuum password</label><input id={`password-${provider.provider}`} type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></> : null}
        <div className="credential-editor-actions">
          <Button className="button-primary" disabled={working}>{working ? "Validating…" : configured ? "Validate & replace" : "Validate & save"}</Button>
          {configured ? <Button type="button" className="button-quiet danger" disabled={working || !password} onClick={async () => { if (window.confirm(`Disconnect ${provider.name}?`)) { const done = await onAction("disconnect", provider.provider, undefined, password); if (done) setExpanded(false); } }}>Disconnect</Button> : null}
        </div>
        <small>Submitted over HTTPS, validated directly with the provider, encrypted at rest, and never displayed again.</small>
      </form> : null}
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
  const [obsidianToken, setObsidianToken] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://127.0.0.1:11434");
  const [ollamaState, setOllamaState] = useState<{ reachable: boolean; models: string[] }>();

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
    const query = new URLSearchParams(window.location.search);
    if (query.get("connected") === "google-calendar") showToast("Google Calendar connected. Sync when you are ready.");
    if (query.get("connection_error")) showToast(query.get("connection_error") === "google_not_configured" ? "Google Calendar needs the app administrator to finish OAuth setup." : "Google Calendar was not connected. Try again.");
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
    if (result) { setZoteroKey(""); showToast("Zotero connected. Run the first library sync when ready."); }
  }

  async function testOllama() {
    setBusy("ollama");
    try {
      const url = new URL(ollamaUrl);
      if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Only a local Ollama address is allowed");
      const response = await fetch(new URL("/api/tags", url), { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
      const payload = await response.json() as { models?: Array<{ name: string }> };
      const models = (payload.models ?? []).map((model) => model.name);
      window.localStorage.setItem("continuum_ollama_url", url.origin);
      if (models[0]) window.localStorage.setItem("continuum_ollama_model", models[0]);
      setOllamaState({ reachable: true, models });
      showToast(models.length ? `Ollama is ready with ${models.length} local model${models.length === 1 ? "" : "s"}.` : "Ollama is reachable. Install a model to use it.");
    } catch (cause) { setOllamaState({ reachable: false, models: [] }); showToast(cause instanceof Error ? cause.message : "Ollama is unavailable"); }
    finally { setBusy(""); }
  }

  async function credentialAction(actionName: "configure" | "test" | "disconnect", provider: CredentialProvider, secret?: string, currentPassword?: string) {
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
            : { action: "test", provider }),
      });
      const payload = await response.json() as { error?: string; status?: string };
      if (!response.ok) throw new Error(payload.error ?? "The provider setting could not be updated");
      showToast(actionName === "test" ? `Provider health: ${payload.status ?? "connected"}.` : actionName === "disconnect" ? "Provider credential disconnected." : "Provider credential validated and encrypted.");
      await refresh();
      return true;
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "The provider setting could not be updated");
      return false;
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
        <div className="section-heading"><div><p className="eyebrow">PROVIDER SETTINGS</p><h2 id="providers-title">Your keys, your choice</h2></div><p>Continuum works without personal keys where public access exists. Connected secrets stay server-side and can be tested or revoked here.</p></div>
        {credentialError ? <div className="inline-alert" role="alert"><Unplug size={17} /><span>{credentialError}</span><button onClick={() => void refresh()}>Try again</button></div> : null}

        <div className="settings-group">
          <div className="settings-group-label"><span>AI providers</span><small>Optional cloud reasoning</small></div>
          {credentials?.providers.filter((provider) => provider.provider === "featherless").map((provider) => <ProviderCredentialRow key={provider.provider} provider={provider} configured={credentials.configured.find((item) => item.provider === provider.provider)} busy={busy} onAction={credentialAction} />)}
        </div>

        <div className="settings-group">
          <div className="settings-group-label"><span>Research</span><small>Discovery and citation data</small></div>
          {credentials?.providers.filter((provider) => ["openalex", "semantic-scholar"].includes(provider.provider)).map((provider) => <ProviderCredentialRow key={provider.provider} provider={provider} configured={credentials.configured.find((item) => item.provider === provider.provider)} busy={busy} onAction={credentialAction} />)}
          <PublicProviderRow name="Crossref" status="Public · no key needed" purpose="Verified DOI metadata and citation lookups through the public REST API." privacy="Research terms and identifiers are sent to Crossref only when you search." href="https://www.crossref.org/documentation/retrieve-metadata/rest-api/" action="API policy" />
          <PublicProviderRow name="Google Scholar" status="Handoff" purpose="Continue a prepared scholarly query in Google Scholar when its coverage is useful." privacy="Nothing is scraped or represented as an API integration; the query opens in a new tab." href="https://scholar.google.com/" action="Open Scholar" />
        </div>

        <div className="settings-group">
          <div className="settings-group-label"><span>Learning resources</span><small>Real, attributable material</small></div>
          {credentials?.providers.filter((provider) => provider.provider === "youtube").map((provider) => <ProviderCredentialRow key={provider.provider} provider={provider} configured={credentials.configured.find((item) => item.provider === provider.provider)} busy={busy} onAction={credentialAction} />)}
          <PublicProviderRow name="PhET Interactive Simulations" status="Verified curated registry" purpose="Open subject-matched simulations from PhET's maintained public catalog." privacy="Continuum stores the verified destination and attribution, not a fabricated API connection." href="https://phet.colorado.edu/en/simulations/browse" action="Browse PhET" />
        </div>
      </section>

      <section className="connection-section" aria-labelledby="assistants-title">
        <div className="section-heading"><div><p className="eyebrow">DEVELOPER & ASSISTANTS</p><h2 id="assistants-title">One memory, wherever you work</h2></div><p>Claude retrieves only the relevant context it requests. It never receives a raw history dump.</p></div>
        <ConnectionCard icon={<Link2 size={20} />} title="Claude" status={status?.mcp.connections.length ? "Connected" : "Ready to connect"} connected={Boolean(status?.mcp.connections.length)} description="Use your Continuum goals, projects, sources, decisions, progress, and schedule from Claude through remote MCP.">
          <div className="permission-line"><ShieldCheck size={15} /><span>OAuth sign-in · permission-scoped tools · consequential writes require approval</span></div>
          <div className="connection-actions"><Button className="button-primary" disabled={!status?.mcp.endpoint} onClick={() => void copy(status?.mcp.endpoint ?? "", "Connector URL")}><Clipboard size={15} />Copy connector URL</Button></div>
          <Guide title="Connect Claude in four steps" steps={status?.mcp.claude.instructions ?? ["Open Claude Customize → Connectors.", "Add a custom connector.", "Paste the Continuum connector URL.", "Sign in and review permissions."]} official={[{ label: "Claude's official connector guide", href: links.claude }]} />
          {status?.mcp.connections.map((connection) => <div className="connected-account" key={connection.clientId}><div><strong>{connection.name}</strong><span>{connection.scopes.map((scope) => scope.replace(":", " ")).join(" · ")}</span><small>{connection.lastUsedAt ? `Last used ${dateLabel(connection.lastUsedAt)}` : `Connected ${dateLabel(connection.connectedAt)}`}</small></div><button onClick={async () => { if (window.confirm(`Revoke ${connection.name}'s access to Continuum?`)) { await action("/api/integrations", { action: "revoke_mcp_client", clientId: connection.clientId }, connection.clientId); showToast("Claude access revoked."); } }}>Revoke</button></div>)}
        </ConnectionCard>
      </section>

      <section className="connection-section" aria-labelledby="study-tools-title">
        <div className="section-heading"><div><p className="eyebrow">PRODUCTIVITY</p><h2 id="study-tools-title">Calendar, sources, and notes</h2></div><p>Continuum syncs on your command, then turns changes into usable planning or retrieval context.</p></div>
        <div className="connection-list">
          <ConnectionCard id="google-calendar" icon={<CalendarDays size={20} />} title="Google Calendar" status={status?.googleCalendar.connected ? "Connected" : status?.googleCalendar.available ? "Not connected" : "Setup required"} connected={status?.googleCalendar.connected} description="Import busy times as planning constraints and add committed Continuum study blocks to your primary calendar.">
            {status?.googleCalendar.connected ? <><div className="connected-summary"><strong>{status.googleCalendar.email ?? "Google account"}</strong><span>Last sync: {dateLabel(status.googleCalendar.lastSyncAt)}</span></div><div className="connection-actions"><Button className="button-primary" disabled={busy === "google-sync"} onClick={async () => { const result = await action("/api/connections/google/sync", undefined, "google-sync"); if (result) showToast(`Calendar synced: ${result.imported ?? 0} busy times imported, ${result.exported ?? 0} study blocks added.`); }}>{busy === "google-sync" ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}Sync now</Button><Button className="button-quiet danger" onClick={async () => { if (window.confirm("Disconnect Google Calendar? Existing calendar events will remain, but future changes will stop syncing.")) await action("/api/connections/google/disconnect", undefined, "google-disconnect"); }}>Disconnect</Button></div></> : <div className="connection-actions"><a className={`button button-primary${status && !status.googleCalendar.available ? " disabled" : ""}`} aria-disabled={status && !status.googleCalendar.available ? true : undefined} href={status?.googleCalendar.available ? "/api/connections/google/start" : undefined}>Connect Google Calendar</a></div>}
            {!status?.googleCalendar.available ? <p className="connection-note">The app administrator must add the Google OAuth client before public accounts can connect. Your Continuum planner still works without it.</p> : null}
            <Guide title="What this connection can do" steps={["Google shows its consent screen before anything is shared.", "Continuum reads event times and titles from your primary calendar to avoid conflicts.", "Continuum can create only the study blocks you explicitly commit.", "Disconnect here or from your Google Account at any time."]} official={[{ label: "Manage third-party access at Google", href: links.google }, { label: "Open Google Calendar", href: links.googleCalendar }]} />
          </ConnectionCard>

          <ConnectionCard icon={<Library size={20} />} title="Zotero" status={status?.zotero.connected ? "Connected" : "Not connected"} connected={status?.zotero.connected} description="Index citation metadata and abstracts from your private Zotero library so research retrieval can find the right paper again.">
            {status?.zotero.connected ? <><div className="connected-summary"><strong>{status.zotero.username ?? "Private Zotero library"}</strong><span>Last sync: {dateLabel(status.zotero.lastSyncAt)}</span></div><div className="connection-actions"><Button className="button-primary" disabled={busy === "zotero-sync"} onClick={async () => { const result = await action("/api/connections/zotero", { action: "sync" }, "zotero-sync"); if (result) showToast(result.hasMore ? `${result.indexed ?? 0} items indexed. ${result.remaining ?? 0} remain; sync again to continue.` : `Zotero sync complete: ${result.indexed ?? 0} changed items indexed.`); }}>{busy === "zotero-sync" ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}Sync library</Button><Button className="button-quiet danger" onClick={async () => { if (window.confirm("Disconnect Zotero? Already indexed source metadata stays in Continuum until you delete it from Research.")) await action("/api/connections/zotero", { action: "disconnect" }, "zotero-disconnect"); }}>Disconnect</Button></div></> : <form className="key-connect-form" onSubmit={(event) => void connectZotero(event)}><label htmlFor="zotero-key">Zotero private key</label><div><input id="zotero-key" type="password" autoComplete="off" required minLength={16} value={zoteroKey} onChange={(event) => setZoteroKey(event.target.value)} placeholder="Paste a dedicated read-only key" /><Button className="button-primary" disabled={busy === "zotero-connect"}>{busy === "zotero-connect" ? "Checking…" : "Connect"}</Button></div><small>The key is encrypted before storage and is never shown again.</small></form>}
            <Guide title="Create the safest Zotero key" steps={["Open Zotero's official key page and create a new key named Continuum.", "Allow access to your personal library. Leave write access off; Continuum only needs to read.", "Paste the key above. Continuum validates it directly with Zotero before storing it encrypted.", "Run Sync library. Attachments and full-text PDFs are not imported automatically."]} official={[{ label: "Create a Zotero key", href: links.zoteroKey }, { label: "Zotero Web API guide", href: links.zoteroApi }]} />
          </ConnectionCard>

          <ConnectionCard icon={<BookOpen size={20} />} title="NotebookLM" status="Handoff" description="Create a concise Continuum source pack, then choose whether to add it to a NotebookLM notebook.">
            <p className="connection-note">Personal NotebookLM does not expose a general account-connection API. Continuum will not pretend it is connected or upload your work without you.</p>
            <div className="integration-tier-list"><span><strong>Source pack</strong> Available now</span><span><strong>Local connector</strong> Experimental · not installed</span><span><strong>Managed API</strong> Unavailable for personal accounts</span></div>
            <div className="connection-actions"><a className="button button-primary" href="/api/connections/notebooklm/export"><Download size={15} />Download source pack</a><Button className="button-secondary" disabled={busy === "notebook-query"} onClick={() => void copyNotebookQuery()}><Clipboard size={14} />{busy === "notebook-query" ? "Preparing…" : "Copy research query"}</Button><a className="button button-secondary" href="/api/connections/notebooklm/export?format=citations"><Download size={14} />Export citations</a><a className="button button-secondary" href={links.notebooklm} target="_blank" rel="noreferrer">Open NotebookLM<ExternalLink size={14} /></a></div>
            <Guide title="Continue in NotebookLM" steps={["Download the source pack. It contains projects, decisions, indexed-source titles, and recent verified outcomes—not your passwords or provider settings.", "Open NotebookLM and create or choose a notebook.", "Add the Markdown source pack as a source.", "Return to Continuum to record verified progress and keep your schedule current."]} official={[{ label: "Open NotebookLM", href: links.notebooklm }, { label: "Official NotebookLM help", href: links.notebookHelp }]} />
          </ConnectionCard>

          <ConnectionCard icon={<BookOpen size={20} />} title="Obsidian" status={status?.obsidian.tokens.length ? "Token active" : "Optional"} connected={Boolean(status?.obsidian.tokens.length)} description="Sync a folder you choose from a local Obsidian vault. Ordinary notes remain under your control.">
            <div className="connection-actions"><Button className="button-primary" disabled={!status?.obsidian.available || busy === "obsidian"} onClick={() => void action("/api/integrations", { action: "create_obsidian_token", name: "My Obsidian vault" }, "obsidian")}><KeyRound size={15} />Create vault token</Button></div>
            {obsidianToken ? <div className="one-time-token"><div><strong>Copy this token now</strong><button onClick={() => setObsidianToken("")} aria-label="Hide token"><X size={14} /></button></div><code>{obsidianToken}</code><Button className="button-secondary" onClick={() => void copy(obsidianToken, "Vault token")}><Clipboard size={14} />Copy</Button><small>Only the hash is stored. Continuum cannot show this token again.</small></div> : null}
            {status?.obsidian.tokens.map((token) => <div className="connected-account" key={token.id}><div><strong>{token.name}</strong><span>Selected documents · memory updates</span><small>{token.lastUsedAt ? `Last used ${dateLabel(token.lastUsedAt)}` : `Created ${dateLabel(token.createdAt)}`}</small></div><button onClick={async () => { if (window.confirm(`Revoke ${token.name}?`)) await action("/api/integrations", { action: "revoke_integration_token", tokenId: token.id }, token.id); }}>Revoke</button></div>)}
            <Guide title="Install Continuum Sync" steps={["Install the Continuum Sync plugin files into your chosen vault's .obsidian/plugins/continuum-sync folder.", "Review and enable it under Settings → Community plugins.", "Create a token here and paste it into the plugin's secret prompt.", "Choose one folder and run a manual sync before enabling any automatic sync."]} official={[{ label: "Official Obsidian plugin guide", href: links.obsidian }, { label: "Official plugin security guide", href: links.obsidianSecurity }]} />
          </ConnectionCard>
        </div>
      </section>

      <section className="connection-section" aria-labelledby="local-title">
        <div className="section-heading"><div><p className="eyebrow">LOCAL AI</p><h2 id="local-title">Keep coding help on this computer</h2></div><p>Ollama is optional. Its URL and selected model stay in this browser.</p></div>
        <ConnectionCard icon={<Laptop size={20} />} title="Ollama" status={ollamaState?.reachable ? "Available locally" : "Optional"} connected={ollamaState?.reachable} description="Use a model running on your own computer from the Code workspace.">
          <div className="local-connect-form"><label htmlFor="ollama-url">Local Ollama address</label><div><input id="ollama-url" inputMode="url" value={ollamaUrl} onChange={(event) => setOllamaUrl(event.target.value)} /><Button className="button-primary" disabled={busy === "ollama"} onClick={() => void testOllama()}>{busy === "ollama" ? "Testing…" : "Test connection"}</Button></div></div>
          {ollamaState?.models.length ? <p className="connection-note"><strong>Installed:</strong> {ollamaState.models.slice(0, 6).join(" · ")}</p> : null}
          <Guide title="Set up Ollama" steps={["Install Ollama from its official download page.", "Use Ollama's official CLI to install at least one code-capable model, then start Ollama.", "If your browser blocks the local request, allow only your Continuum origin in OLLAMA_ORIGINS.", "Test the connection here, then choose Ollama in the Code workspace."]} official={[{ label: "Official Ollama download", href: links.ollama }, { label: "Official Ollama API guide", href: links.ollamaApi }]} />
        </ConnectionCard>
      </section>
    </div>
  );
}
