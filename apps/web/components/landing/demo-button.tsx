"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";

/**
 * AC-M4: one click from the hero to a working demo workspace.
 *
 * The old CTA linked to `/login?demo=1`, which is two clicks — the login page
 * has never read that parameter, so the visitor still had to find and press
 * "Explore the demo". This posts to the same endpoint that button posts to.
 *
 * `POST /api/auth/demo` is not an auth bypass: it signs in the seeded demo
 * account through the normal password path. When the demo is not available the
 * server does not render this control at all (see `LandingPage`), so there is no
 * state in which pressing it does nothing.
 */
export function DemoButton({
  className,
  label = "Try the demo workspace",
  icon = true,
}: {
  className: string;
  label?: string;
  icon?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openDemo() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/demo", { method: "POST", headers: { "content-type": "application/json" } });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "The demo workspace could not be opened.");
        setBusy(false);
        return;
      }
      window.location.assign("/home");
    } catch {
      setError("The demo workspace could not be reached. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => void openDemo()} disabled={busy}>
        {busy ? "Opening the demo…" : label}
        {icon ? <ArrowRight size={16} aria-hidden="true" /> : null}
      </button>
      {error ? (
        <p className="mk-cta-error" role="status">
          {error} <a href="/login">Sign in instead</a>
        </p>
      ) : null}
    </>
  );
}
