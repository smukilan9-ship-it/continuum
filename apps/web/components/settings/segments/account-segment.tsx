"use client";

import type { AuthUser } from "@continuum/db";
import { MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Banner, Button, Field, Input, LoadingButton, StatusChip } from "@/components/ui";

import { SettingsFact, SettingsSection } from "../section";
import type { SettingsProfile } from "../use-settings-profile";

type Toast = (message: string | null) => void;

export function AccountSegment({
  user,
  profile,
  saving,
  onSave,
  showToast,
}: {
  user: AuthUser;
  profile: SettingsProfile | undefined;
  saving: boolean;
  onSave: (patch: { displayName?: string; educationLevel?: string }) => Promise<boolean>;
  showToast: Toast;
}) {
  const [displayName, setDisplayName] = useState<string>();
  const [educationLevel, setEducationLevel] = useState<string>();
  const [sending, setSending] = useState(false);

  const currentName = displayName ?? profile?.account.displayName ?? user.displayName;
  const currentLevel = educationLevel ?? profile?.account.educationLevel ?? user.educationLevel ?? "";
  const dirty = currentName !== (profile?.account.displayName ?? user.displayName)
    || currentLevel !== (profile?.account.educationLevel ?? user.educationLevel ?? "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onSave({ displayName: currentName.trim(), educationLevel: currentLevel.trim() });
    if (saved) { setDisplayName(undefined); setEducationLevel(undefined); }
  }

  async function resendVerification() {
    setSending(true);
    try {
      const response = await fetch("/api/auth/verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      });
      const payload = await response.json() as { error?: string };
      showToast(response.ok ? "A verification link is on its way to the address on this account." : payload.error ?? "The link could not be sent right now.");
    } catch {
      showToast("The link could not be sent right now.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <SettingsSection title="Who you are" description="The name Continuum uses when it talks to you, and the level it pitches explanations at.">
        <form className="settings-form" onSubmit={submit}>
          <Field label="Display name">
            {({ id }) => <Input id={id} value={currentName} maxLength={80} required onChange={(event) => setDisplayName(event.target.value)} />}
          </Field>
          <Field label="Education level" hint="Optional. It changes how much a lesson assumes, not what you can reach.">
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} value={currentLevel} maxLength={80} placeholder="For example: final-year undergraduate" onChange={(event) => setEducationLevel(event.target.value)} />
            )}
          </Field>
          <div className="settings-form-actions">
            <LoadingButton variant="primary" type="submit" loading={saving} loadingLabel="Saving…" disabled={!dirty}>Save changes</LoadingButton>
          </div>
        </form>
        <dl className="settings-facts">
          <SettingsFact label="Username" value={<span className="mono">{user.username}</span>} hint="Used to sign in. It cannot be changed here." />
          <SettingsFact label="Time zone" value={user.timezone} hint="Taken from your plan. Change it when you rebuild your week." />
        </dl>
      </SettingsSection>

      <SettingsSection
        title="Email"
        description="Used only for password recovery and account notices. Continuum never emails your work."
        action={profile ? <StatusChip tone={profile.account.emailVerified ? "success" : "warning"} label={profile.account.emailVerified ? "Verified" : "Not verified"} /> : undefined}
      >
        <dl className="settings-facts">
          <SettingsFact
            label="Address on file"
            value={!profile ? "Loading…" : profile.account.email ? <span className="mono">{profile.account.email}</span> : "None recorded"}
          />
        </dl>
        {profile && !profile.account.emailVerified ? (
          <Banner tone="info" title="Verify this address">
            Verifying it is what makes password recovery possible. Until then, a lost password cannot be reset.
          </Banner>
        ) : null}
        <div className="settings-form-actions">
          <Button variant="secondary" disabled={sending} onClick={() => void resendVerification()}>
            <MailCheck size={15} aria-hidden="true" />{sending ? "Sending…" : "Send a verification link"}
          </Button>
        </div>
      </SettingsSection>


    </>
  );
}
