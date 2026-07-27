"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    await fetch("/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "forgot", email: form.get("email") }),
    }).catch(() => undefined);
    setBusy(false);
    setSent(true);
  }
  return <main className="login-shell"><section className="login-card auth-card">
    <div className="brand-mark">C</div><p className="eyebrow">ACCOUNT RECOVERY</p>
    <h1>{sent ? "Check your email." : "Reset your Continuum password."}</h1>
    <p>{sent ? "If an eligible account exists, a single-use recovery link has been sent. The same response is shown for every address." : "Enter your account email. Continuum never reveals whether an address is registered."}</p>
    {!sent ? <form className="auth-form" onSubmit={submit}><label>Email<input name="email" type="email" required autoComplete="email" /></label><button className="button button-primary button-large" disabled={busy}>{busy ? "Requesting…" : "Send recovery link"}</button></form> : null}
    <Link className="button button-secondary" href="/login">Back to sign in</Link>
  </section></main>;
}
