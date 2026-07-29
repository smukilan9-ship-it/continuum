/**
 * Some open-weights routes wrap their reasoning in <think>…</think> and stream
 * it as ordinary text. The system prompt forbids narrated reasoning, but a
 * provider that ignores it must never put raw chain-of-thought in front of the
 * user, so the stream is gated until the opening tag is closed.
 *
 * Only a short prefix is buffered (enough to rule out an opening tag), so this
 * costs nothing measurable in time-to-first-token.
 */
export function createReasoningFilter() {
  const OPEN = /^\s*<(think|thinking|reasoning)>/i;
  const CLOSE = /<\/(think|thinking|reasoning)>/i;
  const PROBE_CHARS = 24;

  let buffer = "";
  let inThought = false;
  let decided = false;

  // Drains a buffer already known to be inside a thought block. Returns "" while
  // the block is still open.
  function drainThought(): string {
    const close = buffer.match(CLOSE);
    if (!close) return "";
    inThought = false;
    decided = true;
    const rest = buffer.slice(close.index! + close[0].length);
    buffer = "";
    return rest.replace(/^\s+/, "");
  }

  return {
    push(part: string): string {
      if (inThought) {
        buffer += part;
        return drainThought();
      }
      if (decided) return part;

      buffer += part;
      if (OPEN.test(buffer)) {
        inThought = true;
        // The close tag may already be in this same chunk.
        return drainThought();
      }
      // A partial "<th…" might still become an opening tag, so keep waiting.
      if (buffer.length < PROBE_CHARS && /^\s*<[a-z]*$/i.test(buffer)) return "";
      if (buffer.length < PROBE_CHARS && /^\s*$/.test(buffer)) return "";

      decided = true;
      const out = buffer;
      buffer = "";
      return out;
    },
    flush(): string {
      const out = inThought ? "" : buffer;
      buffer = "";
      inThought = false;
      decided = true;
      return out;
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
  return trimmed.length <= 40
    && !trimmed.includes("?")
    && /^[\p{L}\p{N}\s'’!.,-]+$/u.test(trimmed)
    && /^(hi|hey|hello|yo|sup|hiya|howdy|good (morning|afternoon|evening)|thanks?|thank you|ty|ok|okay|got it|cool|nice|great|bye|goodbye|see ya|test|ping)\b/i.test(trimmed);
}
