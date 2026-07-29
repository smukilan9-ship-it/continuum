"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Windowed list for the Library's two collections (§13.2 Performance:
 * "Virtualise above 50 rows").
 *
 * Below the threshold everything renders, because windowing a 20-row list costs
 * more than it saves and breaks native find-in-page for no benefit. Above it,
 * only the visible slice plus an overscan is mounted and the missing height is
 * held by two spacer rows, so the scrollbar stays honest.
 *
 * The element stays a real `<ul>` of `<li>`s, and `renderItem` receives the
 * absolute index plus the set size so each row can carry `aria-setsize` /
 * `aria-posinset` — which is what keeps "item 12 of 240" true for a screen
 * reader when only 18 rows exist in the DOM.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  renderItem,
  label,
  threshold = 50,
  overscan = 8,
  className,
}: {
  items: T[];
  rowHeight: number;
  renderItem: (item: T, position: { index: number; setSize: number }) => ReactNode;
  label: string;
  threshold?: number;
  overscan?: number;
  className?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: threshold });
  const virtualised = items.length > threshold;

  const measure = useCallback(() => {
    const node = viewportRef.current;
    if (!node) return;
    const first = Math.floor(node.scrollTop / rowHeight);
    const visible = Math.ceil(node.clientHeight / rowHeight);
    setRange({ start: Math.max(0, first - overscan), end: Math.min(items.length, first + visible + overscan) });
  }, [items.length, overscan, rowHeight]);

  useEffect(() => {
    if (!virtualised) return;
    measure();
    const node = viewportRef.current;
    if (!node) return;
    node.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(node);
    return () => {
      node.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [measure, virtualised]);

  const start = virtualised ? range.start : 0;
  const end = virtualised ? Math.max(range.end, range.start + 1) : items.length;

  return (
    <div className={className} ref={viewportRef}>
      <ul className="list library-virtual" aria-label={label}>
        {virtualised && start > 0 ? <li aria-hidden="true" style={{ height: start * rowHeight }} /> : null}
        {items.slice(start, end).map((item, offset) => renderItem(item, { index: start + offset, setSize: items.length }))}
        {virtualised && end < items.length ? <li aria-hidden="true" style={{ height: (items.length - end) * rowHeight }} /> : null}
      </ul>
    </div>
  );
}
