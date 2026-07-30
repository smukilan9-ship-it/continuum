"use client";

/**
 * The week grid (redesign.md §14.2) — desktop, >= 900px.
 *
 * Seven columns, 06:00-24:00, time labels down the left. Blocks are positioned
 * by time and sized by duration, which the previous board did not do: it
 * stacked fixed-height cards in day order, so a 20-minute block and a
 * three-hour block looked identical and nothing showed when the day was full.
 *
 * Two changes carry meaning rather than decoration:
 *   - **No "COMMITTED" caps label** (S15, AC-PL4). It appeared on every block,
 *     in 8px uppercase, saying the same thing every time. Committed is now the
 *     solid default; a draft is a dashed border.
 *   - Fixed commitments are flat bands *behind* the study blocks, so a clash is
 *     visible as an overlap instead of being described in a badge.
 *
 * Every day's blocks are also exposed as a `role="list"`, so a screen reader
 * gets a readable sequence rather than a grid of absolutely positioned divs.
 */
import type { ScheduleBlock } from "@continuum/schemas";
import { GripVertical } from "lucide-react";
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  blockPosition,
  dayKey,
  durationMinutes,
  goalColorIndex,
  HOURS,
  hourLabel,
  localTimeInput,
  type Commitment,
} from "./plan-time";

export type PlanBlock = ScheduleBlock & { goalId?: string };

export function WeekGrid({
  week,
  timeZone,
  blocks,
  commitments,
  draft,
  overlapIds,
  movingId,
  todayKey,
  onSelect,
  onKeyDown,
  onResizeStart,
  onMovePointerDown,
}: {
  week: Date[];
  timeZone: string;
  blocks: PlanBlock[];
  commitments: Commitment[];
  /** Draft blocks are dashed and interactive; saved blocks are solid and read-only. */
  draft: boolean;
  overlapIds: Set<string>;
  movingId: string;
  todayKey: string;
  onSelect?: (block: PlanBlock) => void;
  onKeyDown?: (event: React.KeyboardEvent, block: PlanBlock) => void;
  onResizeStart?: (event: ReactPointerEvent<HTMLButtonElement>, block: PlanBlock) => void;
  onMovePointerDown?: (event: ReactPointerEvent<HTMLElement>, block: PlanBlock) => void;
}) {
  const movingRef = useRef<HTMLLIElement | null>(null);

  /**
   * Each day is its own column, so shifting a block with `←`/`→` moves it to a
   * different parent — React unmounts and remounts the element, and the browser
   * drops focus to `<body>`. The keyboard move then died after one horizontal
   * step: the next arrow and the Enter that drops the block went nowhere, and
   * the block was stranded mid-move (AC-PL2). Refocusing the in-flight element
   * after each commit keeps the whole gesture on the keyboard.
   */
  useEffect(() => {
    if (!movingId) return;
    const node = movingRef.current;
    if (node && node !== document.activeElement) node.focus({ preventScroll: true });
  });

  return (
    <div className={draft ? "plan-grid plan-grid-draft" : "plan-grid"}>
      <div className="plan-grid-hours" aria-hidden="true">
        {HOURS.map((hour) => <span key={hour}>{hourLabel(hour)}</span>)}
      </div>

      <div className="plan-grid-days">
        {week.map((day) => {
          const key = dayKey(day, timeZone);
          const dayBlocks = blocks.filter((block) => dayKey(block.start, timeZone) === key);
          const dayCommitments = commitments.filter((commitment) => dayKey(commitment.start, timeZone) === key);
          const weekday = day.toLocaleDateString("en-GB", { weekday: "short", timeZone });
          return (
            <div className={key === todayKey ? "plan-day is-today" : "plan-day"} key={key}>
              <header className="plan-day-head">
                <span>{weekday}</span>
                <strong>{day.toLocaleDateString("en-GB", { day: "numeric", timeZone })}</strong>
              </header>

              <div className="plan-day-column">
                {HOURS.slice(0, -1).map((hour) => <span key={hour} className="plan-hour-line" aria-hidden="true" />)}

                {dayCommitments.map((commitment) => {
                  const position = blockPosition(commitment.start, commitment.end);
                  return (
                    <div
                      key={commitment.id}
                      className="plan-commitment"
                      style={{ top: `${position.top}%`, height: `${position.height}%` }}
                      title={`${commitment.title} · ${localTimeInput(commitment.start)}–${localTimeInput(commitment.end)}`}
                    >
                      <span>{commitment.title}</span>
                    </div>
                  );
                })}

                <ul className="plan-block-list" aria-label={`Blocks on ${weekday}`}>
                  {dayBlocks.map((block) => {
                    const position = blockPosition(block.start, block.end);
                    const overlapping = overlapIds.has(block.id);
                    const interactive = draft && Boolean(onSelect);
                    return (
                      <li
                        key={block.id}
                        ref={movingId === block.id ? movingRef : undefined}
                        className={[
                          "plan-block",
                          overlapping ? "is-overlapping" : "",
                          movingId === block.id ? "is-moving" : "",
                          block.flexible ? "" : "is-fixed",
                        ].filter(Boolean).join(" ")}
                        style={{
                          top: `${position.top}%`,
                          height: `${position.height}%`,
                          ["--plan-goal" as string]: `var(--goal-${goalColorIndex(block.goalId ?? block.taskId)})`,
                        }}
                        {...(interactive ? {
                          tabIndex: 0,
                          role: "button",
                          "aria-label": `${block.title}, ${localTimeInput(block.start)} to ${localTimeInput(block.end)} on ${weekday}. Press Enter to move.`,
                          "aria-grabbed": movingId === block.id || undefined,
                          onKeyDown: (event: React.KeyboardEvent) => onKeyDown?.(event, block),
                          onPointerDown: (event: ReactPointerEvent<HTMLElement>) => onMovePointerDown?.(event, block),
                          onClick: () => onSelect?.(block),
                        } : {})}
                      >
                        {interactive ? <GripVertical className="plan-block-grip" size={12} aria-hidden="true" /> : null}
                        <small>{localTimeInput(block.start)}</small>
                        <strong>{block.title}</strong>
                        {overlapping ? <span className="plan-block-warning">Overlaps</span> : null}
                        {interactive && onResizeStart ? (
                          <button
                            type="button"
                            className="plan-block-resize"
                            aria-label={`Resize ${block.title}. Currently ${durationMinutes(block.start, block.end)} minutes. Use the up and down arrow keys.`}
                            onPointerDown={(event) => onResizeStart(event, block)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
