import data from "./labels.json";

/**
 * The 17 feature labels (PLAN §3.4).
 *
 * These are the film's mute pass: a judge watching with sound off must be able
 * to name what they are looking at, and these chips are what tell them.
 *
 * The table lives in `labels.json` rather than here because the build scripts
 * (`render-all.mjs`, `build-cutlist.mjs`) are plain Node and need the same
 * numbers. One source of truth, read by both sides.
 *
 * `recIn` is the label's start frame on the 3600-frame film timeline;
 * `durationInFrames` must match the master timeline exactly — `render-all.mjs`
 * asserts it and fails the build on drift.
 */
export type LabelSpec = {
  id: string;
  title: string;
  sub: string;
  recIn: number;
  durationInFrames: number;
};

export const labels: LabelSpec[] = data;

export const labelsById = new Map(labels.map((label) => [label.id, label]));

export function getLabel(id: string): LabelSpec {
  const label = labelsById.get(id);
  if (!label) {
    throw new Error(
      `Unknown labelId "${id}". Known ids: ${labels.map((l) => l.id).join(", ")}`,
    );
  }
  return label;
}
