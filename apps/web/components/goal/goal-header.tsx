"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui";
import { formatLabel, statusTone } from "@/lib/labels";
import { number, text, type Row } from "@/components/workspace/types";

function daysUntil(target: string, now: number) {
  const days = Math.ceil((Date.parse(target) - now) / 86_400_000);
  return Number.isFinite(days) ? days : undefined;
}

/**
 * The goal header (§9.6). It renders from shell data the instant the route
 * does, so switching views never blanks the title — only the panel below it
 * skeletons.
 *
 * The title is a button that swaps to an input: saves on blur or Enter,
 * cancels on Escape, and carries its own label so a screen reader announces
 * what the field is rather than reading the current value as the prompt.
 */
export function GoalHeader({
  goal,
  now,
  onRename,
  actions,
  children,
}: {
  goal: Row | undefined;
  now: number;
  onRename: (title: string) => void;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const title = text(goal, "title", "Goal");
  const progress = Math.round(number(goal, "progress") * 100);
  const days = daysUntil(text(goal, "targetDate", ""), now);
  const status = text(goal, "status", "active");

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  function commit(next: string) {
    setEditing(false);
    const clean = next.trim();
    if (clean && clean !== title) onRename(clean);
  }

  return (
    <header className="goal-header">
      <div className="goal-header-line">
        {editing ? (
          <input
            ref={inputRef}
            className="goal-title-input"
            aria-label="Goal title"
            defaultValue={title}
            maxLength={200}
            onBlur={(event) => commit(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); commit(event.currentTarget.value); }
              if (event.key === "Escape") { event.preventDefault(); setEditing(false); }
            }}
          />
        ) : (
          <button type="button" className="goal-title" onClick={() => setEditing(true)} aria-label={`Rename goal: ${title}`}>
            <h1>{title}</h1>
          </button>
        )}
        <Badge tone={statusTone(status)}>{formatLabel(status)}</Badge>
        <span className="goal-header-actions">{actions}</span>
      </div>

      <p className="goal-header-outcome">{text(goal, "outcome")}</p>

      <div className="goal-progress-strip">
        <div className="goal-progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${title} progress`}>
          <i style={{ width: `${Math.max(2, progress)}%` }} />
        </div>
        <span>
          <strong>{progress}%</strong>
          {days !== undefined ? days > 0 ? ` · ${days} days left` : days === 0 ? " · due today" : ` · ${Math.abs(days)} days overdue` : ""}
        </span>
      </div>

      {children}
    </header>
  );
}
