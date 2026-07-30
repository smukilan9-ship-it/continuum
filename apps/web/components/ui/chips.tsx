"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./utils";

export type ContextKind = "goal" | "project" | "source" | "paper" | "concept" | "conversation" | "decision" | "note" | "file" | "week";

/**
 * The entire context UI (§11.6). These chips replace the ten retrieval
 * checkboxes (C4): the user sees what will be used and can remove it, rather
 * than being asked to design a retrieval strategy up front.
 */
export function ContextChip({
  kind,
  label,
  onRemove,
  icon,
  className,
}: {
  kind: ContextKind;
  label: string;
  onRemove?: () => void;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("context-chip", `context-chip-${kind}`, className)}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span className="context-chip-kind">{kind}</span>
      <span className="context-chip-label">{label}</span>
      {onRemove ? (
        <button type="button" aria-label={`Remove ${label} from context`} onClick={onRemove}><X size={12} /></button>
      ) : null}
    </span>
  );
}

/**
 * Rendered beneath an answer. Unlike the old "Answered using 2 records" label,
 * every chip carries a real record id and opens that record (C5, §11.6).
 */
export function CitationChip({
  kind,
  label,
  detail,
  onOpen,
  className,
}: {
  kind: ContextKind;
  label: string;
  detail?: string;
  onOpen?: () => void;
  className?: string;
}) {
  const content = (
    <>
      <span className="citation-chip-label">{label}</span>
      {detail ? <span className="citation-chip-detail">{detail}</span> : null}
      <span className="citation-chip-kind">{kind}</span>
    </>
  );

  if (!onOpen) return <span className={cn("citation-chip", className)}>{content}</span>;

  return (
    <button type="button" className={cn("citation-chip", "citation-chip-interactive", className)} onClick={onOpen} aria-label={`Open ${label}`}>
      {content}
    </button>
  );
}
