"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function VerifyEmailPage() {
  const [state, setState] = useState<"checking" | "verified" | "invalid">("checking");
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    window.history.replaceState({}, "", "/verify-email");
    if (!token) { setState("invalid"); return; }
    void fetch("/api/auth/verification", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify", token }) })
      .then((response) => setState(response.ok ? "verified" : "invalid"))
      .catch(() => setState("invalid"));
  }, []);
  return <main className="login-shell"><section className="login-card auth-card"><div className="brand-mark">C</div><p className="eyebrow">EMAIL VERIFICATION</p>
    <h1>{state === "checking" ? "Verifying your email…" : state === "verified" ? "Email verified." : "This verification link cannot be used."}</h1>
    <p>{state === "verified" ? "Your native Continuum account can now use connected and AI-powered features." : state === "invalid" ? "The link is invalid, expired, or already used. Sign in to request another." : "The link is single-use and will be removed from this browser’s address bar."}</p>
    {state !== "checking" ? <Link className="button button-primary" href={state === "verified" ? "/" : "/login"}>{state === "verified" ? "Open Continuum" : "Back to sign in"}</Link> : null}
  </section></main>;
}
