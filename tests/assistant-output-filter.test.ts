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
    // `uncertainFields` is now dropped on purpose — it carries column names, not
    // content — so the shape assertion moved to a key that survives. What this
    // protects is unchanged: an empty array must come out as an empty array and
    // the result must still parse.
    const context = { goals: [{ id: "goal_demo_sat", uncertainFields: [], tags: [] }] };
    const out = redactContextValue(context);
    expect(out.goals[0]!.tags).toEqual([]);
    expect(JSON.stringify(out)).toContain('"tags":[]');
    expect(() => JSON.parse(JSON.stringify(out))).not.toThrow();
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

/**
 * Found by reading a live answer, not by the suite.
 *
 * The prefix list was an allowlist of the prefixes someone remembered, so it
 * failed silently for every one they did not: a production reply printed
 * "`learning_demo_sql_param` is in_progress (0.6 exposure, 0.55 understanding)"
 * at a Class 12 student. And `uncertainFields` carried raw column names into
 * the prompt, which came back as "Uncertain: mockScoreVariance".
 */
describe("identifiers and internal field names found in production", () => {
  for (const prefix of ["learning", "resource", "curriculum", "cnode", "assessment", "misc", "route", "cal", "oauth"]) {
    it(`redacts a ${prefix}_ identifier`, () => {
      expect(redactIdentifiers(`Evidence: ${prefix}_demo_sql_param is in_progress`)).not.toContain(`${prefix}_demo`);
    });
  }

  it("keeps every prefix the store actually mints under guard", () => {
    // If the store grows a prefix, this is the line that should fail.
    const minted = ["goal", "task", "project", "source", "paper", "concept", "memory", "record", "mchunk",
      "learning", "resource", "curriculum", "cnode", "assessment", "misc", "route", "cal", "oauth",
      "claim", "decision", "note", "milestone", "attempt", "asession", "amsg", "proposal", "receipt", "block", "event", "activity"];
    for (const prefix of minted) {
      expect(redactIdentifiers(`ref ${prefix}_abc123 here`), prefix).not.toContain(`${prefix}_abc123`);
    }
  });

  it("never sends an internal field name to the model", () => {
    const context = { goals: [{ title: "Raise SAT score", uncertainFields: ["mockScoreVariance"], promptVersion: "demo-v1" }] };
    const safe = JSON.stringify(redactContextValue(context));
    expect(safe).not.toContain("mockScoreVariance");
    expect(safe).not.toContain("promptVersion");
    expect(safe).toContain("Raise SAT score");
  });
});

/**
 * The second production leak, read off the live deployment.
 *
 * A blocklist only catches the openers somebody thought of. This reply opened
 * "Analyze the Workspace Data (Goals & Progress & Uncertainties):" and then
 * dumped a labelled list, and — worse — quoted our own output contract back at
 * the user: "Constraint: 'Answer in calm, plain Markdown… Never output a
 * plan…'". Both are caught by shape now, not by vocabulary.
 */
describe("the second production leak (structural)", () => {
  const CONTRACT = [
    "Answer in calm, plain Markdown, beginning with the first sentence of the answer itself.",
    "Never output a plan, outline, or analysis of the request.",
    "Refer to any record by its title. Never write an internal identifier.",
  ].join(" ");

  const LEAK = [
    "Analyze the Request:",
    'User asks: "Across all four of my goals, what is the biggest risk?"',
    'Constraint: "Answer in calm, plain Markdown, beginning with the first sentence of the answer itself. Never output a plan, outline, or analysis of the request."',
    "Analyze the Workspace Data (Goals & Progress & Uncertainties):",
    'Goal 1: "Raise SAT score from 1520 to 1570+"',
    "Progress: 0.42",
    "Uncertain: mockScoreVariance",
  ].join("\n");

  const run = (text: string, instructions?: string) => {
    const filter = createOutputFilter({ instructions });
    let out = "";
    for (const chunk of text.split(/(?<=\n)/)) out += filter.push(chunk) ?? "";
    out += filter.flush() ?? "";
    return { out, suppressed: filter.suppressedNarration };
  };

  it("suppresses the leak verbatim", () => {
    const { out, suppressed } = run(LEAK, CONTRACT);
    expect(out.trim()).toBe("");
    expect(suppressed).toBe(true);
  });

  it("catches a labelled dump even with an opener nobody listed", () => {
    const novel = ["Survey the Landscape:", "Item one: a value", "Item two: a value", "Item three: a value"].join("\n");
    expect(run(novel).out.trim()).toBe("");
  });

  it("catches the model reciting our instructions back", () => {
    const echo = "Beginning with the first sentence of the answer itself, never output a plan, outline, or analysis of the request.";
    expect(run(echo, CONTRACT).out.trim()).toBe("");
  });

  it("leaves a real answer that happens to use a colon alone", () => {
    const real = "Your nearest deadline is the SQL goal on 6 September, and the evidence is in your last two practice results.\n\nThe risk: you have four goals and only one of them has a block this week.";
    const { out } = run(real, CONTRACT);
    expect(out).toContain("Your nearest deadline is the SQL goal");
    expect(out).toContain("The risk:");
  });

  it("leaves a short answer with a labelled line alone", () => {
    // Two labels is a formatted answer; three with no prose is a worksheet.
    const real = "Due today: the timed drill.\nDue tomorrow: the SQL practice.\n\nBoth are on the SAT goal.";
    expect(run(real).out).toContain("Due today");
  });

  it("finds the answer after a scaffold and keeps it", () => {
    const mixed = `${LEAK}\n\nYour biggest risk is the SQL goal: it is due first and is the least practised.`;
    const { out } = run(mixed, CONTRACT);
    expect(out).toContain("Your biggest risk is the SQL goal");
    expect(out).not.toContain("mockScoreVariance");
    expect(out).not.toContain("Analyze the Request");
  });
});
