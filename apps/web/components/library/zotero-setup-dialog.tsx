"use client";

import { CheckCircle2, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Banner, Button, Field, Input, LoadingButton, Modal, StatusChip } from "@/components/ui";
import { classifyZoteroFailure } from "./scholarly-errors";

type Tested = { username: string; groupsAvailable: boolean; filesAvailable: boolean };

/**
 * Zotero setup, entirely inside one dialog (§13.3, AC-Z1).
 *
 * Three steps, in the order a person actually performs them: what Continuum
 * will do, where to make the key with the exact boxes to tick, and the key
 * itself — with **Test connection** answering "whose library is this?" before
 * anything is stored. Connecting an account without being told which account
 * was connected is how the wrong key gets saved and stays saved.
 */
export function ZoteroSetupDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: (username: string) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [tested, setTested] = useState<Tested>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<{ title: string; body: string }>();

  function close() {
    setApiKey("");
    setTested(undefined);
    setError(undefined);
    setBusy("");
    onOpenChange(false);
  }

  async function post(action: "validate" | "connect") {
    setBusy(action);
    setError(undefined);
    try {
      const response = await fetch("/api/connections/zotero", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, apiKey: apiKey.trim() }),
      });
      const payload = await response.json() as { username?: string; groupsAvailable?: boolean; filesAvailable?: boolean; error?: string };
      if (!response.ok) {
        const failure = classifyZoteroFailure(response.status, payload.error);
        setError({ title: failure.title, body: failure.body });
        return;
      }
      if (action === "validate") {
        setTested({
          username: payload.username ?? "your Zotero account",
          groupsAvailable: Boolean(payload.groupsAvailable),
          filesAvailable: Boolean(payload.filesAvailable),
        });
        return;
      }
      onConnected(payload.username ?? "your Zotero account");
      close();
    } catch {
      setError({ title: "Zotero could not be reached", body: "The connection attempt did not complete. Nothing has been saved — try again." });
    } finally { setBusy(""); }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => { if (!next) close(); else onOpenChange(true); }}
      title="Connect Zotero"
      description="Three steps. Nothing is saved until you connect."
      size="md"
      dirty={Boolean(apiKey)}
      dirtyMessage="Discard this Zotero key?"
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <LoadingButton
            variant="primary"
            loading={busy === "connect"}
            disabled={!tested || apiKey.trim().length < 16}
            onClick={() => void post("connect")}
          >
            Connect
          </LoadingButton>
        </>
      }
    >
      <ol className="zotero-setup">
        <li>
          <h3>What Continuum does</h3>
          <p>Continuum reads your library so you can cite and search it — it never writes to Zotero unless you ask.</p>
        </li>
        <li>
          <h3>Create a read-only key</h3>
          <p>On the Zotero key page, tick <strong>Allow library access</strong>, and <strong>Read Only</strong> for group libraries if you use them. Leave every write permission unticked.</p>
          <a className="button button-secondary button-sm" href="https://www.zotero.org/settings/keys/new" target="_blank" rel="noreferrer">
            Open zotero.org/settings/keys/new<ExternalLink size={13} aria-hidden="true" />
          </a>
        </li>
        <li>
          <h3>Paste and test it</h3>
          <Field label="Zotero API key" hint="Tested against Zotero before it is stored. Continuum keeps it in the encrypted credential vault.">
            {({ id }) => (
              <Input
                id={id}
                value={apiKey}
                onChange={(event) => { setApiKey(event.target.value); setTested(undefined); setError(undefined); }}
                autoComplete="off"
                spellCheck={false}
                placeholder="P9NiFoyLeZu2bZNvvuQPDWsd"
              />
            )}
          </Field>
          <LoadingButton
            variant="secondary"
            size="sm"
            loading={busy === "validate"}
            disabled={apiKey.trim().length < 16}
            onClick={() => void post("validate")}
          >
            Test connection
          </LoadingButton>

          {tested ? (
            <div className="zotero-tested" role="status">
              <CheckCircle2 size={16} aria-hidden="true" />
              <div>
                <strong>Connected to {tested.username}</strong>
                <span className="zotero-tested-chips">
                  <StatusChip tone="success" label="Library readable" />
                  <StatusChip tone={tested.groupsAvailable ? "success" : "neutral"} label={tested.groupsAvailable ? "Group libraries readable" : "No group access"} />
                  <StatusChip tone={tested.filesAvailable ? "success" : "neutral"} label={tested.filesAvailable ? "Attachments readable" : "No attachment access"} />
                </span>
                <small>Nothing has been saved yet. Choose Connect to store this key.</small>
              </div>
            </div>
          ) : null}

          {error ? <Banner tone="danger" title={error.title}>{error.body}</Banner> : null}
        </li>
      </ol>
    </Modal>
  );
}
