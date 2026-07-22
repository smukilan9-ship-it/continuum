import { describe, expect, it } from "vitest";
import { makeDefaultSession, mergeSavedSession, type CodeSession } from "../apps/web/components/workspace/use-code-session";

describe("code session persistence", () => {
  it("builds a default session from partial defaults", () => {
    const s = makeDefaultSession({ topic: "Recursion", goalId: "goal_1" });
    expect(s.topic).toBe("Recursion");
    expect(s.goalId).toBe("goal_1");
    expect(s.language).toBe("Python");
    expect(s.attempts).toEqual([]);
  });

  it("restores a saved session over the current one (the reset-bug fix)", () => {
    const current = makeDefaultSession({ topic: "default topic" });
    const saved: Partial<CodeSession> = { topic: "my recursion attempt", code: "def f(n):\n    return n", language: "Python" };
    const restored = mergeSavedSession(current, JSON.stringify(saved));
    // The learner's work wins over the defaults — this is what makes navigating
    // away and back not discard progress.
    expect(restored.topic).toBe("my recursion attempt");
    expect(restored.code).toBe("def f(n):\n    return n");
  });

  it("preserves multiline/indented code exactly across a round-trip", () => {
    const original = makeDefaultSession({
      language: "Python",
      code: "def area(r):\n    pi = 3.14159\n    return pi * r * r\n",
    });
    const restored = mergeSavedSession(makeDefaultSession({}), JSON.stringify(original));
    expect(restored.code).toBe("def area(r):\n    pi = 3.14159\n    return pi * r * r\n");
  });

  it("keeps existing attempts when the saved payload has none", () => {
    const current: CodeSession = { ...makeDefaultSession({}), attempts: [{ id: "a1", at: 1, mode: "explain", language: "Python", topic: "t", prompt: "p", code: "c", answer: "x" }] };
    const restored = mergeSavedSession(current, JSON.stringify({ topic: "new" }));
    expect(restored.attempts).toHaveLength(1);
    expect(restored.topic).toBe("new");
  });

  it("restores attempt history from a saved payload", () => {
    const current = makeDefaultSession({});
    const saved = { attempts: [{ id: "a1", at: 1, mode: "debug", language: "SQL", topic: "joins", prompt: "p", code: "SELECT 1", answer: "ok" }] };
    const restored = mergeSavedSession(current, JSON.stringify(saved));
    expect(restored.attempts).toHaveLength(1);
    expect(restored.attempts[0]!.code).toBe("SELECT 1");
  });

  it("falls back to defaults on a corrupt draft instead of throwing", () => {
    const current = makeDefaultSession({ topic: "safe" });
    expect(mergeSavedSession(current, "{not valid json")).toEqual(current);
    expect(mergeSavedSession(current, null)).toEqual(current);
  });
});
