"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DemoButton } from "@/components/landing/demo-button";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Replaces the `<details>` disclosure the old header used (§10.6).
 *
 * A `<details>` sheet leaks focus to the page behind it, cannot be closed with
 * `Esc`, and never announces itself as a dialog. This is a real modal: focus
 * moves in on open, is trapped while open, returns to the trigger on close, and
 * the background is inert to scroll.
 */
export function MobileNav({ links, demoAvailable }: { links: ReadonlyArray<readonly [string, string]>; demoAvailable: boolean }) {
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    if (!sheet) return;

    // Captured now: by cleanup time the trigger may already have unmounted, and
    // focus has to go back to something the user can see.
    const returnFocusTo = triggerRef.current ?? (document.activeElement as HTMLElement | null);
    sheet.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(sheet!.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items.at(0);
      const last = items.at(-1);
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !sheet!.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      returnFocusTo?.focus();
    };
  }, [open, close]);

  return (
    <div className="mk-mobile">
      <button
        ref={triggerRef}
        type="button"
        className="mk-mobile-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Menu size={20} aria-hidden="true" />
        <span className="sr-only">Open navigation</span>
      </button>

      {open ? (
        <div className="mk-sheet-root">
          <div className="mk-sheet-scrim" onClick={close} aria-hidden="true" />
          <div className="mk-sheet" role="dialog" aria-modal="true" aria-label="Navigation" ref={sheetRef}>
            <div className="mk-sheet-head">
              <span>Continuum</span>
              <button type="button" onClick={close} className="mk-mobile-trigger">
                <X size={20} aria-hidden="true" />
                <span className="sr-only">Close navigation</span>
              </button>
            </div>
            <nav aria-label="Sections">
              {links.map(([label, href]) => (
                <a key={href} href={href} onClick={close}>
                  {label}
                </a>
              ))}
            </nav>
            <div className="mk-sheet-actions">
              {demoAvailable ? <DemoButton className="mk-btn mk-btn-primary" /> : null}
              <Link className="mk-btn mk-btn-secondary" href="/login?mode=register" onClick={close}>
                Create your workspace
              </Link>
              <Link className="mk-sheet-signin" href="/login" onClick={close}>
                Sign in
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
