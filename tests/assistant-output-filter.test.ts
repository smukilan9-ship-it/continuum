import { describe, expect, it } from "vitest";
import {
  createOutputFilter,
  isConversationalFiller,
  redactContextValue,
  redactIdentifiers,
} from "../apps/web/lib/assistant/output-filter";

/** Streams a response through the filter the way the route does. */
function run(chunks: string[], labels?: Map<string, string>) {
  const filter = createOutputFilter(labels ? { labels } : {});
  let out = "";
  for (const chunk of chunks) out += filter.push(chunk);
  out += filter.flush();
  return { text: out, filter };
}

/** Splits a response into small chunks so the streaming path is exercised. */
function stream(text: string, size = 17) {
  const parts: string[] = [];
  for (let index = 0; index < text.length; index += size) parts.push(text.slice(index, index + size));
  return parts;
}

const BANNED_OPENER_CHECK = /^\s*(?:\*{0,2}|#{1,6}\s*)(?:thinking process|thought process|analysis|analyzing|persona|constraints|step 1|plan:|approach:)/i;
const ID_CHECK = /\b(?:goal|task|project|activity|receipt|block|concept|event|record|mchunk|memory|source|chunk|proposal|session)_[a-z0-9][a-z0-9_]{2,}\b/i;

describe("production leak regression", () => {
  /**
   * Captured verbatim from https://continuumstudy.vercel.app on 2026-07-29 after
   * asking "Based on my current plan and goals, what should I work on next for
   * my SAT prep?". The model streamed its scratchpad, its own system-prompt
   * constraints, and raw database identifiers, and never reached an answer.
   */
  const PRODUCTION_LEAK = [
    "Thinking Process:",
    "",
    "Analyze the Request:",
    "",
    'User asks: "Based on my current plan and goals, what should I work on next for my SAT prep?"',
    "Goal: Identify the next best action for SAT prep based on the provided context.",
    "Persona/Constraints: Continuum (academically careful learning/research assistant). Concise first, expand when needed. CBSE Class 12 level. No meta-commentary, no planning steps.",
    "",
    "Analyze the Context:",
    "",
    "Active Goals:",
    'goal_demo_sat: "Raise SAT score from 1520 to 1570+". Progress: 0.42. Uncertain fields: mockScoreVariance.',
    "Relevant Memories (SAT related):",
    'mchunk_demo_progress_sat: "Progress: SAT parabola-item pace improved from 95s to 68s per question."',
    'mchunk_demo_misc_sat: "Active misconception: arc-length and sector-area formulas swapped under time pressure."',
    "",
    'Synthesize the "Next Steps":',
    "",
    "Gap 1: Advanced Geometry",
    "",
    "Focus on advanced geometry. Your error log shows arc-length and sector-area formulas swapping under time pressure, and that costs you accuracy in the last third of timed sets.",
  ].join("\n");

  it("suppresses every narration heading from the captured leak", () => {
    const { text } = run(stream(PRODUCTION_LEAK));
    expect(text).not.toMatch(/Thinking Process/i);
    expect(text).not.toMatch(/Analyze the Request/i);
    expect(text).not.toMatch(/Persona\/Constraints/i);
    expect(text).not.toMatch(/Synthesize/i);
    expect(text).not.toMatch(BANNED_OPENER_CHECK);
  });

  it("suppresses every internal identifier from the captured leak", () => {
    const { text } = run(stream(PRODUCTION_LEAK));
    expect(text).not.toMatch(ID_CHECK);
    expect(text).not.toMatch(/goal_demo_sat/);
    expect(text).not.toMatch(/mchunk_demo/);
  });

  it("still delivers the answer that was buried under the narration", () => {
    const { text } = run(stream(PRODUCTION_LEAK));
    expect(text).toMatch(/advanced geometry/i);
    expect(text).toMatch(/arc-length and sector-area/i);
  });

  it("reports that narration was suppressed", () => {
    const { filter } = run(stream(PRODUCTION_LEAK));
    expect(filter.suppressedNarration).toBe(true);
  });
});

describe("narration openers", () => {
  const cases: Array<[name: string, text: string]> = [
    ["Thinking Process", "Thinking Process:\nI should check the goals.\n\nYour next step is the geometry drill."],
    ["Thought process", "Thought process:\nStep one.\n\nYour next step is the geometry drill."],
    ["Analysis heading", "Analysis:\n- goal is SAT\n\nYour next step is the geometry drill."],
    ["Let me think", "Let me think about this.\n\nYour next step is the geometry drill."],
    ["Step 1", "Step 1: read the context.\n\nYour next step is the geometry drill."],
    ["Plan", "Plan:\n1. check goals\n\nYour next step is the geometry drill."],
    ["Approach", "Approach:\nUse the error log.\n\nYour next step is the geometry drill."],
    ["Persona", "Persona: Continuum, careful assistant.\n\nYour next step is the geometry drill."],
    ["Constraints", "Constraints: concise first.\n\nYour next step is the geometry drill."],
    ["First I'll", "First, I'll review the goals.\n\nYour next step is the geometry drill."],
    ["The user is asking", "The user is asking about SAT prep.\n\nYour next step is the geometry drill."],
    ["Bold heading", "**Analysis**\nSome planning.\n\nYour next step is the geometry drill."],
    ["Markdown heading", "## Thinking\nSome planning.\n\nYour next step is the geometry drill."],
  ];

  for (const [name, text] of cases) {
    it(`removes a "${name}" opener and keeps the answer`, () => {
      const { text: out } = run(stream(text));
      expect(out).not.toMatch(BANNED_OPENER_CHECK);
      expect(out).toMatch(/geometry drill/);
    });
  }
});

describe("tagged reasoning", () => {
  it("removes a <think> block", () => {
    const { text } = run(stream("<think>internal planning here</think>The answer is 42."));
    expect(text).not.toMatch(/internal planning/);
    expect(text).toMatch(/The answer is 42\./);
  });

  it("removes a <think> block split across chunks", () => {
    const { text } = run(["<thi", "nk>plan", "ning</th", "ink>Real answer."]);
    expect(text).not.toMatch(/planning/);
    expect(text).toMatch(/Real answer\./);
  });

  it("removes a <scratchpad> block", () => {
    const { text } = run(stream("<scratchpad>notes</scratchpad>Real answer."));
    expect(text).not.toMatch(/notes/);
    expect(text).toMatch(/Real answer\./);
  });

  // Ported from the reasoning-filter suite this replaces.
  it("handles <reasoning> and <thinking> spellings", () => {
    for (const tag of ["reasoning", "thinking"]) {
      const { text } = run(stream(`<${tag}>hidden plan</${tag}>Visible answer.`));
      expect(text).not.toMatch(/hidden plan/);
      expect(text).toMatch(/Visible answer\./);
    }
  });

  it("emits nothing when the model never closes its thought", () => {
    const { text } = run(stream("<think>this block never closes and runs to the end"));
    expect(text.trim()).toBe("");
  });

  it("does not eat markdown or code that merely starts with a tag-like token", () => {
    const { text } = run(stream("<div> is a block element in HTML."));
    expect(text).toMatch(/<div> is a block element/);
  });

  it("preserves content streamed one character at a time", () => {
    const { text } = run("Short answer.".split(""));
    expect(text.trim()).toBe("Short answer.");
  });
});

describe("legitimate answers are not damaged", () => {
  it("passes a plain answer through unchanged", () => {
    const answer = "Advanced geometry is your weakest area. Rework the flagged misses first.";
    const { text } = run(stream(answer));
    expect(text.trim()).toBe(answer);
  });

  it("does not truncate an answer that opens with a list", () => {
    const answer = "1. Rework the flagged misses.\n2. Then run a timed set.\n3. Log your pace.";
    const { text } = run(stream(answer));
    expect(text).toMatch(/Rework the flagged misses/);
    expect(text).toMatch(/Log your pace/);
  });

  it("does not truncate an answer containing the word analysis in prose", () => {
    const answer = "Your analysis of the error log was right: the formulas are swapping.";
    const { text } = run(stream(answer));
    expect(text.trim()).toBe(answer);
  });

  it("keeps a markdown heading that is not narration", () => {
    const answer = "## What to do next\n\nRework the flagged geometry misses.";
    const { text } = run(stream(answer));
    expect(text).toMatch(/What to do next/);
    expect(text).toMatch(/Rework the flagged/);
  });

  it("keeps a short answer below the guard length", () => {
    const { text } = run(stream("Yes."));
    expect(text.trim()).toBe("Yes.");
  });

  it("preserves code blocks", () => {
    const answer = "Try this:\n\n```python\nprint(sum(scores) / len(scores))\n```";
    const { text } = run(stream(answer));
    expect(text).toMatch(/```python/);
    expect(text).toMatch(/print\(sum\(scores\)/);
  });
});

describe("identifier redaction", () => {
  it("replaces a known id with its label", () => {
    const labels = new Map([["goal_demo_sat", "Raise SAT score from 1520 to 1570+"]]);
    const { text } = run(stream("Your goal goal_demo_sat is on track."), labels);
    expect(text).toMatch(/Raise SAT score from 1520 to 1570\+/);
    expect(text).not.toMatch(/goal_demo_sat/);
  });

  it("removes an unknown id rather than printing it", () => {
    const { text } = run(stream("Recorded against activity_9f2ab41c7de4 today."));
    expect(text).not.toMatch(ID_CHECK);
    expect(text).toMatch(/Recorded against/);
  });

  it("cleans up punctuation debris left by a removed id", () => {
    expect(redactIdentifiers("Saved (receipt_abc123def) today.")).toBe("Saved today.");
  });

  it("leaves ordinary underscored words alone", () => {
    const text = "Use snake_case and call read_source when you need it.";
    expect(redactIdentifiers(text)).toBe(text);
  });
});

describe("context redaction preserves structure", () => {
  /**
   * The prose redactor strips empty brackets to tidy up after a removed id.
   * Run over serialized context it turned `"uncertainFields":[]` into
   * `"uncertainFields":` and the route threw
   * `SyntaxError: Unexpected token ','` before any model call. Structured
   * context goes through redactContextValue, which never touches shape.
   */
  it("keeps empty arrays intact", () => {
    const context = { goals: [{ id: "goal_demo_sat", uncertainFields: [], tags: [] }] };
    const out = redactContextValue(context);
    expect(out.goals[0]!.uncertainFields).toEqual([]);
    expect(JSON.stringify(out)).toContain('"uncertainFields":[]');
  });

  it("survives a JSON round trip", () => {
    const context = {
      workspace: { activeGoals: [{ id: "goal_demo_sat", title: "Raise SAT", uncertainFields: [] }] },
      relevantMemory: [{ id: "mchunk_demo_misc_sat", content: "Formulas swapped." }],
      selectedFiles: [],
      nested: { deep: { empty: {}, list: [] } },
    };
    expect(() => JSON.parse(JSON.stringify(redactContextValue(context)))).not.toThrow();
  });

  it("redacts identifiers inside string values", () => {
    const labels = new Map([["goal_demo_sat", "Raise SAT score"]]);
    const out = redactContextValue({ note: "Linked to goal_demo_sat today." }, labels);
    expect(out.note).toBe("Linked to Raise SAT score today.");
  });

  it("leaves object keys untouched", () => {
    const out = redactContextValue({ source_id: "kept", task_status: "open" });
    expect(Object.keys(out)).toEqual(["source_id", "task_status"]);
  });

  it("preserves non-string primitives", () => {
    const out = redactContextValue({ progress: 0.42, active: true, missing: null });
    expect(out).toEqual({ progress: 0.42, active: true, missing: null });
  });
});

describe("whole-response narration", () => {
  it("produces no output when the response is narration end to end", () => {
    const { text, filter } = run(stream("Thinking Process:\nI will plan.\nStep 1: read goals.\nStep 2: answer."));
    expect(text.trim()).toBe("");
    expect(filter.producedOutput).toBe(false);
  });

  it("reports producedOutput true when an answer survived", () => {
    const { filter } = run(stream("Analysis:\nplanning\n\nThe real answer."));
    expect(filter.producedOutput).toBe(true);
  });
});

describe("conversational filler", () => {
  it("detects greetings", () => {
    for (const greeting of ["hi", "hey", "hello", "thanks", "ok", "got it", "good morning"]) {
      expect(isConversationalFiller(greeting)).toBe(true);
    }
  });

  it("does not treat a real question as filler", () => {
    expect(isConversationalFiller("what should I study next?")).toBe(false);
    expect(isConversationalFiller("hi, can you explain electric potential")).toBe(false);
  });
});
