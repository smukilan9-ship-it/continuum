"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "./utils";

/**
 * Every control is labelled and every error is programmatically associated
 * (§15.9, §15.11). `Field` owns the id wiring so no caller has to remember
 * `aria-describedby`; a placeholder is never a substitute for a label.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("field", error && "field-error", className)}>
      <label className="field-label" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {hint ? <p className="field-hint" id={hintId}>{hint}</p> : null}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? <p className="field-message" id={errorId} role="alert">{error}</p> : null}
    </div>
  );
}

export function Input({ className, invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cn("input", invalid && "input-invalid", className)} aria-invalid={invalid || undefined} {...props} />;
}

export function Textarea({ className, invalid, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={cn("input textarea", invalid && "input-invalid", className)} aria-invalid={invalid || undefined} {...props} />;
}

/** Native select below 8 options; a combobox above it (§15.9). */
export function Select({ className, invalid, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={cn("input select", invalid && "input-invalid", className)} aria-invalid={invalid || undefined} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ label, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode }) {
  return (
    <label className={cn("choice", className)}>
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function Radio({ label, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode }) {
  return (
    <label className={cn("choice", className)}>
      <input type="radio" {...props} />
      <span>{label}</span>
    </label>
  );
}

/**
 * A switch takes effect immediately; a checkbox defers to a Save. Using the
 * wrong one is the most common way a settings page lies about what it saved,
 * so the distinction is enforced here rather than left to the caller (§15.9).
 */
export function Switch({
  label,
  checked,
  onCheckedChange,
  disabled,
  description,
  className,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  description?: string;
  className?: string;
}) {
  const id = useId();
  const descId = description ? `${id}-desc` : undefined;
  return (
    <div className={cn("switch-row", className)}>
      <span className="switch-copy">
        <label htmlFor={id}>{label}</label>
        {description ? <span id={descId}>{description}</span> : null}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descId}
        disabled={disabled}
        className={cn("switch", checked && "switch-on")}
        onClick={() => onCheckedChange(!checked)}
      >
        <span aria-hidden="true" />
      </button>
    </div>
  );
}
