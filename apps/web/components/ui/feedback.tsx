"use client";

import { AlertCircle, CheckCircle2, Inbox, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { cn } from "./utils";

function FeedbackState({
  icon,
  title,
  body,
  action,
  tone,
  className,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  tone: "empty" | "error" | "success";
  className?: string;
}) {
  return (
    <div className={cn("feedback-state", `feedback-state-${tone}`, className)} role={tone === "error" ? "alert" : "status"}>
      <span>{icon}</span>
      <div><h3>{title}</h3>{body ? <p>{body}</p> : null}</div>
      {action ? <div className="feedback-state-action">{action}</div> : null}
    </div>
  );
}

/** The single empty-state pattern (§15.8): one heading, one sentence, one action. */
export function EmptyState({ title, body, action, icon, className }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return <FeedbackState tone="empty" icon={icon ?? <Inbox size={20} />} title={title} body={body} action={action} className={className} />;
}

/**
 * Three properties are required of every error the user sees: plain language, a
 * way forward, and reassurance where it is true. Anything technical belongs in
 * `detail`, which is collapsed and must already be safe to display.
 */
export function ErrorState({ title, body, action, detail, className }: { title: string; body?: string; action?: ReactNode; detail?: string; className?: string }) {
  return (
    <FeedbackState
      tone="error"
      icon={<AlertCircle size={20} />}
      title={title}
      body={body}
      className={className}
      action={detail || action ? <>{action}{detail ? <details className="state-detail"><summary>Technical details</summary><p>{detail}</p></details> : null}</> : undefined}
    />
  );
}

export function SuccessState({ title, body, action, className }: { title: string; body?: string; action?: ReactNode; className?: string }) {
  return <FeedbackState tone="success" icon={<CheckCircle2 size={20} />} title={title} body={body} action={action} className={className} />;
}

/**
 * Skeletons match the shape of what is loading so the layout does not jump; a
 * spinner is only right for indeterminate in-place work. Blocks use
 * `--surface-raised`, which is what stops the white-on-dark flash (C17).
 */
export function LoadingState({ variant = "skeleton", rows = 3, label = "Loading", className }: { variant?: "skeleton" | "spinner"; rows?: number; label?: string; className?: string }) {
  if (variant === "spinner") {
    return <div className={cn("loading-state loading-state-spinner", className)} role="status" aria-label={label}><LoaderCircle className="spin" size={18} aria-hidden="true" /><span>{label}</span></div>;
  }
  return (
    <div className={cn("loading-state loading-state-skeleton", className)} role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => <span key={index} className="skeleton-row" />)}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** A single skeleton block, for composing layout-shaped loading states. */
export function Skeleton({ height, width, radius, className }: { height?: number | string; width?: number | string; radius?: number; className?: string }) {
  return <span className={cn("skeleton-row", className)} style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}

export type RegionStatus = "idle" | "loading" | "error" | "empty" | "ready";

/**
 * One state machine for every data-backed region — `idle → loading → (empty |
 * error | ready)` — with exactly one branch on screen. OpenAlex used to render
 * an error banner, an invitation to search, and a "select an entity" prompt at
 * the same time, all disagreeing about what had happened.
 */
export function DataRegion({
  status,
  idle,
  loading,
  error,
  empty,
  children,
  className,
}: {
  status: RegionStatus;
  idle?: ReactNode;
  loading?: ReactNode;
  error?: ReactNode;
  empty?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const branch = status === "idle" ? idle ?? null
    : status === "loading" ? loading ?? <LoadingState />
    : status === "error" ? error ?? null
    : status === "empty" ? empty ?? null
    : children;
  return <div className={cn("data-region", `data-region-${status}`, className)}>{branch}</div>;
}

export type BannerTone = "info" | "warning" | "danger" | "success";

/** Page-level state. Per-item problems belong on the item, not up here (§15.9). */
export function Banner({
  tone = "info",
  title,
  children,
  action,
  onDismiss,
  className,
}: {
  tone?: BannerTone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const Icon = tone === "danger" ? AlertCircle : tone === "warning" ? TriangleAlert : tone === "success" ? CheckCircle2 : Info;
  return (
    <div className={cn("ui-banner", `ui-banner-${tone}`, className)} role={tone === "danger" ? "alert" : "status"}>
      <Icon size={16} aria-hidden="true" />
      <div className="ui-banner-copy">
        {title ? <strong>{title}</strong> : null}
        <span>{children}</span>
      </div>
      {action ? <div className="ui-banner-action">{action}</div> : null}
      {onDismiss ? <button type="button" className="ui-banner-dismiss" aria-label="Dismiss" onClick={onDismiss}><X size={14} /></button> : null}
    </div>
  );
}

export type Toast = {
  id: string;
  tone: "info" | "success" | "error";
  message: string;
  action?: { label: string; onSelect: () => void };
};

type ToastInput = Omit<Toast, "id"> & { id?: string };

const ToastContext = createContext<{ push: (toast: ToastInput) => void; dismiss: (id: string) => void } | null>(null);

/**
 * Replaces the single global toast string, which had a 4.2s timeout and let
 * concurrent operations overwrite one another (S13). Queue caps at three,
 * deduplicates by message, and errors persist until dismissed because an error
 * that vanishes on its own cannot be acted on.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const push = useCallback((toast: ToastInput) => {
    setToasts((current) => {
      if (current.some((existing) => existing.message === toast.message)) return current;
      const id = toast.id ?? `${Date.now()}-${current.length}`;
      const next = [...current, { ...toast, id }].slice(-3);
      if (toast.tone !== "error") {
        timers.current.set(id, setTimeout(() => dismiss(id), toast.action ? 8000 : 5000));
      }
      return next;
    });
  }, [dismiss]);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ui-toast-viewport" role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <div key={toast.id} className={cn("ui-toast", `ui-toast-${toast.tone}`)} role={toast.tone === "error" ? "alert" : "status"} aria-live={toast.tone === "error" ? "assertive" : "polite"}>
            <span className="ui-toast-message">{toast.message}</span>
            {toast.action ? (
              <button type="button" className="ui-toast-action" onClick={() => { toast.action?.onSelect(); dismiss(toast.id); }}>{toast.action.label}</button>
            ) : null}
            <button type="button" className="ui-toast-dismiss" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
