"use client";

import { ArrowRight, Eye, EyeOff, PlayCircle, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { Route } from "next";
import { BrandMark } from "@/components/brand-mark";
import { PASSWORD_HELP, PASSWORD_MIN_LENGTH, USERNAME_HELP, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "@/lib/password-policy";

type Mode = "login" | "register";

export function LoginForm({ returnTo, demoMode, registrationEnabled, demoAvailable, authError, initialMode = "login" }: { returnTo?: string; demoMode: boolean; registrationEnabled: boolean; demoAvailable: boolean; authError?: string; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [error, setError] = useState<string | null>(authError ?? null);
  const [busy, setBusy] = useState<null | "form" | "demo">(null);
  const [showPassword, setShowPassword] = useState(false);
  const destination = returnTo?.startsWith("/") ? returnTo : "/today";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("form");
    setError(null);
    const form = new FormData(event.currentTarget);
    const body = mode === "login"
      ? { username: form.get("username"), password: form.get("password") }
      : {
          username: form.get("username"),
          password: form.get("password"),
          passwordConfirmation: form.get("passwordConfirmation"),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          termsAccepted: form.get("termsAccepted") === "on",
        };
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
          <BrandMark className="brand-mark" title="Continuum" />
          <p className="eyebrow">CONTINUUM · LOCAL MODE</p>
          <h1>Pick up your academic work with the context intact.</h1>
          <p>This local development workspace uses an in-memory account. Production requires persistent accounts and never enables this bypass.</p>
          <Link className="button button-primary button-large" href={"/today" as Route}>Open local workspace <ArrowRight size={17} /></Link>
          <span className="privacy-note">Local process only · no production authentication bypass</span>
        </section>
      </main>
    );
  }

  return (
    <main className="login-shell">
      <section className="login-card auth-card">
        <BrandMark className="brand-mark" title="Continuum" />
        <p className="eyebrow">CONTINUUM</p>
        <h1>{mode === "login" ? "Continue with your context intact." : "Create one private academic workspace."}</h1>
        <p className="auth-lead">{mode === "login" ? "Sign in to your private academic state and connected assistants." : "Your password is slow-hashed; sessions are revocable and stored as one-way token hashes."}</p>

        {demoAvailable ? (
          <button type="button" className="demo-cta" onClick={() => void tryDemo()} disabled={busy !== null}>
            <PlayCircle size={18} />
            <span><strong>{busy === "demo" ? "Opening the demo…" : "Explore the demo"}</strong><small>Use the same non-admin workspace and integration settings as every student</small></span>
            <ArrowRight size={16} />
          </button>
        ) : null}

        {demoAvailable ? <div className="auth-divider"><span>or use username &amp; password</span></div> : null}

        {registrationEnabled ? (
          <div className="auth-tabs" role="tablist">
            <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(null); }}>Sign in</button>
            <button role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(null); }}>Create account</button>
          </div>
        ) : <p className="registration-closed">New account registration is currently closed.</p>}

        <form className="auth-form" onSubmit={submit}>
          <label>Username
            <input name="username" type="text" minLength={mode === "register" ? USERNAME_MIN_LENGTH : 1} maxLength={USERNAME_MAX_LENGTH} required autoComplete="username" placeholder={mode === "login" ? "Your username" : "Choose a username"} />
            {mode === "register" ? <small className="field-hint">{USERNAME_HELP}</small> : null}
          </label>
          <label>Password
            <span className="password-field">
              <input name="password" type={showPassword ? "text" : "password"} minLength={mode === "register" ? PASSWORD_MIN_LENGTH : 1} required autoComplete={mode === "register" ? "new-password" : "current-password"} />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </span>
            {mode === "register" ? <small className="field-hint">{PASSWORD_HELP}</small> : null}
          </label>
          {mode === "register" ? <>
            <label>Confirm password
              <span className="password-field">
                <input name="passwordConfirmation" type={showPassword ? "text" : "password"} minLength={PASSWORD_MIN_LENGTH} required autoComplete="new-password" />
              </span>
            </label>
            <label className="auth-terms"><input name="termsAccepted" type="checkbox" required />I agree to the Privacy and account-retention terms.</label>
          </> : <small className="field-hint">Self-service password recovery is not available yet. Keep your password somewhere safe.</small>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button button-primary button-large" disabled={busy !== null}>{busy === "form" ? "Please wait…" : mode === "login" ? "Sign in" : "Create private workspace"}<ArrowRight size={17} /></button>
        </form>

        <span className="privacy-note"><ShieldCheck size={13} /> HttpOnly session · same-origin writes · rate limited</span>
      </section>
    </main>
  );
}
