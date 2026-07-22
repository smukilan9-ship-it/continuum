"use client";

import { ArrowRight, Eye, EyeOff, PlayCircle, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { PASSWORD_HELP, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

type Mode = "login" | "register";

export function LoginForm({ returnTo, demoMode, registrationEnabled, googleSignInEnabled, demoAvailable, authError }: { returnTo?: string; demoMode: boolean; registrationEnabled: boolean; googleSignInEnabled: boolean; demoAvailable: boolean; authError?: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(authError ?? null);
  const [busy, setBusy] = useState<null | "form" | "demo">(null);
  const [showPassword, setShowPassword] = useState(false);
  const destination = returnTo?.startsWith("/") ? returnTo : "/";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("form");
    setError(null);
    const form = new FormData(event.currentTarget);
    const body = mode === "login"
      ? { email: form.get("email"), password: form.get("password") }
      : { email: form.get("email"), password: form.get("password"), displayName: form.get("displayName"), educationLevel: form.get("educationLevel"), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Authentication failed");
      window.location.assign(destination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authentication failed");
      setBusy(null);
    }
  };

  const tryDemo = async () => {
    setBusy("demo");
    setError(null);
    try {
      const response = await fetch("/api/auth/demo", { method: "POST", headers: { "content-type": "application/json" } });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Demo sign-in is unavailable");
      window.location.assign(destination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Demo sign-in is unavailable");
      setBusy(null);
    }
  };

  if (demoMode) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-mark">C</div>
          <p className="eyebrow">CONTINUUM · LOCAL MODE</p>
          <h1>Pick up your academic work with the context intact.</h1>
          <p>This local development workspace uses an in-memory account. Production requires persistent accounts and never enables this bypass.</p>
          <Link className="button button-primary button-large" href="/">Open local workspace <ArrowRight size={17} /></Link>
          <span className="privacy-note">Local process only · no production authentication bypass</span>
        </section>
      </main>
    );
  }

  return (
    <main className="login-shell">
      <section className="login-card auth-card">
        <div className="brand-mark">C</div>
        <p className="eyebrow">CONTINUUM</p>
        <h1>{mode === "login" ? "Continue with your context intact." : "Create one private academic workspace."}</h1>
        <p className="auth-lead">{mode === "login" ? "Sign in to your private academic state and connected assistants." : "Your password is slow-hashed; sessions are revocable and stored as one-way token hashes."}</p>

        {demoAvailable ? (
          <button type="button" className="demo-cta" onClick={() => void tryDemo()} disabled={busy !== null}>
            <PlayCircle size={18} />
            <span><strong>{busy === "demo" ? "Opening the demo…" : "Try the demo"}</strong><small>Explore a fully populated student workspace — no signup</small></span>
            <ArrowRight size={16} />
          </button>
        ) : null}

        {googleSignInEnabled ? (
          <>
            <a className="google-signin" href={`/api/auth/google/start?returnTo=${encodeURIComponent(destination)}`} onClick={(event) => { event.preventDefault(); const target = new URL(event.currentTarget.href); target.searchParams.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone); window.location.assign(target); }}><span aria-hidden="true">G</span>Continue with Google</a>
          </>
        ) : null}

        {(demoAvailable || googleSignInEnabled) ? <div className="auth-divider"><span>or use {mode === "login" ? "email" : "email & password"}</span></div> : null}

        {registrationEnabled ? (
          <div className="auth-tabs" role="tablist">
            <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(null); }}>Sign in</button>
            <button role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(null); }}>Create account</button>
          </div>
        ) : <p className="registration-closed">New account registration is currently closed.</p>}

        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && (
            <>
              <label>Name<input name="displayName" minLength={2} maxLength={80} required autoComplete="name" placeholder="Your name" /></label>
              <label>Education level<input name="educationLevel" maxLength={120} placeholder="e.g. CBSE Class 12" /></label>
            </>
          )}
          <label>{mode === "login" ? "Email or username" : "Email"}<input name="email" type={mode === "login" ? "text" : "email"} required autoComplete={mode === "login" ? "username" : "email"} placeholder={mode === "login" ? "you@example.com or demo" : "you@example.com"} /></label>
          <label>Password
            <span className="password-field">
              <input name="password" type={showPassword ? "text" : "password"} minLength={mode === "register" ? PASSWORD_MIN_LENGTH : 1} required autoComplete={mode === "register" ? "new-password" : "current-password"} />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </span>
            {mode === "register" ? <small className="field-hint">{PASSWORD_HELP}</small> : null}
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button button-primary button-large" disabled={busy !== null}>{busy === "form" ? "Please wait…" : mode === "login" ? "Sign in" : "Create private workspace"}<ArrowRight size={17} /></button>
        </form>

        <span className="privacy-note"><ShieldCheck size={13} /> HttpOnly session · same-origin writes · rate limited</span>
      </section>
    </main>
  );
}
