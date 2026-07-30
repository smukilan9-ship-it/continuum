"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRef, type ReactNode } from "react";

import { cn } from "./utils";

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

/**
 * The APG tab pattern: arrow keys move selection, Home/End jump to the ends,
 * and only the selected tab is in the tab order. `aria-controls` is wired when
 * the caller supplies panel ids (§15.9).
 */
export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
  variant = "underline",
  className,
}: {
  value: T;
  options: Array<{ value: T; label: string; panelId?: string; badge?: ReactNode }>;
  onChange: (value: T) => void;
  label: string;
  variant?: "underline" | "segmented";
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  function focusTab(index: number) {
    const next = ((index % options.length) + options.length) % options.length;
    const target = options[next];
    if (!target) return;
    onChange(target.value);
    listRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']")[next]?.focus();
  }

  const current = options.findIndex((option) => option.value === value);

  return (
    <div
      ref={listRef}
      className={cn("tabs", `tabs-${variant}`, className)}
      role="tablist"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") { event.preventDefault(); focusTab(current + 1); }
        else if (event.key === "ArrowLeft") { event.preventDefault(); focusTab(current - 1); }
        else if (event.key === "Home") { event.preventDefault(); focusTab(0); }
        else if (event.key === "End") { event.preventDefault(); focusTab(options.length - 1); }
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            id={option.panelId ? `${option.panelId}-tab` : undefined}
            aria-selected={selected}
            aria-controls={option.panelId}
            tabIndex={selected ? 0 : -1}
            className={cn("tab", selected && "tab-active")}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.badge ? <span className="tab-badge">{option.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export type Crumb = { label: string; href?: string };

/** Max two levels (§15.9); deeper hierarchies truncate to the last. */
export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  const shown = items.slice(-2);
  return (
    <nav aria-label="Breadcrumb" className={cn("breadcrumb", className)}>
      <ol>
        {shown.map((item, index) => {
          const last = index === shown.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {item.href && !last ? <Link href={item.href as Route}>{item.label}</Link> : <span aria-current={last ? "page" : undefined}>{item.label}</span>}
              {last ? null : <span className="breadcrumb-sep" aria-hidden="true">›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
