"use client";

import { Laptop, LogOut } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Banner, Button, Field, Input, LoadingButton, Modal, StatusChip } from "@/components/ui";

import { SettingsSection } from "../section";

type Toast = (message: string | null) => void;
type Session = { id: string; current: boolean; device: string; createdAt: string; lastActivityAt: string; expiresAt: string; status: string };

export function SecuritySegment({ showToast }: { showToast: Toast }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [busy, setBusy] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [error, setError] = useState("");

  const refreshSessions = useCallback(async () => {
    const response = await fetch("/api/auth/sessions", { cache: "no-store" });
    const body = await response.json() as { sessions?: Session[] };
    if (response.ok) setSessions(body.sessions ?? []);
  }, []);
  useEffect(() => { void refreshSessions(); }, [refreshSessions]);

  async function sessionAction(action: "revoke" | "revoke_others" | "revoke_all", sessionId?: string) {
    setBusy(`${action}:${sessionId ?? ""}`);
    const response = await fetch("/api/auth/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...(sessionId ? { sessionId } : {}) }),
    });
    setBusy("");
    if (!response.ok) { showToast("The session could not be revoked."); return; }
    if (action === "revoke_all" || sessions.find((session) => session.id === sessionId)?.current) { window.location.assign("/login"); return; }
    await refreshSessions();
    showToast("Session access revoked.");
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("password"); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "change",
        currentPassword: form.get("currentPassword"),
        password: form.get("password"),
        passwordConfirmation: form.get("passwordConfirmation"),
      }),
    });
    const body = await response.json() as { error?: string };
    setBusy("");
    if (!response.ok) { setError(body.error ?? "Password change failed"); return; }
    setPasswordOpen(false); await refreshSessions(); showToast("Password changed. Other sessions were revoked.");
  }

  // The demo account produced fifty rows, each with its own Sign out button. The
  // current session is pinned, the five most recent follow, the rest collapse.
  const ordered = [...sessions].sort((left, right) => {
    if (left.current !== right.current) return left.current ? -1 : 1;
    return Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt);
  });
  const recent = ordered.slice(0, 5);
  const older = ordered.slice(5);

  const sessionRow = (session: Session) => (
    <li key={session.id} className={session.current ? "session-row session-row-current" : "session-row"}>
      <Laptop size={17} aria-hidden="true" />
      <div>
        <strong>{session.device}{session.current ? " · This session" : ""}</strong>
        <small>Started {new Date(session.createdAt).toLocaleString()} · Last active {new Date(session.lastActivityAt).toLocaleString()}</small>
      </div>
      <StatusChip tone={session.status === "active" ? "success" : "neutral"} label={session.status === "active" ? "Active" : session.status} />
      {session.status === "active" && !session.current
        ? <Button variant="secondary" size="sm" disabled={Boolean(busy)} onClick={() => void sessionAction("revoke", session.id)}>Sign out</Button>
        : null}
    </li>
  );

  return (
    <>
      <SettingsSection
        title="Password"
        description="Changing it signs out every other session immediately."
        action={<Button variant="secondary" onClick={() => setPasswordOpen(true)}>Change password</Button>}
      >
        <p className="settings-note">Forgotten it? Sign out and use the recovery link on the sign-in page.</p>
      </SettingsSection>

      <SettingsSection
        title="Where you are signed in"
        description="Device names are approximate, and a raw session identifier is never shown."
        action={
          <>
            <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void sessionAction("revoke_others")}>Sign out others</Button>
            <Button variant="danger" disabled={Boolean(busy)} onClick={() => void sessionAction("revoke_all")}><LogOut size={14} aria-hidden="true" />Sign out all</Button>
          </>
        }
      >
        <ul className="session-list">{recent.map(sessionRow)}</ul>
        {older.length ? (
          <details className="settings-disclosure">
            <summary>{older.length} older session{older.length === 1 ? "" : "s"}</summary>
            <ul className="session-list">{older.map(sessionRow)}</ul>
          </details>
        ) : null}
      </SettingsSection>

      <Modal
        open={passwordOpen}
        onOpenChange={(open) => { setPasswordOpen(open); if (!open) setError(""); }}
        title="Change password"
        description="Confirm the current password, then choose one you have not used recently."
        footer={<>
          <Button variant="secondary" onClick={() => setPasswordOpen(false)}>Cancel</Button>
          <LoadingButton variant="primary" form="change-password-form" type="submit" loading={busy === "password"} loadingLabel="Changing…">Change password</LoadingButton>
        </>}
      >
        <form id="change-password-form" className="settings-form" onSubmit={changePassword}>
          <Field label="Current password">
            {({ id }) => <Input id={id} name="currentPassword" type="password" required autoComplete="current-password" />}
          </Field>
          <Field label="New password">
            {({ id }) => <Input id={id} name="password" type="password" required minLength={6} autoComplete="new-password" />}
          </Field>
          <Field label="Confirm new password">
            {({ id }) => <Input id={id} name="passwordConfirmation" type="password" required minLength={6} autoComplete="new-password" />}
          </Field>
          {error ? <Banner tone="danger" title="Password not changed">{error}</Banner> : null}
        </form>
      </Modal>
    </>
  );
}
