"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

import { cn } from "./utils";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ControlSize = "sm" | "md" | "lg";

/**
 * §15.9: one primary per screen region. The variant is a class rather than a
 * prop-driven style object so per-screen CSS can still override spacing without
 * reaching for a second component.
 */
export function Button({
  className,
  variant,
  size = "md",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ControlSize }) {
  return (
    <button
      type={props.type ?? "button"}
      className={cn("button", variant && `button-${variant}`, size !== "md" && `button-${size}`, className)}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Icon-only controls always carry an accessible name; §15.9 prohibits them in a
 * primary flow precisely because the name is invisible.
 */
export function IconButton({
  label,
  className,
  variant = "quiet",
  size = 32,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string;
  variant?: "quiet" | "danger";
  size?: 28 | 32 | 36;
}) {
  return (
    <button
      type={props.type ?? "button"}
      aria-label={label}
      className={cn("icon-button", `icon-button-${variant}`, `icon-button-${size}`, className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: string; className?: string }) {
  return <span className={cn("badge", `badge-${tone}`, className)}>{children}</span>;
}

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info" | "processing";

/**
 * Status is text plus an optional icon, never colour alone (§15.8, WCAG 1.4.1).
 * `label` is the word a screen reader and a colourblind user both rely on.
 */
export function StatusChip({
  tone = "neutral",
  label,
  icon,
  className,
}: {
  tone?: StatusTone;
  label: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("status-chip", `status-chip-${tone}`, className)}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {label}
    </span>
  );
}

export function Progress({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <ProgressPrimitive.Root className={cn("progress-root", className)} value={value} aria-label={label}>
      <ProgressPrimitive.Indicator className="progress-indicator" style={{ transform: `translateX(-${100 - value}%)` }} />
    </ProgressPrimitive.Root>
  );
}

/**
 * The hairline under a sidebar goal row and the bar on a goal header are the
 * same object at two sizes. `valueText` keeps the number available to assistive
 * tech, which a bare `role="progressbar"` does not (§15.9).
 */
export function ProgressBar({
  value,
  label,
  valueText,
  size = 4,
  className,
}: {
  value: number;
  label: string;
  valueText?: string;
  size?: 2 | 4;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={cn("progress-bar", `progress-bar-${size}`, className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={valueText ?? `${clamped}%`}
    >
      <span style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={250}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content className="tooltip" sideOffset={7}>
            {label}
            <TooltipPrimitive.Arrow className="tooltip-arrow" />
          </TooltipPrimitive.Content>
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
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; loadingLabel?: string; variant?: ButtonVariant; size?: ControlSize }) {
  return (
    <Button {...props} disabled={disabled || loading} aria-busy={loading}>
      {loading ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}
      {loading ? loadingLabel : children}
    </Button>
  );
}
