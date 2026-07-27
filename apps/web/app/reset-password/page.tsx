"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Route } from "next";
import { PASSWORD_HELP, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [state, setState] = useState<"checking" | "valid" | "invalid" | "done">("checking");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") ?? "";
    window.history.replaceState({}, "", "/reset-password");
    setToken(value);
    if (!value) { setState("invalid"); return; }
    void fetch("/api/auth/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "inspect", token: value }) })
      .then((response) => setState(response.ok ? "valid" : "invalid"))
      .catch(() => setState("invalid"));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reset", token, password: form.get("password"), passwordConfirmation: form.get("passwordConfirmation") }) });
    const body = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) { setError(body.error ?? "Password reset failed"); return; }
    setState("done");
  }
  return <main className="login-shell"><section className="login-card auth-card"><div className="brand-mark">C</div><p className="eyebrow">SECURE RECOVERY</p>
    <h1>{state === "done" ? "Password updated." : state === "invalid" ? "This link cannot be used." : "Choose a new password."}</h1>
    {state === "checking" ? <p>Checking this single-use recovery link…</p> : null}
    {state === "invalid" ? <><p>The link is invalid, expired, or already used.</p><Link className="button button-primary" href={"/forgot-password" as Route}>Request another link</Link></> : null}
    {state === "valid" ? <form className="auth-form" onSubmit={submit}><label>New password<input name="password" type="password" minLength={PASSWORD_MIN_LENGTH} required autoComplete="new-password" /><small>{PASSWORD_HELP}</small></label><label>Confirm password<input name="passwordConfirmation" type="password" minLength={PASSWORD_MIN_LENGTH} required autoComplete="new-password" /></label>{error ? <p className="auth-error" role="alert">{error}</p> : null}<button className="button button-primary button-large" disabled={busy}>{busy ? "Updating…" : "Update password and revoke sessions"}</button></form> : null}
    {state === "done" ? <><p>Your old password and previous sessions no longer work.</p><Link className="button button-primary" href="/login">Sign in</Link></> : null}
  </section></main>;
}
