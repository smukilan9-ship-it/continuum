"use client";

import {
  BookOpen,
  CheckCircle2,
  Clipboard,
  Cloud,
  Cpu,
  Database,
  ExternalLink,
  KeyRound,
  Laptop,
  Link2,
  LockKeyhole,
  RefreshCw,
  Server,
  ShieldCheck,
  Unplug,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge, Button, Card } from "@/components/ui";

type IntegrationStatus = {
  mcp: {
    endpoint: string;
    status: string;
    connections: Array<{ clientId: string; name: string; scopes: string[]; expiresAt: string; connectedAt: string }>;
    claude: { instructions: string[] };
    chatgpt: { status: string };
  };
  providers: {
    aiGateway: boolean;
    gemini: boolean;
    geminiKeyCount: number;
    groq: boolean;
    groqModels?: { fast: string; reasoning: string; code: string; verifier: string };
    gatewayModels: { general: string; multimodal: string; fallbacks: string[] };
    embeddings: { configured: boolean; provider?: string; model?: string; dimensions?: number; geminiKeyCount: number; fallbacks: string[] };
    featherless: {
      configured: boolean;
      reachable?: boolean;
      plan?: { name: string; concurrencyUnits: number; maxContextLength?: number };
      catalog?: { reachable: boolean; eligibleModels?: number; mode: "live_catalog" | "curated_verified" };
      error?: string;
    };
    groqStatus: {
      configured: boolean;
      reachable?: boolean;
      availableModelCount?: number;
      policy?: { fast: string; reasoning: string; code: string; verifier: string };
      error?: string;
    };
  };
  obsidian: {
    available: boolean;
    tokens: Array<{ id: string; name: string; scopes: string[]; lastUsedAt?: string; expiresAt?: string; createdAt: string }>;
  };
};

type Toast = (message: string | null) => void;

const officialLinks = {
  claude: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
  featherless: "https://featherless.ai/docs/quickstart-guide",
  featherlessModels: "https://featherless.ai/docs/api-reference-models",
  geminiKeys: "https://ai.google.dev/gemini-api/docs/api-key",
  geminiModels: "https://ai.google.dev/gemini-api/docs/models",
  groq: "https://console.groq.com/docs/quickstart",
  groqModels: "https://console.groq.com/docs/models",
  ollama: "https://ollama.com/download",
  ollamaApi: "https://docs.ollama.com/api/introduction",
  obsidian: "https://obsidian.md/help/community-plugins",
  obsidianSecurity: "https://obsidian.md/help/Extending%2BObsidian/Plugin%2Bsecurity",
  gateway: "https://vercel.com/docs/ai-gateway/authentication-and-byok",
  chatgpt: "https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta",
  xai: "https://docs.x.ai/developers/rest-api-reference/inference/models",
};

function SetupGuide({ title, steps, links }: { title: string; steps: string[]; links: Array<{ label: string; href: string }> }) {
  return (
    <details className="setup-guide">
      <summary>{title}</summary>
      <ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol>
      <div className="official-links">
        {links.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer"><ExternalLink size={14} />{link.label}</a>)}
      </div>
    </details>
  );
}

function IntegrationCard({ icon, name, status, tone = "neutral", description, children }: { icon: ReactNode; name: string; status: string; tone?: string; description: string; children: ReactNode }) {
  return (
    <Card className="integration-card">
      <div className="integration-heading">
        <span className="integration-icon">{icon}</span>
        <Badge tone={tone}>{status}</Badge>
      </div>
      <h2>{name}</h2>
      <p>{description}</p>
      {children}
    </Card>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <div className="integration-facts">{children}</div>;
}

export function IntegrationsScreen({ showToast }: { showToast: Toast }) {
  const [status, setStatus] = useState<IntegrationStatus>();
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<string>();
  const [obsidianToken, setObsidianToken] = useState<string>();
  const [ollamaUrl, setOllamaUrl] = useState("http://127.0.0.1:11434");
  const [ollamaState, setOllamaState] = useState<{ reachable: boolean; models: string[] }>();

  const refresh = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/integrations", { cache: "no-store" });
      const payload = await response.json() as IntegrationStatus & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Integration status is unavailable");
      setStatus(payload);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Integration status is unavailable");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const saved = window.localStorage.getItem("continuum_ollama_url");
    if (saved) setOllamaUrl(saved);
  }, [refresh]);

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); showToast(`${label} copied.`); }
    catch { showToast(`Could not copy ${label.toLowerCase()}. Select it manually.`); }
  }

  async function integrationAction(action: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const response = await fetch("/api/integrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action) });
      const payload = await response.json() as { token?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The integration change failed");
      if (payload.token) setObsidianToken(payload.token);
      await refresh();
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The integration change failed");
      return false;
    } finally { setBusy(undefined); }
  }

  async function testOllama() {
    setBusy("ollama");
    try {
      const url = new URL(ollamaUrl);
      if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Only a loopback Ollama URL is allowed");
      const response = await fetch(new URL("/api/tags", url), { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
      const payload = await response.json() as { models?: Array<{ name: string }> };
      const models = (payload.models ?? []).map((model) => model.name);
      window.localStorage.setItem("continuum_ollama_url", url.origin);
      if (models[0]) window.localStorage.setItem("continuum_ollama_model", models[0]);
      setOllamaState({ reachable: true, models });
      showToast(models.length ? `Local Ollama is reachable. Found ${models.length} model${models.length === 1 ? "" : "s"}.` : "Local Ollama is reachable, but no models are installed.");
    } catch (error) {
      setOllamaState({ reachable: false, models: [] });
      showToast(error instanceof Error ? error.message : "Local Ollama is unavailable");
    } finally { setBusy(undefined); }
  }

  const connectedClaude = Boolean(status?.mcp.connections.length);
  const featherless = status?.providers.featherless;
  const groq = status?.providers.groqStatus;

  return (
    <div className="screen">
      <header className="page-intro">
        <div>
          <p className="eyebrow">CONNECTIONS</p>
          <h1>Your context can leave the app safely.</h1>
          <p className="page-description">Connect tools one at a time, see exactly what they can access, and revoke them without deleting your academic state.</p>
        </div>
        <Button className="button-secondary" onClick={() => void refresh()} disabled={busy === "refresh"}><RefreshCw size={16} />Refresh status</Button>
      </header>

      <section className={`service-banner ${status?.mcp.status === "ready" ? "service-ready" : "service-warning"}`}>
        <div><Server size={20} /><div><strong>Continuum remote MCP</strong><span>{status?.mcp.endpoint ?? "Checking the user-scoped endpoint…"}</span></div></div>
        <Badge tone={status?.mcp.status === "ready" ? "green" : "orange"}>{status?.mcp.status ?? "Checking"}</Badge>
      </section>
      {loadError && <div className="inline-alert" role="alert"><Unplug size={17} /><span>{loadError}</span><button onClick={() => void refresh()}>Retry</button></div>}

      <div className="section-heading"><div><p className="eyebrow">ACADEMIC MEMORY</p><h2>Use Continuum from the tools you already open</h2></div></div>
      <section className="integration-grid integration-grid-primary">
        <IntegrationCard icon={<Link2 size={20} />} name="Claude" status={connectedClaude ? "Connected" : "Ready"} tone={connectedClaude ? "green" : "blue"} description="Claude reads the same goals, projects, learning state, sources, receipts, and schedule as this app. Writes use scoped tools; consequential changes become proposals.">
          <Facts><span><ShieldCheck size={15} />OAuth + PKCE</span><span><KeyRound size={15} />Separate read and write scopes</span><span><Database size={15} />Shared user-owned state</span></Facts>
          <div className="integration-actions"><Button className="button-secondary" disabled={!status?.mcp.endpoint} onClick={() => void copy(status?.mcp.endpoint ?? "", "MCP endpoint")}><Clipboard size={15} />Copy endpoint</Button></div>
          <SetupGuide title="Connect Claude" steps={status?.mcp.claude.instructions ?? ["Open Claude and go to Customize → Connectors.", "Choose Add custom connector.", "Paste this deployment’s /api/mcp endpoint.", "Complete Continuum sign-in and review every requested scope."]} links={[{ label: "Official Claude connector guide", href: officialLinks.claude }]} />
          {status?.mcp.connections.map((connection) => <div className="connection-row" key={connection.clientId}><div><strong>{connection.name}</strong><span>{connection.scopes.join(" · ")}</span><small>Connected {new Date(connection.connectedAt).toLocaleDateString()}</small></div><button disabled={busy === connection.clientId} onClick={async () => { if (await integrationAction({ action: "revoke_mcp_client", clientId: connection.clientId }, connection.clientId)) showToast("Claude access revoked."); }}>Revoke</button></div>)}
        </IntegrationCard>

        <IntegrationCard icon={<BookOpen size={20} />} name="Obsidian" status={status?.obsidian.tokens.length ? "Token active" : "Optional"} tone={status?.obsidian.tokens.length ? "green" : "neutral"} description="Sync only a folder you choose. Continuum indexes opted-in documents and can write its own receipts without overwriting ordinary notes.">
          <Facts><span><LockKeyhole size={15} />One-time revocable token</span><span><Database size={15} />Selected-folder sync</span><span><ShieldCheck size={15} />Private Blob when configured</span></Facts>
          <div className="integration-actions"><Button className="button-secondary" disabled={!status?.obsidian.available || busy === "obsidian"} onClick={() => void integrationAction({ action: "create_obsidian_token", name: "My Obsidian vault" }, "obsidian")}><KeyRound size={15} />Create vault token</Button></div>
          <SetupGuide title="Install Continuum Sync" steps={["Build the plugin with pnpm --filter @continuum/obsidian-plugin build.", "Copy manifest.json, main.js, and versions.json into <vault>/.obsidian/plugins/continuum-sync/.", "Review the plugin code, then enable it from Settings → Community plugins.", "Create a vault token here, store it in the plugin’s SecretStorage prompt, choose one folder, and run a manual sync first."]} links={[{ label: "Official Obsidian plugin guide", href: officialLinks.obsidian }, { label: "Official plugin security guide", href: officialLinks.obsidianSecurity }]} />
          {obsidianToken && <div className="one-time-token"><div><strong>Copy this token now</strong><button onClick={() => setObsidianToken(undefined)} aria-label="Hide one-time token"><X size={15} /></button></div><code>{obsidianToken}</code><Button className="button-secondary" onClick={() => void copy(obsidianToken, "Vault token")}><Clipboard size={14} />Copy token</Button><small>Continuum stores only its hash. This value cannot be displayed again.</small></div>}
          {status?.obsidian.tokens.map((token) => <div className="connection-row" key={token.id}><div><strong>{token.name}</strong><span>{token.scopes.join(" · ")}</span><small>Expires {token.expiresAt ? new Date(token.expiresAt).toLocaleDateString() : "never"}</small></div><button disabled={busy === token.id} onClick={async () => { if (await integrationAction({ action: "revoke_integration_token", tokenId: token.id }, token.id)) showToast("Obsidian token revoked."); }}>Revoke</button></div>)}
        </IntegrationCard>

        <IntegrationCard icon={<Laptop size={20} />} name="Ollama" status={ollamaState?.reachable ? "Local connected" : "Optional"} tone={ollamaState?.reachable ? "green" : "neutral"} description="Use a model running on this computer. The browser connector accepts loopback addresses only and stores the selected URL locally in this browser.">
          <div className="local-provider-form"><label htmlFor="ollama-url">Local API URL</label><div><input id="ollama-url" value={ollamaUrl} onChange={(event) => setOllamaUrl(event.target.value)} /><Button className="button-secondary" disabled={busy === "ollama"} onClick={() => void testOllama()}>{busy === "ollama" ? "Testing…" : "Test connection"}</Button></div></div>
          {ollamaState?.models.length ? <div className="model-list"><strong>Installed models</strong><span>{ollamaState.models.slice(0, 6).join(" · ")}</span></div> : null}
          <SetupGuide title="Install Ollama locally" steps={["Install Ollama from the official download page.", "Install at least one model with the official CLI and start Ollama.", "If the browser blocks the request, add only your Continuum origin to OLLAMA_ORIGINS and restart Ollama.", "Keep the loopback URL above and test the connection again."]} links={[{ label: "Official Ollama download", href: officialLinks.ollama }, { label: "Official Ollama API", href: officialLinks.ollamaApi }]} />
        </IntegrationCard>
      </section>

      <div className="section-heading"><div><p className="eyebrow">MODEL RUNTIME</p><h2>Server-side providers and the models they handle</h2></div><p>Keys never reach the browser. Routing is task-specific, budgeted, logged, and subject to per-user limits.</p></div>
      <section className="integration-grid">
        <IntegrationCard icon={<Cloud size={20} />} name="Featherless" status={featherless?.reachable ? "Ready" : featherless?.configured ? "Check failed" : "Not configured"} tone={featherless?.reachable ? "green" : "orange"} description="Primary open-model reasoning provider. The app uses reviewed provider model IDs and respects the four-unit account concurrency limit.">
          <Facts><span><Zap size={15} />Fast · Qwen3.5 9B</span><span><Cpu size={15} />Reasoning · Qwen3.6 27B</span><span><ShieldCheck size={15} />Verifier · GPT-OSS 20B</span></Facts>
          <div className="provider-summary"><strong>{featherless?.plan?.name ?? "Plan unavailable"}</strong><span>{featherless?.plan ? `${featherless.plan.concurrencyUnits} concurrency units` : featherless?.error ?? "Add the server key to enable it."}</span><small>{featherless?.catalog?.mode === "live_catalog" ? `${featherless.catalog.eligibleModels ?? 0} plan models discovered; the reviewed allowlist still controls routing.` : "The catalog endpoint is degraded; live-probed reviewed models are used."}</small></div>
          <SetupGuide title="Configure Featherless" steps={["Create a key from the Featherless account API Keys page.", "Local: put FEATHERLESS_API_KEY only in the repository-root .env.local file.", "Use the reviewed FEATHERLESS_*_MODEL values from .env.example; expand the allowlist only after a model capability and safety review.", "Hosted: add the key as a Sensitive server-only environment variable, then verify this card after deployment."]} links={[{ label: "Official Featherless quickstart", href: officialLinks.featherless }, { label: "Official model API", href: officialLinks.featherlessModels }]} />
        </IntegrationCard>

        <IntegrationCard icon={<Zap size={20} />} name="Groq Cloud" status={groq?.reachable ? "Ready" : groq?.configured ? "Check failed" : "Not configured"} tone={groq?.reachable ? "green" : "orange"} description="Low-latency structured inference for bounded tasks. Groq is a provider; it is not Grok, the paid xAI model family.">
          <Facts><span><Zap size={15} />Fast · {groq?.policy?.fast ?? status?.providers.groqModels?.fast ?? "llama-3.1-8b-instant"}</span><span><Cpu size={15} />Reasoning · {groq?.policy?.reasoning ?? "qwen/qwen3.6-27b"}</span><span><Server size={15} />{groq?.availableModelCount ?? 0} enabled catalog models</span></Facts>
          <SetupGuide title="Configure Groq Cloud" steps={["Create a key in the Groq Console.", "Local: put GROQ_API_KEY only in .env.local. Reviewed public model IDs are already in .env.example.", "Hosted: add the key as a Sensitive server-only variable.", "Reload this page and confirm Ready; the app validates each selected ID against the authenticated model catalog."]} links={[{ label: "Official Groq quickstart", href: officialLinks.groq }, { label: "Official Groq models", href: officialLinks.groqModels }]} />
        </IntegrationCard>

        <IntegrationCard icon={<Database size={20} />} name="Gemini + semantic search" status={status?.providers.gemini ? "Ready" : "Not enabled"} tone={status?.providers.gemini ? "green" : "orange"} description="Gemini handles multimodal work and 1,536-dimensional retrieval embeddings. The key pool rotates for credential failover, never to bypass project quotas.">
          <Facts><span><Cpu size={15} />Generation · gemini-3.5-flash</span><span><Database size={15} />Embedding · {status?.providers.embeddings.model ?? "gemini-embedding-001"}</span><span><KeyRound size={15} />{status?.providers.geminiKeyCount ?? 0}/10 key slots active</span></Facts>
          <SetupGuide title="Configure the ten-key pool" steps={["Create and restrict each key using Google’s official API key guide.", "Put them in repository-root .env.local as GEMINI_API_KEY_1 through GEMINI_API_KEY_10.", "After reviewing Google’s data terms, set GEMINI_DATA_USE_ACKNOWLEDGED=true.", "Keys in one Google Cloud project share that project’s quota. Rotation is only failover and must not be used to evade limits.", "Keep GEMINI_EMBEDDING_MODEL stable unless you re-embed the entire vector index."]} links={[{ label: "Official Gemini key guide", href: officialLinks.geminiKeys }, { label: "Official Gemini models", href: officialLinks.geminiModels }]} />
        </IntegrationCard>

        <IntegrationCard icon={<Server size={20} />} name="Vercel AI Gateway" status={status?.providers.aiGateway ? "Fallback ready" : "Disabled"} tone={status?.providers.aiGateway ? "green" : "neutral"} description="Optional metered fallback and verification route. An automatic Vercel OIDC token does not activate it; the operator must explicitly enable paid routing.">
          <Facts>{status?.providers.aiGateway ? <><span><Cpu size={15} />{status.providers.gatewayModels.general}</span><span><RefreshCw size={15} />{status.providers.gatewayModels.fallbacks.join(" → ") || "No fallbacks configured"}</span></> : <span><LockKeyhole size={15} />No metered Gateway route is active</span>}</Facts>
          <SetupGuide title="Configure AI Gateway" steps={["Review Gateway and provider pricing before enabling this optional route.", "On Vercel, prefer the automatically provisioned VERCEL_OIDC_TOKEN; for local work, store AI_GATEWAY_API_KEY in .env.local.", "Set AI_GATEWAY_ENABLED=true only after accepting the metered cost.", "Review model capability and cost before changing gateway fallbacks."]} links={[{ label: "Official Gateway authentication", href: officialLinks.gateway }]} />
        </IntegrationCard>
      </section>

      <Card className="not-enabled-card">
        <div><LockKeyhole size={20} /><div><strong>Intentionally not enabled</strong><span>These providers are not silently routed or shown as connected.</span></div></div>
        <div className="not-enabled-list"><span><b>Grok / xAI</b> Paid provider; no key, model, or fallback configured. <a href={officialLinks.xai} target="_blank" rel="noreferrer">Official reference <ExternalLink size={12} /></a></span><span><b>ChatGPT MCP</b> Future scope for this deployment. <a href={officialLinks.chatgpt} target="_blank" rel="noreferrer">Official availability guide <ExternalLink size={12} /></a></span></div>
      </Card>

      <Card className="trust-card"><CheckCircle2 size={20} /><div><strong>Reading never grants writing.</strong><p>OAuth scopes are separate, tokens are revocable, and goal, project, task, and schedule changes arrive as visible proposals. A schedule commit needs another explicit confirmation.</p></div></Card>
    </div>
  );
}
