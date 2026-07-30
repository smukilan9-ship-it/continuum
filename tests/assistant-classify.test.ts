import { describe, expect, it } from "vitest";
import {
  classifyHeuristic,
  isAnsweredByConversation,
  retrievalPlan,
  type ClassifyInput,
  type RequestClass,
} from "../apps/web/lib/assistant/classify";

function classify(message: string, overrides: Partial<ClassifyInput> = {}) {
  return classifyHeuristic({
    message,
    hasAttachments: false,
    hasPageContext: false,
    ...overrides,
  });
}

/** [message, expected class, options] */
const CASES: Array<[string, RequestClass, Partial<ClassifyInput>?]> = [
  // No retrieval — greetings.
  ["hi", "chitchat"],
  ["hey there", "chitchat"],
  ["thanks!", "chitchat"],
  ["ok got it", "chitchat"],

  // No retrieval — general knowledge.
  ["What is the adiabatic theorem?", "general_knowledge"],
  ["Explain quantum tunnelling", "general_knowledge"],
  ["What is the difference between a list and a tuple?", "general_knowledge"],
  ["Who was Ada Lovelace?", "general_knowledge"],
  ["How do I reverse a string in Python?", "general_knowledge"],

  // Targeted retrieval — the user's own work.
  ["What did I decide about cross-marker association?", "about_my_work"],
  ["What should I work on next for my SAT prep?", "about_my_work"],
  ["Show me my goals", "about_my_work"],
  ["What's on my plan this week?", "about_my_work"],
  ["Summarise my research decisions", "about_my_work"],
  ["I saved a paper yesterday, what was it?", "about_my_work"],
  ["What tasks are still open?", "about_my_work"],

  // Page context.
  ["Explain this error", "about_this_page", { hasPageContext: true }],
  ["What does this code do?", "about_this_page", { hasPageContext: true }],
  ["Summarise this passage", "about_this_page", { hasPageContext: true }],

  // Attachments win over everything else.
  ["Summarise this", "about_a_document", { hasAttachments: true }],
  ["What is the adiabatic theorem?", "about_a_document", { hasAttachments: true }],

  // Broad search needs confirmation.
  ["Find everything I have on immunohistochemistry", "broad_search"],
  ["Search all my sources for spatial statistics", "broad_search"],
  ["Give me a comprehensive review of all my projects", "broad_search"],
];

describe("request classification", () => {
  for (const [message, expected, options] of CASES) {
    it(`classifies "${message}" as ${expected}`, () => {
      expect(classify(message, options).requestClass).toBe(expected);
    });
  }
});

describe("retrieval cost", () => {
  it("performs no retrieval for greetings", () => {
    expect(classify("hi").retrievalPasses).toBe(0);
  });

  it("performs no retrieval for general knowledge", () => {
    expect(classify("What is the adiabatic theorem?").retrievalPasses).toBe(0);
  });

  it("performs exactly one pass for a workspace question", () => {
    expect(classify("What did I decide about the warp?").retrievalPasses).toBe(1);
  });

  it("never exceeds two passes", () => {
    for (const [message, , options] of CASES) {
      expect(classify(message, options).retrievalPasses).toBeLessThanOrEqual(2);
    }
  });
});

describe("broad search consent", () => {
  it("requires confirmation before a wide sweep", () => {
    expect(classify("Find everything I have on IHC").requiresConfirmation).toBe(true);
  });

  it("does not require confirmation for a targeted question", () => {
    expect(classify("What did I decide about the warp?").requiresConfirmation).toBe(false);
    expect(classify("hi").requiresConfirmation).toBe(false);
  });
});

describe("ambiguity is safe", () => {
  it("never falls back to a broad sweep when unsure", () => {
    const unclear = classify("hmm interesting point about that");
    expect(unclear.requestClass).not.toBe("broad_search");
    expect(unclear.retrievalPasses).toBeLessThanOrEqual(1);
  });

  it("prefers one targeted pass over answering blind when a workspace noun appears", () => {
    const result = classify("what is a good study plan");
    expect(result.requestClass).toBe("about_my_work");
    expect(result.confidence).toBeLessThan(0.6);
  });

  it("marks low confidence so the caller can consult a model", () => {
    expect(classify("do the thing").confidence).toBeLessThan(0.6);
  });

  it("marks high confidence on unambiguous cases", () => {
    expect(classify("hi").confidence).toBeGreaterThan(0.9);
    expect(classify("What did I decide about my project?").confidence).toBeGreaterThan(0.9);
  });
});

describe("conversation follow-ups avoid retrieval", () => {
  const withHistory = { conversationEntities: ["OASIS"], hasAttachments: false, hasPageContext: false };

  it("recognises a bare follow-up", () => {
    for (const message of ["why?", "expand on that", "tell me more", "the second one"]) {
      expect(isAnsweredByConversation({ message, ...withHistory })).toBe(true);
    }
  });

  it("does not treat a fresh question as a follow-up", () => {
    expect(isAnsweredByConversation({ message: "What did I decide about the warp?", ...withHistory })).toBe(false);
  });

  it("requires prior context to count as a follow-up", () => {
    expect(isAnsweredByConversation({ message: "why?", conversationEntities: [], hasAttachments: false, hasPageContext: false })).toBe(false);
  });
});

describe("retrieval plan", () => {
  it("reads nothing for chitchat", () => {
    const plan = retrievalPlan(classify("hi"));
    expect(plan.useWorkspace).toBe(false);
    expect(plan.useMemory).toBe(false);
    expect(plan.useAttachments).toBe(false);
  });

  it("reads only attachments for a document question", () => {
    const plan = retrievalPlan(classify("summarise this", { hasAttachments: true }));
    expect(plan.useAttachments).toBe(true);
    expect(plan.useMemory).toBe(false);
  });

  it("caps records and tokens on every class", () => {
    for (const [message, , options] of CASES) {
      const plan = retrievalPlan(classify(message, options));
      expect(plan.maxRecords).toBeLessThanOrEqual(12);
      expect(plan.maxTokens).toBeLessThanOrEqual(2_400);
    }
  });

  it("allows a wider budget only for a confirmed broad search", () => {
    expect(retrievalPlan(classify("find everything on IHC")).maxRecords).toBe(12);
    expect(retrievalPlan(classify("what did I decide about my project?")).maxRecords).toBe(8);
  });
});
