import { describe, expect, it } from "vitest";
import { DEFAULT_CONVERSATION_TITLE, deriveConversationTitle, topicFromAssistantReply } from "../packages/db/src/conversation-title";

describe("conversation titles", () => {
  it("does not title from the user's message, which produced identical entries", () => {
    // Fourteen demo conversations all read `Give me one concise next a…`.
    expect(deriveConversationTitle(DEFAULT_CONVERSATION_TITLE, "user", "Give me one concise next action for my SAT prep")).toBeUndefined();
  });

  it("titles from the assistant's first response topic", () => {
    expect(deriveConversationTitle(DEFAULT_CONVERSATION_TITLE, "assistant", "Your clearest next step is the timed parabolas and circles drill."))
      .toBe("Your clearest next step is the timed parabolas and circles drill.");
  });

  it("prefers a leading heading when the assistant names the subject", () => {
    expect(topicFromAssistantReply("## Commit and rollback in MySQL\n\nA transaction stays invisible until you commit."))
      .toBe("Commit and rollback in MySQL");
  });

  it("skips filler openings", () => {
    expect(topicFromAssistantReply("Sure! Here's how transactions behave. Rollback discards uncommitted rows."))
      .toBe("Rollback discards uncommitted rows.");
  });

  it("ignores fenced code when choosing a topic", () => {
    expect(topicFromAssistantReply("```python\nprint('x')\n```\nThe loop never terminates because the counter is not incremented."))
      .toBe("The loop never terminates because the counter is not incremented.");
  });

  it("truncates to a scannable length", () => {
    const title = topicFromAssistantReply("x".repeat(200))!;
    expect(title.length).toBeLessThanOrEqual(72);
    expect(title.endsWith("…")).toBe(true);
  });

  it("never retitles a conversation the user renamed", () => {
    expect(deriveConversationTitle("SAT geometry drills", "assistant", "Something else entirely.")).toBeUndefined();
  });
});
