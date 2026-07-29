"use client";

import type { AuthUser } from "@continuum/db";
import { Compass, Download, KeyRound, Laptop, LogOut, ShieldAlert, UserRound, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, Card, LoadingButton, Modal } from "@/components/ui";
import { PageHeader } from "./page-header";

type Toast = (message: string | null) => void;
type Session = { id: string; current: boolean; device: string; createdAt: string; lastActivityAt: string; expiresAt: string; status: string };

export function AccountScreen({ user, showToast }: { user: AuthUser; showToast: Toast }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [busy, setBusy] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReady, setDeleteReady] = useState(false);
  const [error, setError] = useState("");

  const refreshSessions = useCallback(async () => {
    const response = await fetch("/api/auth/sessions", { cache: "no-store" });
    const body = await response.json() as { sessions?: Session[] };
    if (response.ok) setSessions(body.sessions ?? []);
  }, []);
  useEffect(() => { void refreshSessions(); }, [refreshSessions]);

  async function sessionAction(action: "revoke" | "revoke_others" | "revoke_all", sessionId?: string) {
    setBusy(`${action}:${sessionId ?? ""}`);
    const response = await fetch("/api/auth/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...(sessionId ? { sessionId } : {}) }) });
    setBusy("");
    if (!response.ok) { showToast("The session could not be revoked."); return; }
    if (action === "revoke_all" || sessions.find((session) => session.id === sessionId)?.current) { window.location.assign("/login"); return; }
    await refreshSessions();
    showToast("Session access revoked.");
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("password"); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "change", currentPassword: form.get("currentPassword"), password: form.get("password"), passwordConfirmation: form.get("passwordConfirmation") }) });
    const body = await response.json() as { error?: string };
    setBusy("");
    if (!response.ok) { setError(body.error ?? "Password change failed"); return; }
    setPasswordOpen(false); await refreshSessions(); showToast("Password changed. Other sessions were revoked.");
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("delete"); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/account/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: form.get("password"), confirmation: form.get("confirmation"), preserveObsidianNotes: form.get("obsidian") === "preserve" }) });
    const body = await response.json() as { error?: string };
    setBusy("");
    if (!response.ok) { setError(body.error ?? "Account deletion failed"); return; }
    window.location.assign("/login?deleted=1");
  }

  const orderedSessions = [...sessions].sort((left, right) => {
    if (left.current !== right.current) return left.current ? -1 : 1;
    return Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt);
  });
  const recentSessions = orderedSessions.slice(0, 5);
  const olderSessions = orderedSessions.slice(5);
  const sessionRow = (session: Session) => (
    <article key={session.id} className={session.current ? "session-current" : undefined}>
      <span><Laptop size={17} aria-hidden="true" /></span>
      <div><strong>{session.device}{session.current ? " · This session" : ""}</strong><small>Created {new Date(session.createdAt).toLocaleString()} · Active {new Date(session.lastActivityAt).toLocaleString()}</small></div>
      <em>{session.status}</em>
      {session.status === "active" && !session.current ? <button disabled={Boolean(busy)} onClick={() => void sessionAction("revoke", session.id)}>Sign out</button> : null}
    </article>
  );

  return <div className="screen account-screen">
    <PageHeader title="Account & Security" description="Your account, sessions, and exit are under your control. Continuum uses a native username-and-password account; sessions are revocable and exports exclude secrets." />
    <div className="account-grid">
      <Card className="account-card"><div className="account-card-heading"><UserRound size={20} /><div><h2>Username</h2><p>{user.username}</p></div></div><div className="account-status verified">Active account</div><small className="field-hint">Email verification and self-service password recovery are not available yet. Keep your password somewhere safe.</small></Card>
      <Card className="account-card"><div className="account-card-heading"><KeyRound size={20} /><div><h2>Password</h2><p>Changing it revokes every other active session.</p></div></div><Button className="button-secondary" onClick={() => setPasswordOpen(true)}>Change password</Button></Card>
      <Card className="account-card"><div className="account-card-heading"><Compass size={20} aria-hidden="true" /><div><h2>Getting started tour</h2><p>The three-step introduction to Today, Plan, and ⌘K.</p></div></div><Button className="button-secondary" onClick={() => { window.localStorage.removeItem("continuum.tour.completed.v1"); showToast("The tour will start again on your next screen."); }}>Restart tour</Button></Card>
      <Card className="account-card account-export"><div className="account-card-heading"><Download size={20} /><div><h2>Download your data</h2><p>A structured ZIP of your workspace, learning, research, Assistant, Zotero, and sync records. Secrets are excluded.</p></div></div><a className="button button-primary" href="/api/account/export"><Download size={14} />Download export</a></Card>
    </div>
    {/* The demo account rendered fifty session rows, each with its own Sign out
        button. The current session is pinned first, the five most recent follow,
        and everything older collapses. The bulk action stays prominent. */}
    <Card className="sessions-card">
      <header>
        <div><Laptop size={20} aria-hidden="true" /><div><h2>Active sessions</h2><p>Device names are approximate and raw session IDs are never displayed.</p></div></div>
        <div><Button className="button-secondary" disabled={Boolean(busy)} onClick={() => void sessionAction("revoke_others")}>Sign out other sessions</Button><Button className="button-quiet danger" disabled={Boolean(busy)} onClick={() => void sessionAction("revoke_all")}><LogOut size={14} aria-hidden="true" />Sign out all</Button></div>
      </header>
      <div className="session-list">{recentSessions.map(sessionRow)}</div>
      {olderSessions.length ? <details className="session-older">
        <summary>{olderSessions.length} older session{olderSessions.length === 1 ? "" : "s"}</summary>
        <div className="session-list">{olderSessions.map(sessionRow)}</div>
      </details> : null}
    </Card>
    <Card className="danger-zone"><div><ShieldAlert size={22} /><div><h2>Delete account</h2><p>Download an export first. Deletion removes private server data, credentials, sessions, uploads, queues, and caches. You explicitly choose what happens to local Obsidian notes.</p></div></div><Button className="button-quiet danger" onClick={() => { setDeleteReady(false); setDeleteOpen(true); }}><Trash2 size={15} />Delete account</Button></Card>

    <Modal open={passwordOpen} onOpenChange={setPasswordOpen} title="Change password" description="Confirm the current password, then choose one you have not used recently.">
      <form className="workspace-form" onSubmit={changePassword}><label>Current password<input name="currentPassword" type="password" required autoComplete="current-password" /></label><label>New password<input name="password" type="password" required minLength={6} autoComplete="new-password" /></label><label>Confirm new password<input name="passwordConfirmation" type="password" required minLength={6} autoComplete="new-password" /></label>{error ? <p className="auth-error">{error}</p> : null}<LoadingButton className="button-primary" loading={busy === "password"} loadingLabel="Changing…">Change password</LoadingButton></form>
    </Modal>
    <Modal open={deleteOpen} onOpenChange={setDeleteOpen} title="Permanently delete Continuum account" description="This cannot be undone. Your native account will stop authenticating as soon as deletion completes.">
      {!deleteReady ? <div className="deletion-impact"><ShieldAlert size={30} /><h3>Review the impact</h3><ul><li>All Continuum sessions and integration credentials are revoked and removed.</li><li>Private uploads, imported Zotero files, memories, learning records, projects, and queues are deleted.</li><li>Obsidian notes are preserved unless you explicitly select local deletion while the bridge is online.</li></ul><Button className="button-quiet danger" onClick={() => setDeleteReady(true)}>I understand—continue</Button></div> : <form className="workspace-form" onSubmit={deleteAccount}><label>Password<input name="password" type="password" required autoComplete="current-password" /></label><label>Type DELETE<input name="confirmation" required pattern="DELETE" autoComplete="off" /></label><fieldset><legend>Local Obsidian notes</legend><label><input type="radio" name="obsidian" value="preserve" defaultChecked />Preserve notes in my vault</label><label><input type="radio" name="obsidian" value="delete" />Delete synchronized notes (bridge must be online)</label></fieldset>{error ? <p className="auth-error">{error}</p> : null}<LoadingButton className="button-quiet danger" loading={busy === "delete"} loadingLabel="Deleting account…"><Trash2 size={14} />Delete permanently</LoadingButton></form>}
    </Modal>
  </div>;
}
