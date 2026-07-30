/**
 * Derives a conversation title that distinguishes one thread from another.
 *
 * Titling from the user's raw first message produced a list where every entry
 * read `Give me one concise next a…` — fourteen conversations truncated to the
 * same identical prefix, with no way to tell them apart. The assistant's first
 * reply names what the conversation is actually about, so it wins; the user's
 * message is only the fallback when no topic can be derived.
 */
export const DEFAULT_CONVERSATION_TITLE = "New conversation";

const MAX_TITLE = 72;
const STOP_PREFIX = /^(?:sure|certainly|of course|absolutely|happy to help|here(?:'s| is)|let(?:'s| us))\b[^.!?\n]*[.!?]?\s*/i;

function truncate(value: string) {
  const title = value.replace(/\s+/g, " ").trim();
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1).trimEnd()}…` : title;
}

function firstSentence(value: string) {
  const match = value.match(/[^.!?\n]+[.!?]?/);
  return (match?.[0] ?? value).trim();
}

/** Extracts a short topic from an assistant reply, or undefined if there isn't one. */
export function topicFromAssistantReply(content: string) {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, " ")   // fenced code says nothing about the topic
    .replace(/^\s*[>*-]\s+/gm, "")     // list and quote markers
    .trim();
  // A leading Markdown heading is the assistant naming the subject outright.
  const heading = cleaned.match(/^#{1,3}\s+(.{3,80})$/m)?.[1];
  // Replies often stack two filler openings ("Sure! Here's how…"), so strip until
  // the text actually starts saying something.
  let body = cleaned;
  for (let pass = 0; pass < 3 && STOP_PREFIX.test(body); pass += 1) body = body.replace(STOP_PREFIX, "");
  const candidate = heading ?? firstSentence(body);
  const title = truncate(candidate.replace(/\*\*/g, ""));
  return title.length >= 8 ? title : undefined;
}

/**
 * Returns the title to store for a newly-appended message, or undefined to leave
 * the existing title alone. A conversation the user renamed is never retitled.
 */
export function deriveConversationTitle(currentTitle: string, role: "user" | "assistant", content: string) {
  if (currentTitle !== DEFAULT_CONVERSATION_TITLE) return undefined;
  if (role !== "assistant") return undefined;
  return topicFromAssistantReply(content) ?? (truncate(content) || undefined);
}
