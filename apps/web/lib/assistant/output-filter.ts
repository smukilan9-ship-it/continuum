/**
 * The user-facing gate on model output.
 *
 * Three failures are suppressed here, in order of how badly they break trust:
 *
 * 1. Tagged reasoning — some open-weights routes wrap chain-of-thought in
 *    <think>…</think> and stream it as ordinary text.
 * 2. Narrated reasoning — a model that ignores the prompt's format contract and
 *    opens with "Thinking Process:", "Analysis:", or a numbered plan. Observed
 *    in production: a reply began "Thinking Process: / Analyze the Request: /
 *    Persona/Constraints: Continuum … No meta-commentary, no planning steps."
 *    and never reached an answer. Tag-only filtering could not see it because
 *    there was no tag.
 * 3. Internal identifiers — `goal_demo_sat`, `mchunk_demo_progress_sat`. These
 *    reach the model through retrieved context; the same production reply
 *    printed them verbatim.
 *
 * The guard buffers a short prefix before the first flush. It is released as
 * soon as the text is judged clean, so a well-behaved model pays only the cost
 * of assembling ~200 characters.
 */

/**
 * Openers that mean the model is narrating its process rather than answering.
 *
 * The trailing assertion is `(?![a-z])` rather than `\b`: several alternatives
 * end in a colon, and `\b` does not hold between ":" and a newline, so "Plan:\n"
 * slipped through a word-boundary anchor.
 */
const BANNED_OPENER =
  /^\s*(?:\*{0,2}|#{1,6}\s*)(?:thinking process|thought process|thinking|reasoning|analysis|analyzing|analyze the request|let me (?:think|analyze|start|break)|first,?\s+i(?:'|’)?(?:ll| will| need)|step 1|plan:|approach:|persona|constraints|context:|synthesize|synthesizing|draft:|drafting|my task|the user (?:is asking|wants|asks))(?![a-z])/i;

/**
 * A line that reintroduces narration mid-answer. Anchored to a line start and
 * required to look like a heading (ends in a colon, or is bold/hash-marked), so
 * ordinary prose containing the word "analysis" is left alone.
 */
const BANNED_HEADING_LINE =
  /^\s*(?:\*{0,2}|#{1,6}\s*)(?:thinking process|thought process|analysis|analyzing|approach|persona|constraints|synthesize|synthesizing|step \d+|my (?:plan|task|approach)|the user(?:'|’)?s? (?:request|question|goal))\s*:?\s*\*{0,2}\s*$/i;

/**
 * Opaque record identifiers. These are generated as `prefix_hex` throughout the
 * store (`opaqueId()`), and the seed uses the same shape (`goal_demo_sat`).
 *
 * The list is every prefix the store mints, not the ones anyone remembered.
 * `learning_` was missing, and a live answer printed
 * "`learning_demo_sql_param` is in_progress (0.6 exposure, 0.55 understanding)"
 * straight at the user — a prefix-by-prefix allowlist fails silently for every
 * prefix nobody thought of, which is the whole failure mode this guards.
 */
const INTERNAL_ID =
  /\b(?:goal|task|project|activity|receipt|block|concept|event|record|mchunk|memory|source|chunk|proposal|session|claim|decision|note|paper|milestone|attempt|asession|amsg|user|rec|learning|curriculum|cnode|assessment|misc|resource|route|cal|oauth)_[a-z0-9][a-z0-9_]{2,}\b/gi;

/**
 * Structural narration detection.
 *
 * BANNED_OPENER is a blocklist, and a blocklist only catches the openers
 * somebody thought of. A live answer in production opened "Analyze the
 * Workspace Data (Goals & Progress & Uncertainties):" and then dumped a
 * labelled list — a shape no wordlist would have had.
 *
 * These two look at the shape instead:
 *
 * - `looksLikeScaffold` — three or more `Label: value` lines in the opening,
 *   with little prose between them. That is a worksheet, not an answer.
 * - `quotesInstructions` — the reply contains a long verbatim run from the
 *   prompt we sent it. A model echoing its own constraints back at the user is
 *   the single most damaging thing this filter exists to stop, and it is exact
 *   rather than heuristic, so it can be caught with certainty.
 */
const SCAFFOLD_LINE = /^\s*(?:\*{0,2}|#{1,6}\s*)[A-Z][A-Za-z0-9 ()&/'-]{2,48}:\s*\S/;

export function looksLikeScaffold(text: string): boolean {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 8);
  if (lines.length < 3) return false;
  const labelled = lines.filter((line) => SCAFFOLD_LINE.test(line)).length;
  // A sentence ending in a full stop is prose; a label line is not.
  const prose = lines.filter((line) => /[.!?]["')\]]?$/.test(line) && line.length > 60).length;
  return labelled >= 3 && labelled > prose;
}

/** Longest verbatim run, in words, shared between the reply and the prompt. */
export function quotesInstructions(text: string, instructions: string | undefined, minWords = 8): boolean {
  if (!instructions) return false;
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const haystack = normalise(instructions);
  const words = normalise(text).split(" ").filter(Boolean);
  if (words.length < minWords) return false;
  for (let index = 0; index + minWords <= words.length; index += 1) {
    if (haystack.includes(words.slice(index, index + minWords).join(" "))) return true;
  }
  return false;
}

const OPEN_TAG = /^\s*<(think|thinking|reasoning|scratchpad)>/i;
const CLOSE_TAG = /<\/(think|thinking|reasoning|scratchpad)>/i;

/** Enough to see an opener and the line that follows it. */
const GUARD_CHARS = 200;

/** What the user sees when a response was reasoning end to end. */
export const EMPTY_AFTER_FILTER = "";

export interface OutputFilterOptions {
  /**
   * The prompt this reply is answering. Any long verbatim run from it appearing
   * in the reply means the model is reciting its instructions at the user.
   */
  instructions?: string;
  /**
   * Maps an internal id to a human label, so a leaked `goal_demo_sat` becomes
   * "Raise SAT score from 1520 to 1570+" rather than vanishing mid-sentence.
   * Ids with no entry are removed along with any now-dangling punctuation.
   */
  labels?: Map<string, string>;
}

/** Swaps an identifier for its label, or removes it. No prose cleanup. */
function swapIdentifiers(text: string, labels?: Map<string, string>): string {
  return text.replace(INTERNAL_ID, (match) => labels?.get(match) ?? labels?.get(match.toLowerCase()) ?? "");
}

/**
 * Replaces internal identifiers in **prose**, then tidies the punctuation an
 * removed id leaves behind.
 *
 * Only safe on text the user will read. It must never run over serialized JSON:
 * the empty-bracket cleanup turns `"uncertainFields":[]` into
 * `"uncertainFields":`, which is not parseable. Use `redactContextValue` for
 * structured data.
 */
/**
 * Context field names, rewritten into what a person would call the thing.
 *
 * Observed in a production answer: "…focus on addressing the active
 * misconception …, as noted in the relevantMemories." The prompt already forbids
 * naming the labelled sections, but the payload inside them is JSON, and the
 * model cited one of our own keys as though it were a source. The prompt asks;
 * this enforces. Same reasoning as INTERNAL_ONLY_KEYS below — the difference is
 * that those keys are stripped before the model reads them, and these are keys
 * it legitimately reads but must never repeat.
 */
/** Each pattern absorbs a preceding article, so "the relevantMemories" does not
 *  become "the your saved notes". */
const CONTEXT_KEY_WORDS: ReadonlyArray<[RegExp, string]> = [
  [/\b(?:the\s+)?relevant_?[Mm]emories\b/g, "your saved notes"],
  [/\b(?:the\s+)?sourcePassages\b/g, "the passages in your library"],
  [/\b(?:the\s+)?workspaceRecords\b/g, "your workspace"],
  [/\b(?:the\s+)?pageContext\b/g, "the screen you are on"],
  [/\b(?:the\s+)?contextPolicy\b/g, "your context"],
  [/\b(?:the\s+)?pedagogical_?[Cc]ontext\b/g, "your profile"],
  [/\b(?:the\s+)?taskClass\b/g, "this request"],
];

export function redactIdentifiers(text: string, labels?: Map<string, string>): string {
  if (!text) return text;
  let swapped = swapIdentifiers(text, labels);
  for (const [pattern, human] of CONTEXT_KEY_WORDS) swapped = swapped.replace(pattern, human);
  return swapped
    // An id sitting in parentheses or after a colon leaves debris behind.
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/:\s*$/gm, ":");
}

/**
 * Recursively redacts identifiers inside a context object, preserving its
 * shape. Keys are left alone — they are field names the model needs — and only
 * string values are rewritten, so the structure stays valid.
 */
/**
 * Keys whose *values* are internal field names rather than anything a person
 * wrote. `uncertainFields` holds the columns the plan generator was unsure
 * about — "mockScoreVariance", "hdabCalibration", "candidateClassRecall" — and
 * a live answer relayed them to a Class 12 student as "Uncertain:
 * mockScoreVariance". §14.4 bans that vocabulary on every surface, and the
 * cheapest place to enforce it is before the model can read it.
 */
const INTERNAL_ONLY_KEYS = new Set(["uncertainFields", "uncertain_fields", "promptVersion", "prompt_version", "contentHash", "content_hash", "embeddingModel", "embedding_model"]);

export function redactContextValue<T>(value: T, labels?: Map<string, string>): T {
  if (typeof value === "string") return swapIdentifiers(value, labels) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => redactContextValue(item, labels)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (INTERNAL_ONLY_KEYS.has(key)) continue;
      out[key] = redactContextValue(item, labels);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Drops narration blocks that appear after the opening guard has released.
 * A banned heading consumes itself and the block beneath it, up to the next
 * blank line, so "Analysis:\n- point\n- point\n\nReal answer" keeps only the
 * real answer.
 */
function stripNarrationBlocks(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (BANNED_HEADING_LINE.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (line.trim() === "") skipping = false;
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

/**
 * The `Label: value` shape a model uses when it is filling in a scratchpad
 * ("User asks: …", "Goal: …", "Persona/Constraints: …", "Gap 1: …"). The label
 * is short, has no sentence punctuation, and is followed by content.
 */
const SCRATCHPAD_LINE = /^\s*(?:[-*]\s*)?\*{0,2}[A-Za-z][^.!?:\n]{0,44}:(?:\s|$)/;

/**
 * A paragraph is narration if it announces itself as such, or — once narration
 * has already been confirmed at the top of the response — if it continues the
 * scratchpad shape. The continuation rule is deliberately gated on
 * `afterNarration`: applied unconditionally it would swallow ordinary answers
 * that happen to open with a short clause and a colon.
 */
function isNarrationParagraph(paragraph: string, afterNarration: boolean): boolean {
  if (BANNED_OPENER.test(paragraph)) return true;
  if (BANNED_HEADING_LINE.test(paragraph.split("\n")[0] ?? "")) return true;
  // A short colon-terminated label followed by a list is a plan, not an answer.
  if (/^\s*[^\n]{0,60}:\s*$/.test(paragraph)) return true;
  const first = paragraph.split("\n")[0] ?? "";
  // What separates a scratchpad label from a sentence is the length of the text
  // before the colon, not what follows it. "User asks:", "Goal:", "Constraint:"
  // are labels; "Your biggest risk is the SQL goal:" is a clause. The pattern
  // allowed 45 characters, so it also matched the clause — and once narration
  // had been seen at the top of a reply, the real answer underneath it was
  // deleted and the user was told nothing could be produced.
  const label = first.trim().match(/^(?:[-*]\s*)?\*{0,2}([A-Za-z][^.!?:\n]{0,44}):/);
  const isLabel = Boolean(label) && label![1]!.trim().length <= 24;
  return afterNarration && isLabel && SCRATCHPAD_LINE.test(first);
}

/**
 * Finds where the real answer starts in a buffer that opens with narration.
 * Returns -1 when more input is needed.
 *
 * While streaming, the trailing paragraph is still arriving: judging it would
 * misread a half-received "Analyze the Re…" as an answer and release the
 * narration behind it. Only paragraphs known to be complete are considered
 * until `isFinal`.
 */
function findAnswerStart(buffer: string, isFinal: boolean, instructions?: string): number {
  const paragraphs = buffer.split(/\n\s*\n/);
  const judgeable = isFinal ? paragraphs.length : paragraphs.length - 1;
  let consumed = 0;
  for (let index = 0; index < judgeable; index += 1) {
    const paragraph = paragraphs[index]!;
    // The first paragraph is what proves narration; later ones inherit that
    // context and are held to the wider scratchpad rule.
    const narration = isNarrationParagraph(paragraph, index > 0)
      || looksLikeScaffold(paragraph)
      || quotesInstructions(paragraph, instructions);
    if (!narration) return consumed;
    consumed += paragraph.length + 2;
  }
  return -1;
}

/**
 * Splits text at the last point safe to emit, returning [emit, retain].
 *
 * Redaction is a whole-token operation, so a chunk boundary that lands inside
 * `mchunk_demo_progress_sat` must not be handed to the redactor — each half
 * fails the pattern and the identifier survives in pieces. Holding back the
 * trailing partial token until the next chunk (or flush) keeps every identifier
 * intact when it reaches the regex.
 */
function splitAtSafeBoundary(text: string): [emit: string, retain: string] {
  const match = text.match(/[A-Za-z0-9_-]+$/);
  if (!match) return [text, ""];
  const index = match.index ?? text.length;
  return [text.slice(0, index), text.slice(index)];
}

export function createOutputFilter(options: OutputFilterOptions = {}) {
  const labels = options.labels;
  const instructions = options.instructions;

  let buffer = "";
  let inTag = false;
  let released = false;
  let sawNarration = false;
  let emittedAnything = false;

  function emit(text: string): string {
    if (!text) return "";
    const clean = redactIdentifiers(released ? stripNarrationBlocks(text) : text, labels);
    if (clean.trim()) emittedAnything = true;
    return clean;
  }

  /** Drains a buffer known to be inside a reasoning tag. */
  function drainTag(): string {
    const close = buffer.match(CLOSE_TAG);
    if (!close) return "";
    inTag = false;
    const rest = buffer.slice(close.index! + close[0].length);
    buffer = rest.replace(/^\s+/, "");
    return "";
  }

  return {
    push(part: string): string {
      if (inTag) {
        buffer += part;
        drainTag();
        if (inTag || !buffer) return "";
        // Fall through so the freed text still passes the prose guard.
      } else {
        buffer += part;
      }

      if (released) {
        const [out, retain] = splitAtSafeBoundary(buffer);
        buffer = retain;
        return emit(out);
      }

      if (OPEN_TAG.test(buffer)) {
        inTag = true;
        sawNarration = true;
        drainTag();
        if (inTag) return "";
      }

      // A partial "<th…" might still become an opening tag.
      if (buffer.length < GUARD_CHARS && /^\s*<[a-z]*$/i.test(buffer)) return "";

      if (BANNED_OPENER.test(buffer) || looksLikeScaffold(buffer) || quotesInstructions(buffer, instructions)) {
        sawNarration = true;
        const start = findAnswerStart(buffer, false, instructions);
        if (start < 0) {
          // Still narrating. Keep buffering, but do not grow without bound.
          if (buffer.length > GUARD_CHARS * 40) buffer = buffer.slice(-GUARD_CHARS * 10);
          return "";
        }
        released = true;
        const [out, retain] = splitAtSafeBoundary(buffer.slice(start));
        buffer = retain;
        return emit(out);
      }

      // Not enough yet to rule an opener in or out.
      if (buffer.length < GUARD_CHARS && !/\n\s*\n/.test(buffer)) return "";

      released = true;
      const [out, retain] = splitAtSafeBoundary(buffer);
      buffer = retain;
      return emit(out);
    },

    flush(): string {
      const remaining = inTag ? "" : buffer;
      buffer = "";
      inTag = false;
      if (!remaining) {
        released = true;
        return "";
      }
      // Anything still held at the end was never confirmed as an answer. Emit it
      // only if it does not open with narration — otherwise the whole response
      // was reasoning and the caller decides what to do.
      if (!released && (BANNED_OPENER.test(remaining) || looksLikeScaffold(remaining) || quotesInstructions(remaining, instructions))) {
        const start = findAnswerStart(remaining, true, instructions);
        released = true;
        return start < 0 ? EMPTY_AFTER_FILTER : emit(remaining.slice(start));
      }
      released = true;
      return emit(remaining);
    },

    /** True when narration was detected and suppressed. */
    get suppressedNarration() {
      return sawNarration;
    },

    /** False when filtering left the user with nothing — the caller must retry. */
    get producedOutput() {
      return emittedAnything;
    },
  };
}

/**
 * A greeting does not need the workspace pack or a memory search. Retrieving for
 * "hi" cost a context-pack read, a vector search, and thousands of prompt
 * tokens — which is what made a one-word message take about a minute and come
 * back padded with unrelated project context.
 */
export function isConversationalFiller(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length > 40 || trimmed.includes("?")) return false;
  if (!/^[\p{L}\p{N}\s'’!.,-]+$/u.test(trimmed)) return false;

  // The whole message must be filler, not merely start with it. Anchoring only
  // at the start classified "hi, can you explain electric potential" as a
  // greeting and skipped retrieval for a real question.
  const FILLER_WORD =
    /(?:hi|hey|hello|yo|sup|hiya|howdy|good (?:morning|afternoon|evening)|morning|afternoon|evening|thanks?|thank you|ty|cheers|ok|okay|kk|got it|understood|cool|nice|great|awesome|perfect|sure|yes|yep|yeah|no|nope|bye|goodbye|see ya|later|test|ping|there|again|everyone|all|mate|friend)/;
  return new RegExp(`^(?:${FILLER_WORD.source})(?:[\\s,.!-]+(?:${FILLER_WORD.source}))*[\\s,.!-]*$`, "i").test(trimmed);
}
