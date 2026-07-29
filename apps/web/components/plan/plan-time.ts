/**
 * Time and grid maths for the plan (redesign.md §14.2).
 *
 * Pure functions, no React: the week grid and the mobile agenda have to agree
 * about which day a block belongs to and how long it is, and the previous
 * screen re-derived that in four places with three different rounding rules.
 */
import type { ScheduleBlock } from "@continuum/schemas";

/** The grid runs 06:00-24:00 (§14.2). Everything below is minutes from midnight. */
export const DAY_START_MINUTE = 6 * 60;
export const DAY_END_MINUTE = 24 * 60;
export const GRID_MINUTES = DAY_END_MINUTE - DAY_START_MINUTE;
export const SNAP_MINUTES = 15;

export type Commitment = { id: string; title: string; start: string; end: string };

export function isoValue(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return value instanceof Date ? value.toISOString() : typeof value === "string" ? value : "";
}

export function dayKey(value: string | Date, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The seven days the grid renders, `weekOffset` weeks from the current one. */
export function dateRange(instant: string, timeZone: string, weekOffset = 0) {
  const [year, month, day] = dayKey(instant, timeZone).split("-").map(Number);
  const start = Date.UTC(year!, month! - 1, day!, 12) + weekOffset * 7 * 24 * 3600_000;
  return Array.from({ length: 7 }, (_, index) => new Date(start + index * 24 * 3600_000));
}

export function weekRangeLabel(days: Date[], timeZone: string) {
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const sameMonth = first.toLocaleDateString("en-GB", { month: "short", timeZone }) === last.toLocaleDateString("en-GB", { month: "short", timeZone });
  const from = first.toLocaleDateString("en-GB", sameMonth ? { day: "numeric", timeZone } : { day: "numeric", month: "short", timeZone });
  const to = last.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone });
  return `${from} – ${to}`;
}

export function localDateInput(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function localTimeInput(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function atLocalDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

export function minutesFromMidnight(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 0 : date.getHours() * 60 + date.getMinutes();
}

export function durationMinutes(start: string, end: string) {
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60_000));
}

/**
 * Where a block sits in the 06:00-24:00 column, as percentages so the grid can
 * be any height. Blocks that start before 06:00 or run past midnight are
 * clamped rather than dropped — an out-of-range block that vanishes is worse
 * than one shown at the edge.
 */
export function blockPosition(start: string, end: string) {
  const startMinute = Math.min(Math.max(minutesFromMidnight(start), DAY_START_MINUTE), DAY_END_MINUTE);
  const rawEnd = minutesFromMidnight(end) || DAY_END_MINUTE;
  const endMinute = Math.min(Math.max(rawEnd <= startMinute ? DAY_END_MINUTE : rawEnd, DAY_START_MINUTE), DAY_END_MINUTE);
  return {
    top: ((startMinute - DAY_START_MINUTE) / GRID_MINUTES) * 100,
    height: Math.max(2.2, ((endMinute - startMinute) / GRID_MINUTES) * 100),
  };
}

export const HOURS = Array.from({ length: (DAY_END_MINUTE - DAY_START_MINUTE) / 60 + 1 }, (_, index) => DAY_START_MINUTE / 60 + index);

export function hourLabel(hour: number) {
  return `${String(hour % 24).padStart(2, "0")}:00`;
}

/**
 * Blocks that collide with each other or with a fixed commitment. Returned as
 * a set of ids so the grid can outline exactly those and the header can count
 * them, which is what stops a draft being saved on top of school (§14.2).
 */
export function overlappingBlockIds(blocks: ScheduleBlock[], commitments: Commitment[]) {
  const ids = new Set<string>();
  for (let left = 0; left < blocks.length; left += 1) {
    const a = blocks[left]!;
    for (let right = left + 1; right < blocks.length; right += 1) {
      const b = blocks[right]!;
      if (Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end)) {
        ids.add(a.id);
        ids.add(b.id);
      }
    }
    if (commitments.some((commitment) => Date.parse(a.start) < Date.parse(commitment.end) && Date.parse(commitment.start) < Date.parse(a.end))) {
      ids.add(a.id);
    }
  }
  return ids;
}

/** Stable goal colour, 1-6, matching the `--goal-N` tokens. */
export function goalColorIndex(goalId: string) {
  let hash = 0;
  for (let index = 0; index < goalId.length; index += 1) hash = (hash * 31 + goalId.charCodeAt(index)) % 997;
  return (hash % 6) + 1;
}

export function shiftBlock(block: ScheduleBlock, deltaMinutes: number, deltaDays: number): ScheduleBlock {
  const offset = deltaMinutes * 60_000 + deltaDays * 24 * 3600_000;
  return { ...block, start: new Date(Date.parse(block.start) + offset).toISOString(), end: new Date(Date.parse(block.end) + offset).toISOString() };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type FixedCommitmentRow = { id: string; day: number; start: string; end: string; label: string };

/**
 * Serialises the dialog's structured rows into the one line-per-commitment
 * format `/api/schedule` already parses ("Mon 08:00-15:00 School").
 *
 * The dialog no longer asks the learner to type that format — it was a free
 * textarea run through a regex, so a typo silently dropped a commitment and the
 * scheduler booked study time during school (feature #22). The structure is now
 * the input; this is only the wire format.
 */
export function serializeCommitments(rows: FixedCommitmentRow[]) {
  return rows
    .filter((row) => row.label.trim() && /^\d{2}:\d{2}$/.test(row.start) && /^\d{2}:\d{2}$/.test(row.end) && row.start < row.end)
    .map((row) => `${WEEKDAYS[row.day] ?? "Mon"} ${row.start}-${row.end} ${row.label.trim()}`)
    .join("\n");
}

/** Reads the stored format back into rows so the dialog can be prefilled. */
export function parseCommitments(value: string): FixedCommitmentRow[] {
  const index: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return value.split("\n").flatMap((line, position) => {
    const match = line.trim().match(/^(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s+(\d{2}:\d{2})-(\d{2}:\d{2})\s+(.+)$/i);
    if (!match) return [];
    return [{ id: `commitment_${position}`, day: index[match[1]!.toLowerCase()] ?? 1, start: match[2]!, end: match[3]!, label: match[4]! }];
  });
}

/** Resolves the dialog rows onto the actual dates of the week being shown. */
export function commitmentsForWeek(rows: FixedCommitmentRow[], week: Date[]): Commitment[] {
  return rows.flatMap((row) => {
    const date = week.find((day) => day.getDay() === row.day);
    if (!date || !row.label.trim()) return [];
    const local = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const start = atLocalDateTime(local, row.start);
    const end = atLocalDateTime(local, row.end);
    return Date.parse(start) < Date.parse(end) ? [{ id: row.id, title: row.label.trim(), start, end }] : [];
  });
}

export { WEEKDAYS };
