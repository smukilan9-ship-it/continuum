"use client";

import { ExternalLink, Laptop } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Banner, Button, Field, Input, Modal, Select } from "@/components/ui";

import { ConnectionCard } from "./connection-card";
import { SetupSteps } from "./setup-dialog";
import { CONNECTION_STATUS, type ConnectionStatus } from "./status";

type Toast = (message: string | null) => void;

export const OLLAMA_LINKS = {
  download: "https://ollama.com/download",
  api: "https://docs.ollama.com/api/introduction",
};

export type OllamaState = {
  reachable: boolean;
  testPassed: boolean;
  models: Array<{ name: string; size: number }>;
  latencyMs?: number;
  firstTokenMs?: number;
  testedModel?: string;
  code?: "not_running" | "connection_blocked" | "request_timed_out" | "incompatible_endpoint" | "model_unavailable" | "invalid_response";
  message?: string;
};

function isSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  return /Safari/i.test(navigator.userAgent) && !/(Chrome|Chromium|CriOS|Edg|OPR)/i.test(navigator.userAgent);
}

/**
 * The local-AI diagnostic engine, moved out of the Connections list and into the
 * setup dialog it belongs to (§9.11, S4) — unchanged.
 *
 * It is the most careful piece of diagnosis in the product and deleting it to
 * "simplify" the page would have been the wrong trade: six distinguishable
 * failure codes, a streaming round-trip rather than a reachability ping, an 8 GB
 * model guard, and the Safari case — an HTTPS page cannot call an HTTP loopback
 * API, so Ollama is healthy and the browser is the problem. A generic "could not
 * connect" sends that user to reinstall software that was never broken.
 */
export function useOllama(showToast: Toast) {
  const [url, setUrl] = useState("http://127.0.0.1:11434");
  const [model, setModel] = useState("");
  const [state, setState] = useState<OllamaState>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("continuum_ollama_url");
    if (saved) setUrl(saved);
    setModel(window.localStorage.getItem("continuum_ollama_model") ?? "");
  }, []);

  const test = useCallback(async () => {
    setBusy(true);
    const startedAt = performance.now();
    try {
      const parsed = new URL(url);
      if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) throw new Error("Only a local Ollama address is allowed");
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Use an http:// or https:// local Ollama address");
      const response = await fetch(new URL("/api/tags", parsed), { signal: AbortSignal.timeout(6_000) });
      if (response.status === 404) {
        setState({ reachable: true, testPassed: false, models: [], code: "incompatible_endpoint", message: "This server does not expose Ollama’s /api/tags endpoint. Use the Ollama API address, usually http://127.0.0.1:11434." });
        return;
      }
      if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status} while listing models`);
      const payload = await response.json() as { models?: Array<{ name: string; size?: number }> };
      const models = (payload.models ?? []).map((entry) => ({ name: entry.name, size: entry.size ?? 0 }));
      const current = models.find((entry) => entry.name === model && entry.size <= 8 * 1024 ** 3);
      const recommended = [...models].filter((entry) => !entry.size || entry.size <= 8 * 1024 ** 3).sort((left, right) => left.size - right.size)[0];
      const selectedModel = current?.name ?? recommended?.name;
      setModel(selectedModel ?? models[0]?.name ?? "");
      if (!models.length) {
        setState({ reachable: true, testPassed: false, models, code: "model_unavailable", message: "Ollama is running, but no model is installed. Install a small model, then test again." });
        return;
      }
      if (!selectedModel) {
        setState({ reachable: true, testPassed: false, models, code: "model_unavailable", message: "The installed models are over Continuum’s 8 GB local-safety limit. Install or select a smaller model." });
        return;
      }

      const testStartedAt = performance.now();
      const testResponse = await fetch(new URL("/api/chat", parsed), {
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
        setState({ reachable: true, testPassed: false, models, code: "incompatible_endpoint", message: "Model listing works, but /api/chat is unavailable. Update Ollama and confirm this is its native API address." });
        return;
      }
      if (!testResponse.ok || !testResponse.body) {
        const modelMissing = testResponse.status === 400 || testResponse.status === 404;
        setState({
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
        setState({ reachable: true, testPassed: false, models, code: "invalid_response", message: "Ollama streamed a response, but it contained no text. Try another installed model." });
        return;
      }
      const latencyMs = Math.round(performance.now() - testStartedAt);
      setState({ reachable: true, testPassed: true, models, latencyMs, firstTokenMs, testedModel: selectedModel, message: `Streaming test passed with ${selectedModel}.` });
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
      setState({ reachable: false, testPassed: false, models: [], code, message });
      showToast(message);
    } finally {
      setBusy(false);
    }
  }, [model, showToast, url]);

  const save = useCallback(() => {
    if (!state?.testPassed || state.testedModel !== model) return false;
    window.localStorage.setItem("continuum_ollama_url", new URL(url).origin);
    window.localStorage.setItem("continuum_ollama_model", model);
    showToast(`Local AI saved with ${model}.`);
    return true;
  }, [model, showToast, state, url]);

  const oversized = Boolean(state?.models.find((entry) => entry.name === model && entry.size > 8 * 1024 ** 3));
  const savable = Boolean(state?.testPassed) && state?.testedModel === model && !oversized;

  const status: ConnectionStatus = state?.testPassed
    ? CONNECTION_STATUS.WORKING
    : state
      ? CONNECTION_STATUS.NEEDS_ATTENTION
      : CONNECTION_STATUS.NOT_CONNECTED;

  return { url, setUrl, model, setModel, state, setState, busy, test, save, oversized, savable, status };
}

export type OllamaController = ReturnType<typeof useOllama>;

/**
 * The setup dialog. It does not use `SetupDialog`'s "Save anyway" escape hatch:
 * an unverified local endpoint is not a key that might work later, it is a
 * request the Code workspace would silently fail on, so the gate stays absolute.
 */
export function OllamaDialog({ open, onOpenChange, ollama }: { open: boolean; onOpenChange: (open: boolean) => void; ollama: OllamaController }) {
  const { url, setUrl, model, setModel, state, setState, busy, test, save, oversized, savable } = ollama;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Run AI on your own machine"
      description="Ollama is optional and affects AI help only. Running code in Continuum does not use Ollama or any other model."
      footer={
        <>
          <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="button" disabled={!savable} onClick={() => { if (save()) onOpenChange(false); }}>Save local AI</Button>
        </>
      }
    >
      <div className="setup-body">
        <p className="setup-why"><strong>Why this is needed:</strong> the address lets the Code workspace request optional explanations from a model running on your computer.</p>
        <SetupSteps
          steps={[
            "Install Ollama from the official download page.",
            "Install at least one code-capable model and start Ollama.",
            <>Allow only your Continuum origin in <code>OLLAMA_ORIGINS</code>.</>,
            "Use Chrome or Edge for local AI and allow Continuum’s Local Network Access site permission. Safari blocks the secure Continuum page from calling Ollama’s HTTP loopback API.",
            "Enter the local address and test it before saving.",
          ]}
          links={[{ label: "Download Ollama", href: OLLAMA_LINKS.download }, { label: "Ollama API guide", href: OLLAMA_LINKS.api }]}
        />
        <Field label="Local Ollama address" hint="Only a loopback address is accepted.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              autoFocus
              inputMode="url"
              value={url}
              placeholder="Example: http://127.0.0.1:11434"
              onChange={(event) => { setUrl(event.target.value); setState(undefined); }}
            />
          )}
        </Field>
        <div className="setup-test">
          <Button variant="secondary" type="button" disabled={busy} onClick={() => void test()}>
            {busy ? "Testing…" : "Test connection"}
          </Button>
        </div>
        {state?.reachable && state.models.length ? (
          <Field label="Model" hint="For a 16 GB Mac, choose a model below 8 GB. If you change models, test again before saving. Continuum caps local requests to an 8K context so the computer stays responsive.">
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={model}
                onChange={(event) => {
                  setModel(event.target.value);
                  setState((current) => current ? { ...current, testPassed: current.testedModel === event.target.value } : current);
                }}
              >
                {state.models.map((entry) => (
                  <option key={entry.name} value={entry.name}>
                    {entry.name} · {entry.size ? `${(entry.size / 1024 ** 3).toFixed(1)} GB` : "size unknown"}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <div aria-live="polite">
          {state ? (
            <Banner tone={state.testPassed ? "success" : "danger"} title={state.testPassed ? "Local AI is ready" : "Setup is incomplete"}>
              {state.message ?? "Test the local API before saving."}
              {state.testPassed && state.latencyMs
                ? ` First text: ${((state.firstTokenMs ?? state.latencyMs) / 1_000).toFixed(1)}s · complete: ${(state.latencyMs / 1_000).toFixed(1)}s.`
                : ""}
            </Banner>
          ) : null}
        </div>
        {oversized ? (
          <Banner tone="warning" title="This model is too large for reliable local help">
            Choose a model under 8 GB. Larger weights can force macOS to swap memory and make the whole computer appear frozen.
          </Banner>
        ) : null}
        <p className="setup-privacy">
          The address and selected model are stored only in this browser. Code still runs in Continuum’s isolated browser runtime; local AI is called only when you explicitly ask for AI help.
        </p>
      </div>
    </Modal>
  );
}

/** The Connections card. Group 4 is collapsed, so this is deliberately short. */
export function OllamaCard({ ollama, onOpen }: { ollama: OllamaController; onOpen: () => void }) {
  return (
    <ConnectionCard
      icon={<Laptop size={19} />}
      title="Ollama"
      outcome="Run embeddings on your own computer, so your material is indexed locally."
      status={ollama.status}
      detail={ollama.state?.testPassed
        ? `Verified with ${ollama.state.testedModel}. The address and model stay in this browser.`
        : "Nothing leaves your computer. Set the same address as OLLAMA_BASE_URL on the server to index your sources locally."}
    >
      <div className="connection-actions">
        <Button variant="primary" onClick={onOpen}><Laptop size={15} aria-hidden="true" />{ollama.state?.testPassed ? "Change local AI" : "Set up local AI"}</Button>
        <a className="button button-secondary" href={OLLAMA_LINKS.download} target="_blank" rel="noreferrer">
          Download Ollama<ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
      {ollama.state?.models.length ? (
        <p className="connection-note"><strong>Installed:</strong> {ollama.state.models.slice(0, 6).map((entry) => entry.name).join(" · ")}</p>
      ) : null}
    </ConnectionCard>
  );
}
