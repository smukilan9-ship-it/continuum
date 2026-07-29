"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { Button, ErrorState, Skeleton, StatusChip } from "@/components/ui";

import { isLive, needsUser, statusTone, type ConnectionStatus } from "./status";

/**
 * The shape of every connection row (§9.10).
 *
 * `<details>`/`<summary>` rather than a hand-rolled disclosure: the native
 * element already gives keyboard operation, the expanded state to assistive
 * technology, and find-in-page into collapsed content. The status word lives
 * inside the summary so it is readable without opening the card.
 */
export function ConnectionCard({
  id,
  icon,
  title,
  outcome,
  status,
  detail,
  featured = false,
  children,
}: {
  id?: string;
  icon: ReactNode;
  title: string;
  outcome: string;
  status: ConnectionStatus;
  detail?: string;
  featured?: boolean;
  children: ReactNode;
}) {
  // Working and needs-attention cards start open — the controls you came for are
  // inside. Everything else stays collapsed so the page can be scanned.
  const open = featured || isLive(status) || needsUser(status);
  return (
    <details className={featured ? "connection-card connection-card-featured" : "connection-card"} id={id} open={open}>
      <summary>
        <span className="connection-icon" aria-hidden="true">{icon}</span>
        <span className="connection-copy">
          <strong>{title}</strong>
          <span>{outcome}</span>
        </span>
        <StatusChip tone={statusTone(status)} label={status} />
        <ChevronDown className="connection-chevron" size={17} aria-hidden="true" />
      </summary>
      <div className="connection-body">
        {detail ? <p className="connection-detail">{detail}</p> : null}
        {children}
      </div>
    </details>
  );
}

/**
 * The card's own placeholder. Each card owns its loading state so the page
 * shell can paint immediately and every card can resolve on its own schedule —
 * the old screen awaited three requests together and showed nothing for
 * seconds (S14).
 */
export function ConnectionCardSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <div
      className={featured ? "connection-card connection-card-featured connection-card-skeleton" : "connection-card connection-card-skeleton"}
      role="status"
      aria-label="Loading this connection"
    >
      <Skeleton width={34} height={34} radius={8} />
      <div>
        <Skeleton width="34%" height={13} />
        <Skeleton width="72%" height={11} />
      </div>
      <Skeleton width={92} height={22} radius={999} />
    </div>
  );
}

/** Per-card failure. A page-level banner would hide the cards that did load. */
export function ConnectionCardError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="connection-card connection-card-failed">
      <ErrorState
        title={`${title} could not be loaded`}
        body={message}
        action={<Button variant="secondary" onClick={onRetry}>Try again</Button>}
      />
    </div>
  );
}

/** The heading above an outcome group. The group answers "what do I get?". */
export function ConnectionGroup({
  title,
  summary,
  collapsed = false,
  children,
}: {
  title: string;
  summary: string;
  collapsed?: boolean;
  children: ReactNode;
}) {
  if (collapsed) {
    return (
      <details className="connection-group connection-group-collapsed">
        <summary>
          <span>
            <strong>{title}</strong>
            <span>{summary}</span>
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div className="connection-group-body">{children}</div>
      </details>
    );
  }
  return (
    <section className="connection-group" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <p>{summary}</p>
      </header>
      <div className="connection-group-body">{children}</div>
    </section>
  );
}
