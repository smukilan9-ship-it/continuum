/**
 * Mastery presentation (redesign.md §14.1).
 *
 * Two rules live here and nowhere else, because both were previously re-derived
 * per component and disagreed with each other:
 *
 *   1. The three dimensions are **named**, never averaged into one number with
 *      the parts hidden in a tooltip (finding X8). "Weakest: transfer 28%" tells
 *      you what to do; "64% understanding" does not.
 *   2. A concept carrying an open misconception is never mastered. The composite
 *      is capped and the label is replaced — the signal panel used to read
 *      "100% understanding · Mastered" beside a card tagging the same concept
 *      "Misconception to fix" (learn-screen.tsx:112-134, preserved verbatim
 *      below and required by AC-LN3).
 */
import { masteryLabel } from "@/lib/labels";
import type { StatusTone } from "@/components/ui";
import { conceptLabel } from "@/lib/labels";
import { list, number, text, type Row } from "@/components/workspace/types";

export type Dimension = { key: "exposure" | "transfer" | "retention"; label: string; value: number; percent: number };

export type ConceptSignal = {
  conceptId: string;
  title: string;
  description: string;
  dimensions: Dimension[];
  weakest: Dimension;
  /** 0-100, capped while a misconception is open. */
  composite: number;
  status: string;
  openMisconception: boolean;
  misconceptionLabel?: string;
  label: string;
  tone: StatusTone;
  lastPracticedAt?: string;
  /** Higher means "study this sooner". Used to sort the concept list. */
  need: number;
};

/**
 * `retention` is shown as "recall" because that is what it measures to a
 * learner. The internal key is unchanged so the data keeps one name.
 */
export function dimensionsOf(row: Row): Dimension[] {
  return ([
    { key: "exposure", label: "exposure" },
    { key: "transfer", label: "transfer" },
    { key: "retention", label: "recall" },
  ] as const).map((entry) => {
    const value = number(row, entry.key, 0);
    return { key: entry.key, label: entry.label, value, percent: Math.round(value * 100) };
  });
}

export function weakestOf(dimensions: Dimension[]): Dimension {
  return [...dimensions].sort((left, right) => left.value - right.value)[0]!;
}

function misconceptionOf(row: Row, all: Row[]) {
  const conceptId = text(row, "conceptId");
  const open = all.some((item) => text(item, "conceptId") === conceptId && text(item, "misconceptionStatus") === "active")
    || list(row, "misconceptions").length > 0;
  if (!open) return { open: false as const, label: undefined };
  const label = text(row, "misconceptionLabel") || list(row, "misconceptions")[0] || "Misconception to fix";
  return { open: true as const, label };
}

export function conceptSignal(row: Row, all: Row[]): ConceptSignal {
  const conceptId = text(row, "conceptId");
  const misconception = misconceptionOf(row, all);
  const dimensions = dimensionsOf(row);
  const weakest = weakestOf(dimensions);
  const [exposure, transfer, retention] = dimensions.map((dimension) => dimension.percent) as [number, number, number];
  const raw = Math.round(number(row, "understanding", (exposure + transfer + retention) / 300) * 100);
  const composite = misconception.open ? Math.min(raw, 70) : raw;
  const status = text(row, "status", "not_started");
  return {
    conceptId,
    title: text(row, "conceptLabel") || conceptLabel(conceptId),
    description: text(row, "explanation", "No verified evidence has been recorded for this concept yet."),
    dimensions,
    weakest,
    composite,
    status,
    openMisconception: misconception.open,
    misconceptionLabel: misconception.label,
    // An open misconception outranks the aggregate score in what it tells you
    // to do, so it replaces the label outright rather than sitting beside it.
    label: misconception.open ? misconception.label! : masteryLabel(status),
    tone: misconception.open ? "warning" : status === "mastered" ? "success" : "neutral",
    lastPracticedAt: text(row, "lastPracticedAt") || undefined,
    need: needScore(misconception.open, status, weakest.value, text(row, "lastPracticedAt")),
  };
}

const DAY = 86_400_000;

/**
 * Sort key for "what needs work". An open misconception dominates, then the
 * weakest dimension, then how long ago the concept was last practised — decay
 * is real but it should never outrank a known wrong model.
 */
function needScore(openMisconception: boolean, status: string, weakest: number, lastPracticedAt: string) {
  const staleDays = lastPracticedAt ? Math.max(0, (Date.now() - Date.parse(lastPracticedAt)) / DAY) : 30;
  return (openMisconception ? 1_000 : 0)
    + (status === "mastered" ? 0 : 100)
    + (1 - weakest) * 50
    + Math.min(30, staleDays);
}

/** Every tracked concept, most in need of work first. */
export function rankConcepts(learningStates: Row[]): ConceptSignal[] {
  return learningStates
    .map((row) => conceptSignal(row, learningStates))
    .sort((left, right) => right.need - left.need);
}

export function lastPractisedLabel(value: string | undefined) {
  if (!value) return "Never practised";
  const days = Math.floor((Date.now() - Date.parse(value)) / DAY);
  if (!Number.isFinite(days)) return "Never practised";
  if (days <= 0) return "Practised today";
  if (days === 1) return "Practised yesterday";
  if (days < 30) return `Practised ${days} days ago`;
  return `Practised ${Math.floor(days / 30)} month${days < 60 ? "" : "s"} ago`;
}
