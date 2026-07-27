"use client";

import type { AuthUser } from "@continuum/db";
import { Download, KeyRound, Laptop, LogOut, ShieldAlert, UserRound, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, Card, LoadingButton, Modal } from "@/components/ui";
import { PageIntro } from "./page-intro";

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

  return <div className="screen account-screen">
    <PageIntro eyebrow="ACCOUNT & SECURITY" title="Your account, sessions, and exit are under your control." description="Continuum uses a native username-and-password account for the hackathon. Sessions are revocable and exports exclude secrets." />
    <div className="account-grid">
      <Card className="account-card"><div className="account-card-heading"><UserRound size={20} /><div><h2>Username</h2><p>{user.username}</p></div></div><div className="account-status verified">Active account</div><small className="field-hint">Email verification and self-service recovery are planned after the hackathon.</small></Card>
      <Card className="account-card"><div className="account-card-heading"><KeyRound size={20} /><div><h2>Password</h2><p>Changing it revokes every other active session.</p></div></div><Button className="button-secondary" onClick={() => setPasswordOpen(true)}>Change password</Button></Card>
      <Card className="account-card account-export"><div className="account-card-heading"><Download size={20} /><div><h2>Download your data</h2><p>A structured ZIP of your workspace, learning, research, Assistant, Zotero, and sync records. Secrets are excluded.</p></div></div><a className="button button-primary" href="/api/account/export"><Download size={14} />Download export</a></Card>
    </div>
    <Card className="sessions-card"><header><div><Laptop size={20} /><div><h2>Active sessions</h2><p>Device names are approximate and raw session IDs are never displayed.</p></div></div><div><Button className="button-secondary" disabled={Boolean(busy)} onClick={() => void sessionAction("revoke_others")}>Sign out other sessions</Button><Button className="button-quiet danger" disabled={Boolean(busy)} onClick={() => void sessionAction("revoke_all")}><LogOut size={14} />Sign out all</Button></div></header><div className="session-list">{sessions.map((session) => <article key={session.id}><span><Laptop size={17} /></span><div><strong>{session.device}{session.current ? " · This session" : ""}</strong><small>Created {new Date(session.createdAt).toLocaleString()} · Active {new Date(session.lastActivityAt).toLocaleString()}</small></div><em>{session.status}</em>{session.status === "active" ? <button disabled={Boolean(busy)} onClick={() => void sessionAction("revoke", session.id)}>Sign out</button> : null}</article>)}</div></Card>
    <Card className="danger-zone"><div><ShieldAlert size={22} /><div><h2>Delete account</h2><p>Download an export first. Deletion removes private server data, credentials, sessions, uploads, queues, and caches. You explicitly choose what happens to local Obsidian notes.</p></div></div><Button className="button-quiet danger" onClick={() => { setDeleteReady(false); setDeleteOpen(true); }}><Trash2 size={15} />Delete account</Button></Card>

    <Modal open={passwordOpen} onOpenChange={setPasswordOpen} title="Change password" description="Confirm the current password, then choose one you have not used recently.">
      <form className="workspace-form" onSubmit={changePassword}><label>Current password<input name="currentPassword" type="password" required autoComplete="current-password" /></label><label>New password<input name="password" type="password" required minLength={6} autoComplete="new-password" /></label><label>Confirm new password<input name="passwordConfirmation" type="password" required minLength={6} autoComplete="new-password" /></label>{error ? <p className="auth-error">{error}</p> : null}<LoadingButton className="button-primary" loading={busy === "password"} loadingLabel="Changing…">Change password</LoadingButton></form>
    </Modal>
    <Modal open={deleteOpen} onOpenChange={setDeleteOpen} title="Permanently delete Continuum account" description="This cannot be undone. Your native account will stop authenticating as soon as deletion completes.">
      {!deleteReady ? <div className="deletion-impact"><ShieldAlert size={30} /><h3>Review the impact</h3><ul><li>All Continuum sessions and integration credentials are revoked and removed.</li><li>Private uploads, imported Zotero files, memories, learning records, projects, and queues are deleted.</li><li>Obsidian notes are preserved unless you explicitly select local deletion while the bridge is online.</li></ul><Button className="button-quiet danger" onClick={() => setDeleteReady(true)}>I understand—continue</Button></div> : <form className="workspace-form" onSubmit={deleteAccount}><label>Password<input name="password" type="password" required autoComplete="current-password" /></label><label>Type DELETE<input name="confirmation" required pattern="DELETE" autoComplete="off" /></label><fieldset><legend>Local Obsidian notes</legend><label><input type="radio" name="obsidian" value="preserve" defaultChecked />Preserve notes in my vault</label><label><input type="radio" name="obsidian" value="delete" />Delete synchronized notes (bridge must be online)</label></fieldset>{error ? <p className="auth-error">{error}</p> : null}<LoadingButton className="button-quiet danger" loading={busy === "delete"} loadingLabel="Deleting account…"><Trash2 size={14} />Delete permanently</LoadingButton></form>}
    </Modal>
  </div>;
}
