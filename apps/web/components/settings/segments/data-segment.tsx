"use client";

import { Download, ShieldAlert, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Banner, Button, Field, Input, LoadingButton, Modal, Radio } from "@/components/ui";

import { SettingsSection } from "../section";

export function DataSegment() {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReady, setDeleteReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password: form.get("password"),
        confirmation: form.get("confirmation"),
        preserveObsidianNotes: form.get("obsidian") === "preserve",
      }),
    });
    const body = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) { setError(body.error ?? "Account deletion failed"); return; }
    window.location.assign("/login?deleted=1");
  }

  return (
    <>
      <SettingsSection
        title="Download everything"
        description="A structured ZIP of your workspace, learning, research, assistant history, Zotero index, and sync records. Secrets are excluded."
        action={<a className="button button-primary" href="/api/account/export"><Download size={15} aria-hidden="true" />Download export</a>}
      >
        <p className="settings-note">Do this before deleting anything. The export is generated on request and is not stored.</p>
      </SettingsSection>

      <SettingsSection
        tone="danger"
        title="Delete account"
        description="Permanent. Download an export first — this cannot be undone."
        action={<Button variant="danger" onClick={() => { setDeleteReady(false); setError(""); setDeleteOpen(true); }}><Trash2 size={15} aria-hidden="true" />Delete account</Button>}
      >
        <ul className="settings-consequences">
          <li>Every session and connection credential is revoked and removed.</li>
          <li>Uploads, imported Zotero records, context, learning history, projects, and queued work are deleted.</li>
          <li>Obsidian notes in your own vault are preserved unless you explicitly choose otherwise.</li>
        </ul>
      </SettingsSection>

      <Modal
        open={deleteOpen}
        onOpenChange={(open) => { setDeleteOpen(open); if (!open) { setDeleteReady(false); setError(""); } }}
        title="Permanently delete your Continuum account"
        description="This cannot be undone. Your account stops authenticating as soon as deletion completes."
        footer={deleteReady
          ? <>
            <Button variant="secondary" onClick={() => setDeleteReady(false)}>Back</Button>
            <LoadingButton variant="danger" form="delete-account-form" type="submit" loading={busy} loadingLabel="Deleting account…"><Trash2 size={14} aria-hidden="true" />Delete permanently</LoadingButton>
          </>
          : <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => setDeleteReady(true)}>I understand — continue</Button>
          </>}
      >
        {deleteReady ? (
          <form id="delete-account-form" className="settings-form" onSubmit={deleteAccount}>
            <Field label="Password">
              {({ id }) => <Input id={id} name="password" type="password" required autoComplete="current-password" />}
            </Field>
            <Field label="Type DELETE to confirm">
              {({ id }) => <Input id={id} name="confirmation" required pattern="DELETE" autoComplete="off" placeholder="DELETE" />}
            </Field>
            <fieldset className="settings-fieldset">
              <legend>Notes in your local Obsidian vault</legend>
              <Radio name="obsidian" value="preserve" defaultChecked label="Keep them — they are yours" />
              <Radio name="obsidian" value="delete" label="Delete the synced notes too (the bridge must be online)" />
            </fieldset>
            {error ? <Banner tone="danger" title="Account not deleted">{error}</Banner> : null}
          </form>
        ) : (
          <div className="settings-impact">
            <ShieldAlert size={26} aria-hidden="true" />
            <div>
              <h3>Review what happens</h3>
              <ul>
                <li>All Continuum sessions and connection credentials are revoked and removed.</li>
                <li>Private uploads, imported Zotero files, context, learning records, projects, and queues are deleted.</li>
                <li>Obsidian notes are preserved unless you explicitly select local deletion while the bridge is online.</li>
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
