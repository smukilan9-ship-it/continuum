/**
 * Internal record identifiers must never reach user-facing copy (§9.4 AC-H3,
 * §11.5). Two layers enforce this: the assistant's output filter redacts ids
 * before they are streamed, and this scrubber catches anything already stored
 * in a `description` or `completionEvidence` written before that guarantee
 * existed. The live product showed "…after verified resource activity
 * activity_d61e36a01a9e4275aa1c3368" to a user; that is the shape this stops.
 */
/**
 * The character class matters. §9.4 AC-H3 and §11.5 both specify
 * `_[a-z0-9]{6,}`, which does not match the ids this product actually mints —
 * `goal_demo_sat` and `mchunk_demo_progress_sat` contain underscores, so the
 * segment after the prefix is never 6 unbroken alphanumerics. The assistant's
 * output filter already corrected this; the same class is used here so the two
 * layers cannot disagree about what an identifier looks like.
 */
export const INTERNAL_ID = /\b(?:activity|task|goal|receipt|block|concept|project|record|event|mchunk|memory|source|chunk|proposal|session|claim|decision|note|paper|milestone|attempt)_[a-z0-9][a-z0-9_]{2,}\b/gi;

/** Strip identifiers and repair the punctuation their removal leaves behind. */
export function plainCopy(value: string) {
  return value
    .replace(INTERNAL_ID, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .trim();
}

/** True when a string still carries an identifier. Used by the regression test. */
export function containsInternalId(value: string) {
  INTERNAL_ID.lastIndex = 0;
  return INTERNAL_ID.test(value);
}
