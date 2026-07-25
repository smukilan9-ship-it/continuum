"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { clsx, type ClassValue } from "clsx";
import { AlertCircle, CheckCircle2, Inbox, LoaderCircle, X } from "lucide-react";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

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
  function requestClose() {
    if (!dirty || window.confirm(dirtyMessage)) onOpenChange(false);
  }
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => next ? onOpenChange(true) : requestClose()}>
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

export function EmptyState({ title, body, action, className }: { title: string; body?: string; action?: ReactNode; className?: string }) {
  return <FeedbackState tone="empty" icon={<Inbox size={20} />} title={title} body={body} action={action} className={className} />;
}

export function ErrorState({ title, body, action, className }: { title: string; body?: string; action?: ReactNode; className?: string }) {
  return <FeedbackState tone="error" icon={<AlertCircle size={20} />} title={title} body={body} action={action} className={className} />;
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
