"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { clsx, type ClassValue } from "clsx";
import { AlertCircle, CheckCircle2, Inbox, LoaderCircle, X } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

export function Button({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("button", className)} {...props}>{children}</button>;
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: string; className?: string }) {
  return <span className={cn("badge", `badge-${tone}`, className)}>{children}</span>;
}

export function Progress({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <ProgressPrimitive.Root className={cn("progress-root", className)} value={value} aria-label={label}>
      <ProgressPrimitive.Indicator className="progress-indicator" style={{ transform: `translateX(-${100 - value}%)` }} />
    </ProgressPrimitive.Root>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={250}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content className="tooltip" sideOffset={7}>{label}<TooltipPrimitive.Arrow className="tooltip-arrow" /></TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export function LoadingButton({
  loading,
  loadingLabel = "Working…",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; loadingLabel?: string }) {
  return (
    <Button {...props} disabled={disabled || loading} aria-busy={loading}>
      {loading ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}
      {loading ? loadingLabel : children}
    </Button>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  dirty = false,
  dirtyMessage = "Discard the information you entered?",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  dirty?: boolean;
  dirtyMessage?: string;
}) {
  // The discard prompt is rendered in the dialog rather than raised as a native
  // `window.confirm`: native dialogs are unstyled, block the main thread, cannot
  // be tested, and are suppressed outright in some embedded contexts.
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  function requestClose() {
    if (!dirty) { onOpenChange(false); return; }
    setConfirmingDiscard(true);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (next) { setConfirmingDiscard(false); onOpenChange(true); } else requestClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="modal-backdrop" />
        <DialogPrimitive.Content
          className="modal-content"
          onEscapeKeyDown={(event) => { if (dirty) { event.preventDefault(); requestClose(); } }}
          onPointerDownOutside={(event) => { if (dirty) event.preventDefault(); }}
        >
          <header className="modal-heading">
            <div>
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description>{description}</DialogPrimitive.Description> : null}
            </div>
            <button className="modal-close" type="button" aria-label={`Close ${title}`} onClick={requestClose}><X size={18} /></button>
          </header>
          {confirmingDiscard ? (
            <div className="modal-discard" role="alertdialog" aria-label={dirtyMessage}>
              <p>{dirtyMessage}</p>
              <div>
                <Button className="button-secondary" onClick={() => setConfirmingDiscard(false)}>Keep editing</Button>
                <Button className="button-danger" onClick={() => { setConfirmingDiscard(false); onOpenChange(false); }}>Discard</Button>
              </div>
            </div>
          ) : null}
          <div className="modal-body">{children}</div>
          {footer ? <footer className="modal-footer">{footer}</footer> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

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

/**
 * Skeletons match the shape of what is loading so the layout does not jump; a
 * spinner is only right for indeterminate in-place work.
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

export function SuccessState({ title, body, action, className }: { title: string; body?: string; action?: ReactNode; className?: string }) {
  return <FeedbackState tone="success" icon={<CheckCircle2 size={20} />} title={title} body={body} action={action} className={className} />;
}

export function SegmentedNavigation<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented-navigation" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? "active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  busy,
  destructive = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  destructive?: boolean;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={<><Button className="button-secondary" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton className={destructive ? "button-danger" : "button-primary"} loading={busy} onClick={onConfirm}>{confirmLabel}</LoadingButton></>}
    >
      <p className="confirmation-copy">{description}</p>
    </Modal>
  );
}
