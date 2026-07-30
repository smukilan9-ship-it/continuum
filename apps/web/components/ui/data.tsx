"use client";

import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "./utils";

/**
 * The default for collections (§15.9) — a real `<ul>`, not a div soup, and not
 * a card grid, which is reserved for genuinely independent objects.
 */
export function List({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return <ul className={cn("list", className)} aria-label={label}>{children}</ul>;
}

/**
 * One row shape across the product. When `href` is set the whole row is the
 * link target — a 4px-tall click target inside a 40px row is the most common
 * accessibility regression in list UIs. `actions` sits outside the link so
 * overflow menus stay independently operable.
 */
export function Row({
  href,
  onSelect,
  selected,
  leading,
  title,
  meta,
  trailing,
  actions,
  density = "default",
  className,
}: {
  href?: string;
  onSelect?: () => void;
  selected?: boolean;
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  actions?: ReactNode;
  density?: "compact" | "default" | "comfortable";
  className?: string;
}) {
  const body = (
    <>
      {leading ? <span className="row-leading">{leading}</span> : null}
      <span className="row-copy">
        <span className="row-title">{title}</span>
        {meta ? <span className="row-meta">{meta}</span> : null}
      </span>
      {trailing ? <span className="row-trailing">{trailing}</span> : null}
    </>
  );

  const interactive = Boolean(href || onSelect);

  return (
    <li className={cn("row", `row-${density}`, interactive && "row-interactive", selected && "row-selected", className)}>
      {href ? (
        <Link className="row-hit" href={href as Route} aria-current={selected ? "true" : undefined}>{body}</Link>
      ) : onSelect ? (
        <button type="button" className="row-hit" aria-pressed={selected} onClick={onSelect}>{body}</button>
      ) : (
        <div className="row-hit">{body}</div>
      )}
      {actions ? <span className="row-actions">{actions}</span> : null}
    </li>
  );
}

export type Column<T> = {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  numeric?: boolean;
  width?: string;
};

/** Comparable numeric data only — never layout (§15.9). */
export function Table<T>({
  items,
  columns,
  caption,
  getKey,
  className,
}: {
  items: T[];
  columns: Array<Column<T>>;
  caption: string;
  getKey: (item: T, index: number) => string;
  className?: string;
}) {
  return (
    // A region that scrolls horizontally must be reachable by keyboard
    // (WCAG 2.1.1) — axe reports `scrollable-region-focusable` as serious
    // otherwise, and a keyboard user simply cannot see the right-hand columns.
    // The caption names the region so the stop in the tab order is explained.
    <div className={cn("table-scroll", className)} tabIndex={0} role="region" aria-label={caption}>
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" style={column.width ? { width: column.width } : undefined} className={column.numeric ? "numeric" : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={getKey(item, index)}>
              {columns.map((column) => (
                <td key={column.key} className={column.numeric ? "numeric" : undefined}>{column.render(item)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
