"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import Link from "next/link";

export function LoginForm({ returnTo, demoMode, registrationEnabled, googleSignInEnabled, authError }: { returnTo?: string; demoMode: boolean; registrationEnabled: boolean; googleSignInEnabled: boolean; authError?: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(authError ?? null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const body = mode === "login"
      ? { email: form.get("email"), password: form.get("password") }
      : { email: form.get("email"), password: form.get("password"), displayName: form.get("displayName"), educationLevel: form.get("educationLevel"), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Authentication failed");
      window.location.assign(returnTo?.startsWith("/") ? returnTo : "/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authentication failed");
      setBusy(false);
    }
  };

  if (demoMode) {
    return <main className="login-shell"><section className="login-card"><div className="brand-mark">C</div><p className="eyebrow">CONTINUUM · LOCAL MODE</p><h1>Pick up your academic work with the context intact.</h1><p>This local development workspace uses an in-memory account. Production requires persistent accounts and never enables this bypass.</p><Link className="button button-primary button-large" href="/">Open local workspace <ArrowRight size={17} /></Link><span className="privacy-note">Local process only · no production authentication bypass</span></section></main>;
  }

  return (
    <main className="login-shell">
      <section className="login-card auth-card">
        <div className="brand-mark">C</div>
        <p className="eyebrow">CONTINUUM</p>
        <h1>{mode === "login" ? "Continue with your context intact." : "Create one private academic workspace."}</h1>
        <p>{mode === "login" ? "Sign in to your private academic state and connected assistants." : "Your password is slow-hashed; sessions are revocable and stored as one-way token hashes."}</p>
        {googleSignInEnabled ? <><a className="google-signin" href={`/api/auth/google/start?returnTo=${encodeURIComponent(returnTo?.startsWith("/") ? returnTo : "/")}`} onClick={(event) => { event.preventDefault(); const target = new URL(event.currentTarget.href); target.searchParams.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone); window.location.assign(target); }}><span aria-hidden="true">G</span>Continue with Google</a><div className="auth-divider"><span>or use email</span></div></> : null}
        {registrationEnabled ? <div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Sign in</button><button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Create account</button></div> : <p className="registration-closed">New account registration is currently closed.</p>}
        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && <><label>Name<input name="displayName" minLength={2} maxLength={80} required autoComplete="name" /></label><label>Education level<input name="educationLevel" maxLength={120} placeholder="e.g. CBSE Class 12" /></label></>}
          <label>Email<input name="email" type="email" required autoComplete="email" /></label>
          <label>Password<input name="password" type="password" minLength={mode === "register" ? 12 : 1} required autoComplete={mode === "register" ? "new-password" : "current-password"} /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button button-primary button-large" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create private workspace"}<ArrowRight size={17} /></button>
        </form>
        <span className="privacy-note"><ShieldCheck size={13} /> HttpOnly session · same-origin writes · rate limited</span>
      </section>
    </main>
  );
}
