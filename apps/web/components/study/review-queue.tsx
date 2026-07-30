"use client";

import { CalendarClock, Check, Flame } from "lucide-react";

import { dueQueue, formatInterval } from "@continuum/domain";
import { Button } from "@/components/ui";
import { conceptLabel } from "@/lib/labels";

type Row = Record<string, unknown>;

const text = (row: Row | undefined, key: string, fallback = "") =>
  typeof row?.[key] === "string" ? (row[key] as string) : fallback;
const num = (row: Row | undefined, key: string) =>
  typeof row?.[key] === "number" ? (row[key] as number) : undefined;

/**
 * What is due today.
 *
 * This is the difference between measuring learning and scheduling it. The four
 * mastery dimensions told a learner where they stood and nothing about what to
 * do this evening; the queue answers that in one line, ordered so the concept
 * that keeps slipping comes first rather than the one that happens to be oldest.
 *
 * The count is deliberately not a target. There is no "0 of 8 done" bar,
 * because a queue that shames you for a short evening is a queue you stop
 * opening — and a review skipped is only a review moved, which is the whole
 * point of the schedule.
 */
export function ReviewQueue({
  states,
  streakDays,
  onReview,
}: {
  states: Row[];
  streakDays: number;
  onReview: (conceptId: string) => void;
}) {
  const due = dueQueue(
    states.map((state) => ({
      row: state,
      dueAt: text(state, "dueAt") || (state.dueAt instanceof Date ? state.dueAt.toISOString() : undefined),
      lapses: num(state, "lapses") ?? 0,
      transfer: num(state, "transfer") ?? 0,
    })),
  );

  const next = states
    .map((state) => ({ state, at: text(state, "dueAt") || (state.dueAt instanceof Date ? state.dueAt.toISOString() : "") }))
    .filter((entry) => entry.at && new Date(entry.at).getTime() > Date.now())
    .sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime())[0];

  if (!due.length) {
    return (
      <div className="review-queue review-queue-clear">
        <span className="review-queue-clear-mark" aria-hidden="true"><Check size={18} /></span>
        <div>
          <strong>Nothing due right now</strong>
          <p>
            {next
              ? `Your next review is ${relative(next.at)} — ${conceptLabel(text(next.state, "conceptId"))}.`
              : "Answer a check on any concept and Continuum will schedule the next one."}
          </p>
        </div>
        {streakDays > 0 ? <Streak days={streakDays} /> : null}
      </div>
    );
  }

  return (
    <div className="review-queue">
      <header className="review-queue-head">
        <span className="review-queue-mark" aria-hidden="true"><CalendarClock size={17} /></span>
        <div>
          <strong>{due.length} {due.length === 1 ? "concept is" : "concepts are"} due</strong>
          <p>Ordered by what keeps slipping, not by what is oldest.</p>
        </div>
        {streakDays > 0 ? <Streak days={streakDays} /> : null}
      </header>

      <ul className="review-queue-list">
        {due.slice(0, 6).map((entry) => {
          const state = entry.row;
          const id = text(state, "conceptId");
          const label = text(state, "conceptLabel") || conceptLabel(id);
          const lapses = entry.lapses;
          const interval = num(state, "intervalDays") ?? 0;
          return (
            <li key={id}>
              <div className="review-queue-copy">
                <strong>{label}</strong>
                <small>
                  {lapses > 0
                    ? `Forgotten ${lapses} time${lapses === 1 ? "" : "s"} — it comes back sooner each time`
                    : interval >= 1
                      ? `Last scheduled ${formatInterval(interval)} out`
                      : "First review"}
                </small>
              </div>
              <Button variant={lapses > 0 ? "amber" : "secondary"} size="sm" onClick={() => onReview(id)}>Review</Button>
            </li>
          );
        })}
      </ul>
      {due.length > 6 ? <p className="review-queue-more">{due.length - 6} more waiting. They will keep.</p> : null}
    </div>
  );
}

function Streak({ days }: { days: number }) {
  return (
    <span className="streak" title={`${days} days with a verified check`}>
      <Flame className="streak-flame" size={15} aria-hidden="true" />
      {days} day{days === 1 ? "" : "s"}
    </span>
  );
}

function relative(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${formatInterval(days)}`;
}
