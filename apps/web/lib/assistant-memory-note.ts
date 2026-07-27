type AssistantMemoryNoteInput = {
  sessionId: string;
  title: string;
  savedAt: string;
  summary: string;
  decisions: string[];
  importantFacts: string[];
  unresolvedQuestions: string[];
  nextActions: string[];
  linkedEntityIds: string[];
  transcript?: Array<{ role: string; content: string }>;
};

function section(title: string, values: string[], empty = "None recorded.") {
  return [`## ${title}`, "", ...(values.length ? values.map((value) => `- ${value.trim()}`) : [empty])].join("\n");
}

export function assistantMemoryVaultPath(sessionId: string, title: string) {
  const slug = title
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "assistant-session";
  const suffix = sessionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(-10);
  return `Continuum/Assistant Memory/${slug}-${suffix}.md`;
}

export function assistantMemoryMarkdown(input: AssistantMemoryNoteInput) {
  const linked = input.linkedEntityIds.map((entityId) => `continuum://entity/${encodeURIComponent(entityId)}`);
  const transcript = input.transcript?.length
    ? [
      "## Raw transcript",
      "",
      "> Included because you explicitly opted in when saving this memory.",
      "",
      ...input.transcript.map((message) => `### ${message.role === "user" ? "You" : "Continuum"}\n\n${message.content.trim()}`),
    ].join("\n\n")
    : "";
  return [
    `# ${input.title}`,
    "",
    `Saved from [Continuum Assistant](continuum://assistant/session/${encodeURIComponent(input.sessionId)}) on ${input.savedAt.slice(0, 10)}.`,
    "",
    "## Summary",
    "",
    input.summary.trim(),
    "",
    section("Decisions", input.decisions),
    "",
    section("Important facts", input.importantFacts),
    "",
    section("Open questions", input.unresolvedQuestions),
    "",
    section("Next actions", input.nextActions),
    "",
    section("Linked workspace records", linked),
    ...(transcript ? ["", transcript] : []),
    "",
  ].join("\n");
}
