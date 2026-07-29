import { describe, expect, it } from "vitest";
import { createReasoningFilter, isConversationalFiller } from "../apps/web/lib/reasoning-filter";

function stream(parts: string[]) {
  const filter = createReasoningFilter();
  return parts.map((part) => filter.push(part)).join("") + filter.flush();
}

describe("reasoning filter", () => {
  it("passes an ordinary answer through unchanged", () => {
    expect(stream(["The adiabatic ", "theorem states ", "that a system stays in its eigenstate."]))
      .toBe("The adiabatic theorem states that a system stays in its eigenstate.");
  });

  it("strips a <think> block that arrives in one chunk", () => {
    expect(stream(["<think>Plan: greet the user.</think>Hello!"])).toBe("Hello!");
  });

  it("strips a <think> block split across chunk boundaries", () => {
    expect(stream(["<thi", "nk>step 1", " step 2</thi", "nk>", "Hi there."])).toBe("Hi there.");
  });

  it("handles <reasoning> and <thinking> spellings", () => {
    expect(stream(["<reasoning>x</reasoning>A"])).toBe("A");
    expect(stream(["<thinking>y</thinking>B"])).toBe("B");
  });

  it("emits nothing when the model never closes its thought", () => {
    expect(stream(["<think>never closed and never answered"])).toBe("");
  });

  it("does not eat markdown or code that merely starts with a tag-like token", () => {
    expect(stream(["<div> is a block element."])).toBe("<div> is a block element.");
  });

  it("preserves content streamed one character at a time", () => {
    expect(stream("Short answer.".split(""))).toBe("Short answer.");
  });
});

describe("conversational filler detection", () => {
  it.each(["hi", "Hey", "hello there", "thanks!", "thank you", "ok", "got it", "good morning", "bye"])(
    "treats %j as filler that needs no retrieval", (message) => {
      expect(isConversationalFiller(message)).toBe(true);
    });

  it.each([
    "What is the adiabatic theorem?",
    "hi, can you explain energy gaps in annealing schedules for me",
    "thanks — now compare that against the Albash paper",
    "Explain tunneling",
  ])("treats %j as a real request", (message) => {
    expect(isConversationalFiller(message)).toBe(false);
  });

  it("does not classify a long greeting-prefixed request as filler", () => {
    expect(isConversationalFiller("hello I need help with my SAT geometry revision plan")).toBe(false);
  });
});
