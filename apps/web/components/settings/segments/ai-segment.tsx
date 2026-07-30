"use client";

import { KeyRound, Laptop, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Banner, Button, ConfirmationDialog, Field, Input, Select, StatusChip } from "@/components/ui";

import { OllamaDialog, useOllama } from "../ollama";
import { SettingsSection } from "../section";
import { SecretField, SetupDialog, SetupSteps, TestConnection, type TestResult } from "../setup-dialog";
import { statusTone } from "../status";

type Toast = (message: string | null) => void;

type ModelProvider = "featherless" | "groq" | "gemini";

type CatalogEntry = { provider: string; name: string; purpose: string; docs: string; category: string };
type ConfiguredEntry = CatalogEntry & { status: "connected" | "degraded" | "invalid"; masked: string; problem?: string };

/**
 * The boundary, stated where the decision is made (§9.11).
 *
 * Continuum's own provider keys — Gemini, Featherless, Groq, the AI Gateway —
 * are infrastructure. They stay server-side and are never shown to or requested
 * from a user (AC-ST1). The only key a user is ever asked for is their own, for
 * the one surface it applies to.
 */
const BYOK_BOUNDARY = "Used only for Assistant messages you send with your key selected. Learn, practice grading, research, and code help always use Continuum’s own models.";

export function AiSegment({ showToast }: { showToast: Toast }) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [configured, setConfigured] = useState<ConfiguredEntry[]>([]);
  const [loadError, setLoadError] = useState<string>();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [provider, setProvider] = useState<ModelProvider>("gemini");
  const [secret, setSecret] = useState("");
  const [password, setPassword] = useState("");
  const [test, setTest] = useState<TestResult>();
  const [busy, setBusy] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<ModelProvider>();

  const [ollamaOpen, setOllamaOpen] = useState(false);
  const ollama = useOllama(showToast);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/integrations/credentials", { cache: "no-store" });
      const payload = await response.json() as { providers?: CatalogEntry[]; configured?: ConfiguredEntry[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Your saved keys could not be loaded.");
      setCatalog((payload.providers ?? []).filter((entry) => entry.category === "model"));
      setConfigured((payload.configured ?? []).filter((entry) => entry.category === "model"));
      setLoadError(undefined);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Your saved keys could not be loaded.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const existing = configured.find((entry) => entry.provider === provider);

  async function runTest() {
    setBusy("test");
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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    try {
      const response = await fetch("/api/integrations/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "configure", provider, secret, ...(existing ? { currentPassword: password } : {}) }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The key could not be saved.");
      setSecret(""); setPassword(""); setTest(undefined); setDialogOpen(false);
      await load();
      showToast("Your key is encrypted and will be used only for Assistant messages you send with it selected.");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "The key could not be saved.");
    } finally { setBusy(""); }
  }

  async function remove(target: ModelProvider) {
    setBusy("delete");
    try {
      const response = await fetch("/api/integrations/credentials", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: target, currentPassword: password }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The key could not be deleted.");
      setPassword("");
      setDialogOpen(false);
      await load();
      showToast("Key deleted. The Assistant keeps working on Continuum’s own models.");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "The key could not be deleted.");
    } finally { setBusy(""); }
  }

  return (
    <>
      <SettingsSection title="How Continuum chooses a model" description="You never have to configure this. Continuum routes each request to a model suited to it and falls back automatically if one is unavailable.">
        <Banner tone="info" title="Continuum’s own provider keys are never requested from you">
          They are part of the service and stay on the server. The only key Continuum will ever ask you for is your own, and only for the Assistant.
        </Banner>
      </SettingsSection>

      <SettingsSection
        title="Your own API key"
        description={BYOK_BOUNDARY}
        action={<Button variant="secondary" onClick={() => { setTest(undefined); setDialogOpen(true); }}><KeyRound size={15} aria-hidden="true" />{configured.length ? "Manage keys" : "Use my own key"}</Button>}
      >
        {loadError ? <Banner tone="warning" title="Saved keys are unavailable">{loadError}</Banner> : null}
        {configured.length ? (
          <ul className="settings-key-list">
            {configured.map((entry) => (
              <li key={entry.provider}>
                <div>
                  <strong>{entry.name}</strong>
                  <span className="mono">{entry.masked}</span>
                  {entry.problem ? <small>{entry.problem}</small> : null}
                </div>
                <StatusChip
                  tone={entry.status === "connected" ? "success" : entry.status === "degraded" ? "warning" : "danger"}
                  label={entry.status === "connected" ? "Working" : entry.status === "degraded" ? "Needs attention" : "Expired"}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="settings-note">No personal key saved. The Assistant is using Continuum’s own models, which is the setup most people should stay on.</p>
        )}
      </SettingsSection>

      <SettingsSection
        title="Run AI on your own machine"
        description="Optional. Ollama gives the Code workspace coding help from a model on your computer instead of Continuum’s."
        action={<Button variant="secondary" onClick={() => setOllamaOpen(true)}><Laptop size={15} aria-hidden="true" />{ollama.state?.testPassed ? "Change local AI" : "Set up local AI"}</Button>}
      >
        <div className="settings-inline-status">
          <StatusChip tone={statusTone(ollama.status)} label={ollama.status} />
          <span>
            {ollama.state?.testPassed
              ? `Verified with ${ollama.state.testedModel}. The address and model are stored only in this browser.`
              : "Nothing leaves your computer. Continuum calls it only when you ask for AI help in Code."}
          </span>
        </div>
      </SettingsSection>

      <SetupDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) { setSecret(""); setPassword(""); setTest(undefined); } }}
        title="Use your own Assistant API key"
        description={BYOK_BOUNDARY}
        formId="byok-form"
        dirty={Boolean(secret || password)}
        dirtyMessage="Close without saving? The key and password you entered will be discarded."
        testPassed={Boolean(test?.ok)}
        testAttempted={Boolean(test)}
        blocked={Boolean(existing && !password)}
        saving={busy === "save"}
        saveLabel="Save key"
        secondaryAction={existing
          ? <Button variant="danger" disabled={Boolean(busy) || !password} onClick={() => setConfirmDelete(provider)}>Delete key</Button>
          : undefined}
      >
        <form id="byok-form" className="setup-body" onSubmit={(event) => void save(event)}>
          <SetupSteps
            steps={[
              "Choose the provider you already have an account with.",
              "Create a key in that provider's own console and copy it.",
              "Paste it below and test it — Continuum checks it live before saving.",
              "Pick “My API key” in the Assistant composer when you want a message billed to it.",
            ]}
            links={catalog.filter((entry) => entry.provider === provider).map((entry) => ({ label: `${entry.name} documentation`, href: entry.docs }))}
          />
          <Field label="Provider">
            {({ id }) => (
              <Select id={id} value={provider} onChange={(event) => { setProvider(event.target.value as ModelProvider); setTest(undefined); }}>
                {catalog.map((entry) => <option key={entry.provider} value={entry.provider}>{entry.name}</option>)}
              </Select>
            )}
          </Field>
          <SecretField
            label={existing ? "Replacement API key" : "API key"}
            hint="Encrypted before storage. Only its last four characters are ever shown again, and it is excluded from account exports."
            value={secret}
            onChange={(value) => { setSecret(value); setTest(undefined); }}
            placeholder="Paste a key dedicated to Continuum"
            minLength={8}
            maxLength={2000}
            autoFocus
          />
          <TestConnection onTest={() => void runTest()} busy={busy === "test"} disabled={secret.trim().length < 8} result={test} />
          {existing ? (
            <Field label="Current Continuum password" hint="Required before replacing or deleting a saved key.">
              {({ id, describedBy }) => (
                <Input id={id} aria-describedby={describedBy} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
              )}
            </Field>
          ) : null}
          <p className="setup-privacy">
            <ShieldCheck size={14} aria-hidden="true" />
            Continuum sends the provider only the message you wrote and the context you chose for it. Your password, memory, and notes are never included.
          </p>
        </form>
      </SetupDialog>

      <OllamaDialog open={ollamaOpen} onOpenChange={setOllamaOpen} ollama={ollama} />

      <ConfirmationDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => { if (!open) setConfirmDelete(undefined); }}
        title="Delete this Assistant API key?"
        description="The Assistant keeps working on Continuum’s own models. Only messages you explicitly sent with your key selected used it."
        confirmLabel="Delete key"
        destructive
        busy={busy === "delete"}
        onConfirm={() => { const target = confirmDelete; setConfirmDelete(undefined); if (target) void remove(target); }}
      />
    </>
  );
}
