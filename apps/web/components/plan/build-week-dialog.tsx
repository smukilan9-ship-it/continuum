"use client";

/**
 * Build my week (redesign.md §14.2).
 *
 * The dialog it replaces asked **fourteen** questions across five fieldsets:
 * wake time, sleep time, weekday free window, weekend free window, a free-text
 * list of fixed commitments, subjects to prioritise, deadlines, session length,
 * break length, maximum daily workload, and seven day checkboxes. Most of them
 * were already known from the stored intake, and the two textareas duplicated
 * goals and deadlines the product already had.
 *
 * Three questions remain — when you are free, how long a session should be, and
 * anything fixed. Everything else keeps its stored value.
 *
 * The fixed commitments are the substantive fix (feature #22). They were a
 * textarea whose contents were matched against
 * `/^(sun|mon|…)\s+(\d{2}:\d{2})-(\d{2}:\d{2})\s+(.+)$/` — a line that did not
 * match was silently dropped, and the scheduler then booked study time during
 * school with no indication anything had been lost. They are now structured
 * rows: day, start, end, label. The line format still goes over the wire
 * because `/api/schedule` parses it, but nobody has to type it.
 */
import { Plus, Trash2, WandSparkles } from "lucide-react";
import { useState } from "react";
import { Button, Field, IconButton, Input, LoadingButton, Modal, Select } from "@/components/ui";
import { WEEKDAYS, type FixedCommitmentRow } from "./plan-time";

const SESSION_LENGTHS = [30, 45, 60, 90] as const;
const TIME_RANGE = /^\d{2}:\d{2}-\d{2}:\d{2}$/;

export type BuildWeekAnswers = {
  weekdayFree: string;
  weekendFree: string;
  sessionLength: number;
  commitments: FixedCommitmentRow[];
};

function newRow(index: number): FixedCommitmentRow {
  return { id: `commitment_new_${index}_${Math.random().toString(36).slice(2, 8)}`, day: 1, start: "08:00", end: "15:00", label: "" };
}

export function BuildWeekDialog({
  open,
  onOpenChange,
  initial,
  busy,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: BuildWeekAnswers;
  busy: boolean;
  onGenerate: (answers: BuildWeekAnswers) => void;
}) {
  const [weekdayFree, setWeekdayFree] = useState(initial.weekdayFree);
  const [weekendFree, setWeekendFree] = useState(initial.weekendFree);
  const [sessionLength, setSessionLength] = useState(initial.sessionLength);
  const [commitments, setCommitments] = useState<FixedCommitmentRow[]>(initial.commitments);

  const weekdayInvalid = !TIME_RANGE.test(weekdayFree);
  const weekendInvalid = !TIME_RANGE.test(weekendFree);
  const dirty = weekdayFree !== initial.weekdayFree || weekendFree !== initial.weekendFree || sessionLength !== initial.sessionLength || commitments !== initial.commitments;

  function patch(id: string, changes: Partial<FixedCommitmentRow>) {
    setCommitments((rows) => rows.map((row) => row.id === id ? { ...row, ...changes } : row));
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Build my week"
      description="Three questions. Everything else uses what Continuum already knows."
      dirty={dirty}
      dirtyMessage="Discard these availability answers?"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton
            variant="primary"
            loading={busy}
            loadingLabel="Drafting your week…"
            disabled={weekdayInvalid || weekendInvalid}
            onClick={() => onGenerate({ weekdayFree, weekendFree, sessionLength, commitments })}
          >
            <WandSparkles size={15} aria-hidden="true" />Generate
          </LoadingButton>
        </>
      }
    >
      <div className="plan-build-form">
        <fieldset>
          <legend>When are you usually free?</legend>
          <div className="plan-build-pair">
            <Field label="Weekdays" hint="Start and end, as 17:00-20:30" error={weekdayInvalid ? "Use the format 17:00-20:30" : undefined}>
              {({ id, describedBy, invalid }) => (
                <Input id={id} aria-describedby={describedBy} invalid={invalid} value={weekdayFree} onChange={(event) => setWeekdayFree(event.target.value)} placeholder="17:00-20:30" />
              )}
            </Field>
            <Field label="Weekends" hint="Start and end, as 10:00-16:00" error={weekendInvalid ? "Use the format 10:00-16:00" : undefined}>
              {({ id, describedBy, invalid }) => (
                <Input id={id} aria-describedby={describedBy} invalid={invalid} value={weekendFree} onChange={(event) => setWeekendFree(event.target.value)} placeholder="10:00-16:00" />
              )}
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>How long should a session be?</legend>
          <div className="plan-build-chips">
            {SESSION_LENGTHS.map((value) => (
              <button
                key={value}
                type="button"
                className={sessionLength === value ? "plan-chip plan-chip-on" : "plan-chip"}
                aria-pressed={sessionLength === value}
                onClick={() => setSessionLength(value)}
              >
                {value} min
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Anything fixed?</legend>
          <p className="plan-build-hint">School, work, or anything else Continuum must schedule around.</p>
          {commitments.length ? (
            <ul className="plan-commitment-rows">
              {commitments.map((row) => (
                <li key={row.id}>
                  <Field label="Day">
                    {({ id }) => (
                      <Select id={id} value={row.day} onChange={(event) => patch(row.id, { day: Number(event.target.value) })}>
                        {WEEKDAYS.map((label, index) => <option key={label} value={index}>{label}</option>)}
                      </Select>
                    )}
                  </Field>
                  <Field label="Start">
                    {({ id }) => <Input id={id} type="time" value={row.start} onChange={(event) => patch(row.id, { start: event.target.value })} />}
                  </Field>
                  <Field label="End">
                    {({ id }) => <Input id={id} type="time" value={row.end} onChange={(event) => patch(row.id, { end: event.target.value })} />}
                  </Field>
                  <Field label="What is it?">
                    {({ id }) => <Input id={id} value={row.label} maxLength={120} placeholder="School" onChange={(event) => patch(row.id, { label: event.target.value })} />}
                  </Field>
                  <IconButton label={`Remove ${row.label || "this commitment"}`} variant="danger" onClick={() => setCommitments((rows) => rows.filter((entry) => entry.id !== row.id))}>
                    <Trash2 size={14} />
                  </IconButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className="plan-build-hint">Nothing fixed yet.</p>
          )}
          <Button variant="secondary" size="sm" onClick={() => setCommitments((rows) => [...rows, newRow(rows.length)])}>
            <Plus size={14} aria-hidden="true" />Add
          </Button>
        </fieldset>
      </div>
    </Modal>
  );
}
