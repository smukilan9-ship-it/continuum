"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Restores focus to whatever opened a dialog (§15.11, §18.6).
 *
 * Radix's modal `Dialog.Content` handles close-autofocus itself: it calls
 * `event.preventDefault()` — cancelling `FocusScope`'s own restore — and then
 * focuses `context.triggerRef.current`. That ref is only ever populated by
 * `<Dialog.Trigger>`, and **none** of Continuum's dialogs use one: they are all
 * opened by a caller-owned button driving an `open` prop. The ref is therefore
 * null, nothing is focused, and focus lands on `<body>` — a keyboard user's next
 * Tab restarts from the top of the document, and a screen-reader user is
 * silently dropped out of context.
 *
 * `composeEventHandlers` runs the caller's `onCloseAutoFocus` first and skips
 * Radix's when the caller prevents default, so preventing default here both
 * suppresses the broken restore and lets us do the right one.
 *
 * Usage: spread `restoreProps` onto the `Dialog.Content`.
 */
export function useReturnFocus(open: boolean) {
  const origin = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Captured on the transition into open, before Radix moves focus inside.
    const active = document.activeElement;
    origin.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [open]);

  const onCloseAutoFocus = useCallback((event: Event) => {
    const target = origin.current;
    origin.current = null;
    if (!target || !target.isConnected) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
  }, []);

  return { onCloseAutoFocus };
}
