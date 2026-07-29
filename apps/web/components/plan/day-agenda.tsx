"use client";

/**
 * The mobile plan (redesign.md §14.2, fixes C6) — below 900px.
 *
 * At 375px the seven-column board painted Thursday and Friday on top of
 * Wednesday and clipped titles mid-word: narrow breakpoints gave each day a
 * `min-width` while the grid tracks stayed at desktop sizes, and a grid item
 * wider than its track overflows onto its neighbour. Phase 7's first pass
 * moved the width onto the tracks, which stopped the overlap.
 *
 * This removes the cause rather than the symptom. Seven columns is the wrong
 * shape for a 375px screen at any track width, so the grid is replaced by a
 * date strip and a single day's agenda: full-width rows, one column, nothing
 * positioned absolutely, and therefore nothing that can overlap or scroll
 * sideways (AC-PL1).
 */
import { CalendarClock } from "lucide-react";
import { dayKey, durationMinutes, goalColorIndex, localTimeInput, type Commitment } from "./plan-time";
import type { PlanBlock } from "./week-grid";

export function DayAgenda({
  week,
  timeZone,
  selectedKey,
  onSelectDay,
  blocks,
  commitments,
  draft,
  overlapIds,
  movingId,
  todayKey,
  onSelect,
  onKeyDown,
}: {
  week: Date[];
  timeZone: string;
  selectedKey: string;
  onSelectDay: (key: string) => void;
  blocks: PlanBlock[];
  commitments: Commitment[];
  draft: boolean;
  overlapIds: Set<string>;
  movingId: string;
  todayKey: string;
  onSelect?: (block: PlanBlock) => void;
  onKeyDown?: (event: React.KeyboardEvent, block: PlanBlock) => void;
}) {
  const dayBlocks = blocks
    .filter((block) => dayKey(block.start, timeZone) === selectedKey)
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
  const dayCommitments = commitments
    .filter((commitment) => dayKey(commitment.start, timeZone) === selectedKey)
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start));

  const entries: Array<{ id: string; start: string; end: string; title: string; kind: "study" | "busy"; block?: PlanBlock }> = [
    ...dayCommitments.map((commitment) => ({ id: commitment.id, start: commitment.start, end: commitment.end, title: commitment.title, kind: "busy" as const })),
    ...dayBlocks.map((block) => ({ id: block.id, start: block.start, end: block.end, title: block.title, kind: "study" as const, block })),
  ].sort((left, right) => Date.parse(left.start) - Date.parse(right.start));

  return (
    <div className="plan-agenda">
      {/* The strip scrolls; the agenda below it never does. */}
      <div className="plan-datestrip" role="tablist" aria-label="Day">
        {week.map((day) => {
          const key = dayKey(day, timeZone);
          const count = blocks.filter((block) => dayKey(block.start, timeZone) === key).length;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={key === selectedKey}
              className={[key === selectedKey ? "is-selected" : "", key === todayKey ? "is-today" : ""].filter(Boolean).join(" ")}
              onClick={() => onSelectDay(key)}
            >
              <span>{day.toLocaleDateString("en-GB", { weekday: "narrow", timeZone })}</span>
              <strong>{day.toLocaleDateString("en-GB", { day: "numeric", timeZone })}</strong>
              {count ? <i aria-hidden="true" /> : null}
              <span className="sr-only">{count} block{count === 1 ? "" : "s"}</span>
            </button>
          );
        })}
      </div>

      {entries.length ? (
        <ul className="plan-agenda-list" aria-label="Blocks on the selected day">
          {entries.map((entry) => {
            const interactive = draft && entry.kind === "study" && Boolean(onSelect);
            const overlapping = overlapIds.has(entry.id);
            return (
              <li
                key={entry.id}
                className={[
                  "plan-agenda-row",
                  entry.kind === "busy" ? "is-busy" : "",
                  overlapping ? "is-overlapping" : "",
                  movingId === entry.id ? "is-moving" : "",
                ].filter(Boolean).join(" ")}
                style={entry.block ? { ["--plan-goal" as string]: `var(--goal-${goalColorIndex(entry.block.goalId ?? entry.block.taskId)})` } : undefined}
                {...(interactive && entry.block ? {
                  tabIndex: 0,
                  role: "button",
                  "aria-label": `${entry.title}, ${localTimeInput(entry.start)} to ${localTimeInput(entry.end)}. Press Enter to move.`,
                  onKeyDown: (event: React.KeyboardEvent) => onKeyDown?.(event, entry.block!),
                  onClick: () => onSelect?.(entry.block!),
                } : {})}
              >
                <span className="plan-agenda-time">{localTimeInput(entry.start)}<small>{durationMinutes(entry.start, entry.end)} min</small></span>
                <span className="plan-agenda-copy">
                  <strong>{entry.title}</strong>
                  {entry.kind === "busy" ? <small><CalendarClock size={11} aria-hidden="true" />Busy</small> : overlapping ? <small className="plan-agenda-warning">Overlaps something else</small> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="plan-agenda-empty">Nothing scheduled on this day.</p>
      )}
    </div>
  );
}
