"use client";

import { Clipboard, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button, DataRegion, ErrorState, Field, Input, LoadingState, StatusChip } from "@/components/ui";

import { SettingsFact, SettingsSection } from "../section";

type Toast = (message: string | null) => void;

type ProviderReport = { provider: string; configured: boolean; status: string; model?: string; latencyMs?: number; detail: string };
type AiStatus = { status: string; providers: ProviderReport[]; checkedAt: string };
type Health = { status: string };

function toneFor(status: string) {
  if (status === "healthy") return "success" as const;
  if (status === "degraded") return "warning" as const;
  if (status === "not_configured") return "neutral" as const;
  return "danger" as const;
}

export function AdvancedSegment({ showToast }: { showToast: Toast }) {
  const [endpoint, setEndpoint] = useState("");
  const [ai, setAi] = useState<AiStatus>();
  const [aiState, setAiState] = useState<"loading" | "ready" | "error">("loading");
  const [health, setHealth] = useState<Health>();

  useEffect(() => {
    void fetch("/api/integrations", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ mcp?: { endpoint?: string } }> : undefined)
      .then((payload) => setEndpoint(payload?.mcp?.endpoint ?? ""))
      .catch(() => setEndpoint(""));
    void fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json() as Promise<Health>)
      .then(setHealth)
      .catch(() => setHealth(undefined));
  }, []);

  const loadAi = useCallback(async () => {
    setAiState("loading");
    try {
      const response = await fetch("/api/ai/status", { cache: "no-store" });
      const payload = await response.json() as AiStatus & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Provider health is unavailable");
      setAi(payload);
      setAiState("ready");
    } catch {
      setAiState("error");
    }
  }, []);

  useEffect(() => { void loadAi(); }, [loadAi]);

  async function copyEndpoint() {
    try { await navigator.clipboard.writeText(endpoint); showToast("Connector address copied."); }
    catch { showToast("Could not copy the address. Select it manually."); }
  }

  return (
    <>
      <SettingsSection title="Connector address" description="The address a client such as Claude uses to reach your Continuum account. It is not a secret and carries no credentials.">
        <Field label="Remote connector address">
          {({ id }) => (
            <div className="copy-row">
              <Input id={id} readOnly value={endpoint || "Loading…"} />
              <Button variant="secondary" disabled={!endpoint} onClick={() => void copyEndpoint()}><Clipboard size={14} aria-hidden="true" />Copy</Button>
            </div>
          )}
        </Field>
      </SettingsSection>

      <SettingsSection
        title="Model availability"
        description="A live check of the models Continuum can reach right now. Nothing here needs configuring by you."
        action={<Button variant="secondary" onClick={() => void loadAi()}><RefreshCw size={14} aria-hidden="true" />Re-check</Button>}
      >
        <DataRegion
          status={aiState}
          loading={<LoadingState rows={3} label="Checking model availability" />}
          error={<ErrorState title="The check did not complete" body="This does not mean the models are down — the check itself failed." action={<Button variant="secondary" onClick={() => void loadAi()}>Try again</Button>} />}
        >
          <ul className="settings-key-list">
            {ai?.providers.map((report) => (
              <li key={report.provider}>
                <div>
                  <strong>{report.provider}</strong>
                  <span>{report.detail}{report.model ? ` · ${report.model}` : ""}{typeof report.latencyMs === "number" ? ` · ${report.latencyMs} ms` : ""}</span>
                </div>
                <StatusChip tone={toneFor(report.status)} label={report.status === "not_configured" ? "Not configured" : report.status === "healthy" ? "Working" : report.status === "degraded" ? "Needs attention" : "Unavailable"} />
              </li>
            ))}
          </ul>
        </DataRegion>
      </SettingsSection>

      <SettingsSection title="Diagnostics" description="Useful when reporting a problem.">
        <dl className="settings-facts">
          <SettingsFact label="Service" value={health ? (health.status === "ready" ? "Ready" : "Misconfigured") : "Checking…"} />
          <SettingsFact label="Last model check" value={ai ? new Date(ai.checkedAt).toLocaleString() : "—"} />
          <SettingsFact label="Interface" value={<span className="mono">Continuum web</span>} hint="Report problems with the address of the page you were on." />
        </dl>
      </SettingsSection>
    </>
  );
}
