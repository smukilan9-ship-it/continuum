"use client";

import { ArrowUpRight, X } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceState } from "@/components/workspace/types";
import { AskThread } from "./ask-thread";
import { Composer } from "./composer";
import { useAssistant } from "./use-assistant";
import "./assistant.css";

const WIDTH_KEY = "continuum.assistant.panel.width.v1";
const MIN_WIDTH = 360;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 420;

/** §8.5's three layouts, chosen by viewport width. */
type Layout = "push" | "overlay" | "fullscreen";

function layoutFor(width: number): Layout {
  if (width >= 1280) return "push";
  if (width >= 900) return "overlay";
  return "fullscreen";
}

/**
 * The `⌘J` assistant panel (§8.5).
 *
 * It renders the *same* `AskThread` and `Composer` as `/ask` against the same
 * controller, so the panel and the page are one conversation with two mounts
 * (AC-A9) rather than two implementations that drift.
 */
export function AssistantPanel({ open, onOpenChange, state }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: WorkspaceState;
}) {
  const assistant = useAssistant();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [layout, setLayout] = useState<Layout>("push");
  const panelRef = useRef<HTMLElement>(null);
  const dragFrom = useRef<{ x: number; width: number } | undefined>(undefined);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(stored) && stored >= MIN_WIDTH && stored <= MAX_WIDTH) setWidth(stored);
  }, []);

  useEffect(() => {
    const sync = () => setLayout(layoutFor(window.innerWidth));
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  // The shell reserves space for a pushing panel; an overlaying one must not
  // reserve any, or the content below it shifts for a panel that is on top.
  useEffect(() => {
    const reserve = open && layout === "push" ? `${width}px` : "0px";
    document.documentElement.style.setProperty("--assistant-panel-reserved", reserve);
    return () => document.documentElement.style.setProperty("--assistant-panel-reserved", "0px");
  }, [open, layout, width]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      /**
       * §8.8: Escape closes the **topmost** layer only. This listener is on
       * `window`, so without this guard dismissing the ⌘K palette — or any
       * modal, side panel or drawer opened from inside the panel — also closed
       * the assistant underneath it, and the user lost the conversation they
       * were reading. Every layer that can sit above this one is a Radix dialog
       * or a popper, both of which are identifiable in the document.
       */
      if (document.querySelector("[role='dialog'], [role='alertdialog'], [data-radix-popper-content-wrapper]")) return;
      event.preventDefault();
      onOpenChange(false);
    };
    // Capture on `window`, which runs before Radix's own document-level
    // capture listener. React 19 flushes discrete events synchronously, so by
    // the bubble phase the layer above has already been unmounted and the
    // check above would find nothing to defer to.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onOpenChange]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    if (!dragFrom.current) return;
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragFrom.current.width + (dragFrom.current.x - event.clientX)));
    setWidth(next);
  }, []);

  const endDrag = useCallback(() => {
    if (!dragFrom.current) return;
    dragFrom.current = undefined;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    setWidth((current) => { window.localStorage.setItem(WIDTH_KEY, String(current)); return current; });
  }, [onPointerMove]);

  function startDrag(event: React.PointerEvent) {
    dragFrom.current = { x: event.clientX, width };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
  }

  if (!open) return null;

  const conversationHref = (assistant.active ? `/ask?conversation=${encodeURIComponent(assistant.active.id)}` : "/ask") as Route;

  return (
    <>
      {layout === "overlay" ? <button className="assistant-panel-scrim" aria-label="Close assistant" onClick={() => onOpenChange(false)} /> : null}
      <aside
        ref={panelRef}
        className={`assistant-panel assistant-panel-${layout}`}
        style={layout === "fullscreen" ? undefined : { width }}
        aria-label="Continuum assistant"
      >
        {layout === "fullscreen" ? null : (
          <button
            className="assistant-panel-resize"
            aria-label="Resize assistant panel"
            onPointerDown={startDrag}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              setWidth((current) => {
                const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, current + (event.key === "ArrowLeft" ? 24 : -24)));
                window.localStorage.setItem(WIDTH_KEY, String(next));
                return next;
              });
            }}
          />
        )}
        <header className="assistant-panel-head">
          <strong>{assistant.active?.title ?? "New conversation"}</strong>
          <span>
            <Link href={conversationHref} aria-label="Open in Ask" title="Open in Ask"><ArrowUpRight size={16} /></Link>
            <button onClick={() => onOpenChange(false)} aria-label="Close assistant"><X size={16} /></button>
          </span>
        </header>
        <AskThread state={state} compact />
        <Composer compact />
      </aside>
    </>
  );
}
