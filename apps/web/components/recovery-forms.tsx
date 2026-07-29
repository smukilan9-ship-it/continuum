"use client";

import { ArrowRight, CheckCircle2, MailCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState, type FormEvent } from "react";
import { BrandMark } from "@/components/brand-mark";
import { PASSWORD_HELP, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

function Shell({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <main className="login-shell">
      <section className="login-card auth-card">
        <BrandMark className="brand-mark" title="Continuum" />
        <p className="eyebrow">CONTINUUM</p>
        <h1>{title}</h1>
        {lead ? <p className="auth-lead">{lead}</p> : null}
        {children}
      </section>
    </main>
  );
}

/**
 * Requesting a reset link.
 *
 * The success panel is shown whether or not the account exists, and the request
 * is sent the same way in both cases, so this page cannot be used to discover
 * which usernames are registered.
 */
export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const username = String(new FormData(event.currentTarget).get("username") ?? "");
    try {
      await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "request_reset", username }),
      });
    } catch {
      // A network failure must not reveal anything either, so the panel is the
      // same and the user is invited to try again.
    }
    setBusy(false);
    setSent(true);
    setCooldown(60);
  }

  if (sent) {
    return (
      <Shell title="Check for your reset link">
        <div className="auth-result">
          <MailCheck size={22} aria-hidden="true" />
          <p>If that account exists, a reset link is on its way. It expires in 30 minutes and can be used once.</p>
        </div>
        <div className="auth-result-actions">
          <Link className="button button-primary button-large" href={"/login" as Route}>Back to sign in <ArrowRight size={16} /></Link>
          <button
            type="button"
            className="auth-secondary-link"
            disabled={cooldown > 0}
            onClick={() => { setSent(false); }}
          >
            {cooldown > 0 ? `Send again in ${cooldown}s` : "Send another link"}
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Reset your password" lead="Enter your username and we'll send a link to set a new password.">
      <form className="auth-form" onSubmit={submit}>
        <label>Username
          <input name="username" type="text" required maxLength={120} autoComplete="username" autoFocus placeholder="Your username" />
        </label>
        <button className="button button-primary button-large" disabled={busy}>
          {busy ? "Sending…" : "Send reset link"}<ArrowRight size={17} />
        </button>
      </form>
      <Link className="auth-secondary-link" href={"/login" as Route}>Back to sign in</Link>
      <span className="privacy-note"><ShieldCheck size={13} /> Links expire in 30 minutes and work once</span>
    </Shell>
  );
}

/** Setting a new password from a link. */
export function ResetPasswordForm({ token, usable }: { token: string; usable: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "perform_reset",
          token,
          password: form.get("password"),
          passwordConfirmation: form.get("passwordConfirmation"),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The password could not be reset");
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The password could not be reset");
    } finally {
      setBusy(false);
    }
  }

  if (!usable) {
    return (
      <Shell title="This link no longer works" lead="Reset links expire after 30 minutes and can only be used once.">
        <Link className="button button-primary button-large" href={"/forgot-password" as Route}>Request a new link <ArrowRight size={16} /></Link>
        <Link className="auth-secondary-link" href={"/login" as Route}>Back to sign in</Link>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell title="Password updated">
        <div className="auth-result">
          <CheckCircle2 size={22} aria-hidden="true" />
          <p>Your password is set and every other session was signed out.</p>
        </div>
        <Link className="button button-primary button-large" href={"/login" as Route}>Sign in <ArrowRight size={16} /></Link>
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new password" lead="Setting a new password signs out every other session.">
      <form className="auth-form" onSubmit={submit}>
        <label>New password
          <input name="password" type="password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" autoFocus />
          <small className="field-hint">{PASSWORD_HELP}</small>
        </label>
        <label>Confirm new password
          <input name="passwordConfirmation" type="password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" />
        </label>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="button button-primary button-large" disabled={busy}>
          {busy ? "Saving…" : "Set new password"}<ArrowRight size={17} />
        </button>
      </form>
    </Shell>
  );
}

/** Confirming an email address from a link. */
export function VerifyEmailPanel({ token }: { token: string }) {
  const [state, setState] = useState<"working" | "done" | "failed">("working");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/auth/verification", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "confirm", token }),
        });
        if (active) setState(response.ok ? "done" : "failed");
      } catch {
        if (active) setState("failed");
      }
    })();
    return () => { active = false; };
  }, [token]);

  if (state === "working") {
    return <Shell title="Confirming your email…"><p className="auth-lead" role="status">This only takes a moment.</p></Shell>;
  }

  if (state === "failed") {
    return (
      <Shell title="This link no longer works" lead="Confirmation links expire after 24 hours and can only be used once.">
        <Link className="button button-primary button-large" href={"/today" as Route}>Continue to Continuum <ArrowRight size={16} /></Link>
      </Shell>
    );
  }

  return (
    <Shell title="Email confirmed">
      <div className="auth-result">
        <CheckCircle2 size={22} aria-hidden="true" />
        <p>Password recovery is now available for this account.</p>
      </div>
      <Link className="button button-primary button-large" href={"/today" as Route}>Continue to Continuum <ArrowRight size={16} /></Link>
    </Shell>
  );
}
