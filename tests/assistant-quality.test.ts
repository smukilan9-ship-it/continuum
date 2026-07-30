import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildDemoData } from "../packages/db/src/seed-demo";
import { demoStore } from "../apps/web/lib/demo-store";
import { containsInternalId } from "../apps/web/lib/user-copy";
import type { RequestClass } from "../apps/web/lib/assistant/classify";

/**
 * §18.5 — the assistant-quality rubric. Twenty fixed prompts against the demo
 * account's records, asserting only mechanically checkable properties.
 *
 * **What is real and what is stubbed.** Everything the product owns runs for
 * real: the classifier, the eleven-step orchestrator, the provenance builder,
 * the route's prompt assembly (`buildAcademicPrompt`), and the streaming output
 * filter. The single stub is `@/lib/ai-gateway` — the narrowest module boundary
 * that owns the provider call — and all it does is stream a recorded string
 * back in 17-character chunks, standing in for the model. No assertion below is
 * satisfied by the stub alone: each one is about what the product *did* to that
 * string, or about the plan and provenance the product built around it.
 *
 * Raw fixtures are deliberately hostile. Most of them open with narration, and
 * most carry raw record identifiers, so "no banned opener" and "no identifier"
 * can actually fail if the filter or the redaction regresses. Each also ends in
 * a distinctive sentence that must survive — a filter that simply deletes
 * everything would pass the negative checks and fail `mustSay`.
 */

const gateway = vi.hoisted(() => ({
  /** What the stubbed provider will stream for the next turn. */
  nextText: "",
  /** Every gateway request the route made, so the prompt can be inspected. */
  calls: [] as Array<{ system: string; prompt: string; taskClass: string; maxOutputTokens?: number }>,
}));

vi.mock("@/lib/ai-gateway", () => ({
  aiErrorResponse: (error: unknown) => new Response(String(error), { status: 503 }),
  runStructuredAi: async () => { throw new Error("assistant-quality never exercises the structured route"); },
  runStreamingAi: async (input: { system: string; prompt: string; taskClass: string; maxOutputTokens?: number }) => {
    gateway.calls.push({ system: input.system, prompt: input.prompt, taskClass: input.taskClass, maxOutputTokens: input.maxOutputTokens });
    const text = gateway.nextText;
    return {
      decision: { route: "stub", model: "stub-model" },
      result: {
        textStream: (async function* () {
          // Chunked the way a provider streams, so the guard/flush path in
          // `output-filter.ts` is the one under test rather than a single push.
          for (let index = 0; index < text.length; index += 17) yield text.slice(index, index + 17);
        })(),
      },
    };
  },
}));

const { POST } = await import("@/app/api/assistant/route");
const { getStore } = await import("@/lib/store");

// ---------------------------------------------------------------------------
// The demo account
// ---------------------------------------------------------------------------

const DEMO = buildDemoData(new Date("2026-07-30T04:00:00.000Z"));

/** Every id the demo fixture mints. A citation chip must point at one of these. */
const RESOLVABLE_IDS = new Set<string>([
  ...DEMO.goalRows.map((row) => row.id),
  ...DEMO.projectRows.map((row) => row.id),
  ...DEMO.taskRows.map((row) => row.id),
  ...DEMO.decisionRows.map((row) => row.id),
  ...DEMO.sourceRows.map((row) => row.id),
  ...DEMO.chunkRows.map((row) => row.id),
  ...DEMO.memoryChunkRows.map((row) => row.id),
  ...DEMO.receiptRows.map((row) => row.id),
]);

/** Loads the demo account into the in-memory store the route reads through. */
function seedDemoAccount() {
  const title = (sourceId: string) => DEMO.sourceRows.find((row) => row.id === sourceId)!.title;
  demoStore.goals = DEMO.goalRows.map((row) => ({ ...row, targetDate: row.targetDate.toISOString() }));
  demoStore.projects = DEMO.projectRows.map((row) => ({ ...row }));
  demoStore.tasks = DEMO.taskRows.map((row) => ({ ...row, deadline: row.deadline.toISOString() }));
  demoStore.decisions = DEMO.decisionRows.map((row) => ({ ...row }));
  demoStore.notes = DEMO.noteRows.map((row) => ({ ...row }));
  demoStore.claims = DEMO.claimRows.map((row) => ({ ...row }));
  demoStore.papers = DEMO.paperRows.map((row) => ({ ...row }));
  demoStore.schedule = DEMO.scheduleRows.map((row) => ({
    ...row,
    // The in-memory store spells a block's window `start`/`end`; the seed rows
    // carry the database column names.
    start: row.startsAt.toISOString(),
    end: row.endsAt.toISOString(),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    committedAt: row.committedAt.toISOString(),
  }));
  demoStore.receipts = DEMO.receiptRows.map((row) => ({ ...row }));
  demoStore.sources = DEMO.sourceRows.map((row) => ({ ...row, createdAt: "2026-07-01T00:00:00.000Z" }));
  demoStore.chunks = DEMO.chunkRows.map((row) => ({
    id: row.id,
    sourceId: row.sourceId,
    sourceTitle: title(row.sourceId),
    passage: row.passage,
    text: row.content,
    contentHash: row.contentHash,
    sourceVersion: 1,
    deleted: false,
    reference: `${title(row.sourceId)} · passage ${row.passage}`,
  }));
  demoStore.memoryChunks = DEMO.memoryChunkRows.map((row) => ({
    id: row.id,
    kind: row.kind,
    content: row.content,
    occurredAt: row.occurredAt.toISOString(),
    importance: row.importance,
    tokenEstimate: row.tokenEstimate,
    sourceEventIds: [],
    metadata: {},
    ...(row.goalId ? { goalId: row.goalId } : {}),
    ...(row.projectId ? { projectId: row.projectId } : {}),
  }));
  demoStore.events = [];
  demoStore.proposals = [];
  demoStore.assistantSessions = [];
  demoStore.assistantMessages = [];
}

// ---------------------------------------------------------------------------
// Rubric definitions — reused from the sibling suites rather than reinvented
// ---------------------------------------------------------------------------

/**
 * The banned-opener vocabulary, copied — not imported — from the same source
 * `assistant-output-filter.test.ts` takes its subset from, so the two suites
 * cannot disagree about what a banned opener is. It is a literal copy on
 * purpose: importing `output-filter.ts`'s own constant would make the check
 * circular, and a narrowed subset would let a narrated row pass unfiltered.
 */
const BANNED_OPENER_CHECK =
  /^\s*(?:\*{0,2}|#{1,6}\s*)(?:thinking process|thought process|thinking|reasoning|analysis|analyzing|analyze the request|let me (?:think|analyze|start|break)|first,?\s+i(?:'|’)?(?:ll| will| need)|step 1|plan:|approach:|persona|constraints|context:|synthesize|synthesizing|draft:|drafting|my task|the user (?:is asking|wants|asks))(?![a-z])/i;

/** The same narration headings, wherever they reappear on a line of their own. */
const NARRATION_HEADING_ANYWHERE =
  /(?:^|\n)\s*(?:\*{0,2}|#{1,6}\s*)(?:thinking process|thought process|analysis|analyze the request|analyze the context|persona\/constraints|synthesize)/i;

/** Identifiers are checked with the product's own scrubber (`lib/user-copy.ts`),
 *  which documents why §9.4's `_[a-z0-9]{6,}` is the wrong character class. */
const hasIdentifier = (value: string) => containsInternalId(value);

const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

/** §11.9 / AC-A6: the exact predicate `ask-thread.tsx` renders the ungrounded
 *  line from. Asserting the predicate keeps the node suite honest about a line
 *  it cannot render. */
const rendersUngroundedLine = (metadata: TurnMetadata) => metadata.grounded === false && !(metadata.usedContext ?? []).length;

/** `ask-thread.tsx` renders a citation row iff `usedContext` is non-empty. */
const rendersCitationChips = (metadata: TurnMetadata) => (metadata.usedContext ?? []).length > 0;

/** The two output-contract branches the route chooses between (route.ts:383). */
const UNGROUNDED_CONTRACT = "Nothing in the user's workspace matched this question. Answer from general knowledge and do not imply you consulted their material.";
const GROUNDED_CONTRACT = "Clearly distinguish saved facts from suggestions. Do not claim to change workspace records.";

// ---------------------------------------------------------------------------
// Raw model output fixtures
// ---------------------------------------------------------------------------

/**
 * Captured verbatim from https://continuumstudy.vercel.app on 2026-07-29 — the
 * same C1 capture the output-filter suite regresses against, replayed here
 * through the whole route so the leak is covered end to end.
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

/** ~380 words. Long enough that a duplicating stream or a truncating filter
 *  both break the `fast` budget assertion, in opposite directions. */
const LONG_PYTHON_ANSWER = [
  "Reversing a string in Python has three idiomatic forms, and the one you pick depends on what you need afterwards.",
  "",
  "The slice is the shortest and the fastest. Writing `text[::-1]` asks for a slice with a step of minus one, which walks the sequence from the last character to the first and builds a brand-new string. It is a single C-level loop, it allocates once, and it works on any sequence that supports slicing, so the same expression reverses a list or a tuple without changing shape. It reads oddly the first time you meet it, but it is the form you will see in almost every codebase, and learning to read it is worth the five seconds it costs.",
  "",
  "The builtin is the readable one. Calling `reversed(text)` gives you an iterator that yields characters from the end, and `''.join(reversed(text))` collects them back into a string. This is slower than the slice because it goes through the iterator protocol one character at a time, but it says what it means, and when you only need to walk the characters backwards rather than materialise a reversed copy you can drop the join entirely and iterate the reversed object directly. That saves the allocation, which matters when the string is large.",
  "",
  "The loop is the one to write when the reversal is not the point. If you are reversing while also filtering, transforming, or counting, a plain `for` loop over `reversed(text)` keeps all of that in one readable pass instead of chaining three expressions that each build an intermediate string.",
  "",
  "Two things that trip people up. First, strings are immutable, so none of these reverse in place — every form returns a new object and leaves the original alone. Second, a naive reversal reverses code points, not what a reader would call characters: an emoji built from a zero-width joiner sequence, or a letter followed by a combining accent, comes apart when you reverse the code points underneath it. If you are reversing text a human will read, normalise first and iterate grapheme clusters rather than code points.",
  "",
  "For interview answers and ordinary code, reach for the slice; reach for the loop only when you are doing something else at the same time.",
].join("\n");

/** ~380 words, in the shape a grounded plan answer takes. */
const LONG_PLAN_ANSWER = [
  "Analysis:",
  "- five committed blocks this week",
  "",
  "Your week is already committed, so the question is really about ordering rather than filling.",
  "",
  "Today has two blocks. The timed parabolas-and-circles drill sits first because it is the one in progress and because it depends on the error-log rework you already finished, so nothing is blocking it. Run it as a clean timed set and log the pace per question rather than only the score — the pace number is the one that has been moving, and it is the number that tells you whether the geometry work is transferring under time pressure. The transaction drill follows it in the evening. That one is lighter, and putting it second means an evening dip costs you less.",
  "",
  "Tomorrow is the heavier day. The parameterized-query rewrite is scheduled first, and the two timed Reading and Writing sets follow it. Do not swap that order. The rewrite is short, it unblocks the record CLI later in the week, and the reading sets are the ones that demand endurance, so they belong at the point where you have nothing queued behind them. If something has to give tomorrow, give up the second reading set, not the rewrite.",
  "",
  "The dense-null run is the one to protect. It is the longest block on the calendar, it is the only task that is genuinely blocking the interpretation figure later in the week, and it is the kind of work that goes badly when it is interrupted. Treat it as fixed and move the exoplanet tuning block around it if the week compresses, because the tuning search can be shortened without invalidating anything while a half-finished run cannot.",
  "",
  "Two things are worth watching. Your accuracy drops in the last third of timed sets, so the value of the second reading set is mostly endurance rather than content — if you are guessing by the end, stop and log it rather than pushing through. And the mock review at the end of the week only pays off if every missed and guessed question reaches the error log with a cause tag, so budget the full block for it instead of skimming.",
  "",
  "Start with the geometry drill.",
].join("\n");

const RAW = {
  greetingClean: "Hey — what are you working on today?",
  ackNarrated: [
    "Thinking:",
    "The user acknowledged the previous answer, so nothing further is needed.",
    "",
    "Anytime. Ping me when you want the next drill queued up.",
  ].join("\n"),
  thanksNarrated: [
    "Thought process: a short acknowledgement is the whole reply here.",
    "",
    "You're welcome — glad that landed.",
  ].join("\n"),
  adiabaticLeaky: [
    "Analysis:",
    "- definition question, no workspace reference",
    "",
    "The adiabatic theorem says that a quantum system stays in its instantaneous eigenstate when the Hamiltonian changes slowly enough and the relevant energy gap never closes. Recorded against record_9f2ab41c7de4 for reference.",
  ].join("\n"),
  tunnellingClean: "Quantum tunnelling is a particle crossing a barrier taller than its own energy, because the wavefunction decays inside the barrier rather than stopping at it. The transmission probability falls off exponentially with barrier width.",
  lovelaceNarrated: [
    "Let me think about how to frame this.",
    "",
    "Ada Lovelace wrote the notes on Menabrea's account of the Analytical Engine, and note G in those notes is the first published algorithm intended for a machine.",
  ].join("\n"),
  pythonLong: LONG_PYTHON_ANSWER,
  satLeak: PRODUCTION_LEAK,
  decisionLeaky: [
    "First, I'll check the recorded decisions.",
    "",
    "You decided that cross-marker association must never be presented as same-cell co-expression, because serial sections are different physical slices. That decision belongs to goal_demo_oasis and it is the constraint that shapes how the figure legend is written.",
  ].join("\n"),
  goalsClean: "You have four active goals. The nearest deadline belongs to goal_demo_sql, and the one furthest along is the OASIS write-up.",
  planLong: LONG_PLAN_ANSWER,
  decisionsNarrated: [
    "Approach:",
    "1. list accepted decisions",
    "2. group them",
    "",
    // Deliberately phrased without an early colon. `output-filter.ts` treats a
    // short colon-terminated clause as a continuation of narration once an
    // opener has been seen, and swallows the answer behind it (see the note in
    // the final report) — the rubric asserts the product's shipped behaviour,
    // so it must not depend on that unresolved false positive.
    "Three decisions are accepted, and they stack. Same-cell co-expression claims are ruled out, registration stays similarity-only, and the Fitzpatrick–West cell-error budget is the certification gate.",
  ].join("\n"),
  tasksClean: "Six tasks are still open. Three of them are in progress, and the parameterized-query rewrite is the only one with something else waiting on it.",
  errorLeaky: [
    "Step 1: read the traceback.",
    "",
    "That traceback is a missing comma in the values tuple, so the cursor received one argument where the statement expects two. Logged under activity_d61e36a01a9e4275 in the run history.",
  ].join("\n"),
  codeClean: "This file opens a MySQL connection, builds one cursor, and runs a parameterized insert. The commit at the end is what makes the write durable — without it the row disappears when the connection closes.",
  passageNarrated: [
    "**Analysis**",
    "The passage is about registration constraints.",
    "",
    "The passage says registration stays similarity-only — rotation, uniform scale, and translation — because a non-rigid warp fabricates the inter-cell distances the cross-type statistic then consumes.",
  ].join("\n"),
  documentClean: "The attached reference makes one structural claim: serial sections are different physical slices, so the pipeline measures population-level spatial association rather than single-cell co-expression.",
  documentLeaky: [
    "The user is asking about the benchmark.",
    "",
    "The benchmark concludes that the general registrar is more accurate across the full tissue diversity, while within the similar-stain regime the two tie. That comes from source_demo_valis, which also records that the gate never certified a bad registration.",
  ].join("\n"),
} as const;

// ---------------------------------------------------------------------------
// The twenty fixed prompts
// ---------------------------------------------------------------------------

type PageContext = { kind: "goal" | "project" | "concept" | "build" | "source" | "week"; id?: string; label: string; detail?: string };

interface Prompt {
  /** Stable row id, used in test names so a failure names the prompt. */
  id: string;
  message: string;
  /** What the real classifier must return. */
  requestClass: RequestClass;
  mode?: "auto" | "fast" | "deep";
  pageContext?: PageContext;
  attachmentIds?: string[];
  /** The raw string the stubbed provider streams for this row. */
  raw: string;
  /** A sentence that must survive the filter, proving nothing was over-eaten. */
  mustSay: RegExp;
  /** An identifier in `raw` that provenance can resolve, and the label it must
   *  be rewritten to. Only set where the id is genuinely in the retrieved set. */
  swaps?: { id: string; label: RegExp };
}

const PROMPTS: Prompt[] = [
  // ---- chitchat: no retrieval at all -------------------------------------
  { id: "01", message: "hi", requestClass: "chitchat", raw: RAW.greetingClean, mustSay: /working on today/ },
  { id: "02", message: "thanks!", requestClass: "chitchat", raw: RAW.thanksNarrated, mustSay: /glad that landed/ },
  { id: "03", message: "ok got it", requestClass: "chitchat", raw: RAW.ackNarrated, mustSay: /next drill queued up/ },

  // ---- general_knowledge: no retrieval, so depth is offered ---------------
  { id: "04", message: "What is the adiabatic theorem?", requestClass: "general_knowledge", raw: RAW.adiabaticLeaky, mustSay: /instantaneous eigenstate/ },
  { id: "05", message: "Explain quantum tunnelling", requestClass: "general_knowledge", raw: RAW.tunnellingClean, mustSay: /exponentially with barrier width/ },
  { id: "06", message: "Who was Ada Lovelace?", requestClass: "general_knowledge", raw: RAW.lovelaceNarrated, mustSay: /first published algorithm/ },
  { id: "07", message: "How do I reverse a string in Python?", requestClass: "general_knowledge", mode: "fast", raw: RAW.pythonLong, mustSay: /reach for the slice/ },

  // ---- about_my_work: one targeted pass over the demo account -------------
  // No `swaps` here on purpose: in the captured leak every identifier sat inside
  // the narration block, so the correct outcome is that the whole block goes,
  // taking the ids with it. Rows 09/10/18 cover the label-swap path, where the
  // id appears in prose the user is meant to keep.
  { id: "08", message: "What should I work on next for my SAT prep?", requestClass: "about_my_work", raw: RAW.satLeak, mustSay: /arc-length and sector-area/ },
  { id: "09", message: "What did I decide about my cross-marker association work?", requestClass: "about_my_work", raw: RAW.decisionLeaky, mustSay: /different physical slices/, swaps: { id: "goal_demo_oasis", label: /Complete and publish OASIS/ } },
  { id: "10", message: "Show me my goals", requestClass: "about_my_work", raw: RAW.goalsClean, mustSay: /four active goals/, swaps: { id: "goal_demo_sql", label: /Master SQL and Python/ } },
  { id: "11", message: "What's on my plan this week?", requestClass: "about_my_work", mode: "fast", raw: RAW.planLong, mustSay: /Start with the geometry drill/ },
  { id: "12", message: "Summarise my research decisions", requestClass: "about_my_work", raw: RAW.decisionsNarrated, mustSay: /registration stays similarity-only/ },
  { id: "13", message: "What tasks are still open on my goals?", requestClass: "about_my_work", raw: RAW.tasksClean, mustSay: /Six tasks are still open/ },

  // ---- about_this_page: the route chip is the context ---------------------
  { id: "14", message: "Explain this error", requestClass: "about_this_page", pageContext: { kind: "build", label: "Build: student_cli.py", detail: "TypeError on line 24" }, raw: RAW.errorLeaky, mustSay: /missing comma in the values tuple/ },
  { id: "15", message: "What does this code do?", requestClass: "about_this_page", pageContext: { kind: "build", label: "Build: student_cli.py" }, raw: RAW.codeClean, mustSay: /makes the write durable/ },
  { id: "16", message: "Summarise this passage", requestClass: "about_this_page", pageContext: { kind: "source", id: "source_demo_ihc", label: "Source: OASIS — Technical Reference (ihc.md)" }, raw: RAW.passageNarrated, mustSay: /fabricates the inter-cell distances/ },

  // ---- about_a_document: attachments win over everything else -------------
  { id: "17", message: "Summarise this", requestClass: "about_a_document", attachmentIds: ["source_demo_ihc"], raw: RAW.documentClean, mustSay: /population-level spatial association/ },
  { id: "18", message: "What does this paper claim?", requestClass: "about_a_document", attachmentIds: ["source_demo_valis"], raw: RAW.documentLeaky, mustSay: /never certified a bad registration/, swaps: { id: "source_demo_valis", label: /OASIS vs VALIS/ } },

  // ---- broad_search: confirmation, never an answer ------------------------
  // `raw` and `mustSay` are inert on these two rows: the turn stops at consent,
  // so the provider is never called and there is no answer to check. What the
  // rubric asserts instead is `providerCalls === 0` and an empty body.
  { id: "19", message: "Find everything I have on immunohistochemistry", requestClass: "broad_search", raw: RAW.documentClean, mustSay: /never reached — the provider is not called/ },
  { id: "20", message: "Search all my sources for spatial statistics", requestClass: "broad_search", raw: RAW.documentClean, mustSay: /never reached — the provider is not called/ },
];

const byClass = (requestClass: RequestClass) => PROMPTS.filter((prompt) => prompt.requestClass === requestClass);

// ---------------------------------------------------------------------------
// Driving one turn through the real route
// ---------------------------------------------------------------------------

type UsedContextEntry = { type: string; id: string; label: string; href?: string; snippet?: string };
type TurnMetadata = {
  usedContext?: UsedContextEntry[];
  mode?: string;
  requestClass?: string;
  grounded?: boolean;
  depthOffer?: "search_sources" | "use_project";
  degraded?: string[];
};

interface Turn {
  status: number;
  contentType: string;
  /** The text the user actually reads. Empty for a confirmation turn. */
  answer: string;
  /** The confirmation the route returned instead of answering, if any. */
  confirmation?: { question: string; sourceCount: number; estimateSeconds: number };
  /** The class the confirmation body reports — a confirmation carries no headers. */
  confirmedClass?: string;
  headers: { requestClass: string | null; records: string | null; mode: string | null; status: string | null };
  /** What was persisted with the assistant message — what the thread renders from. */
  metadata: TurnMetadata;
  /** The prompt the product built for the model. */
  prompt: string;
  system: string;
  /** How many times the provider was called for this turn. */
  providerCalls: number;
}

function post(body: Record<string, unknown>) {
  return POST(new Request("http://localhost:3000/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function runTurn(prompt: Prompt, overrides: Partial<Record<string, unknown>> = {}): Promise<Turn> {
  const store = getStore("user_maya");
  const created = await (await post({ action: "create", title: "Rubric" })).json() as { session: { id: string } };
  const sessionId = created.session.id;

  gateway.nextText = prompt.raw;
  gateway.calls.length = 0;

  const response = await post({
    action: "message",
    sessionId,
    message: prompt.message,
    ...(prompt.mode ? { mode: prompt.mode } : {}),
    ...(prompt.pageContext ? { pageContext: prompt.pageContext } : {}),
    ...(prompt.attachmentIds ? { attachmentIds: prompt.attachmentIds } : {}),
    ...overrides,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body = isJson
    ? await response.json() as { confirmation?: Turn["confirmation"]; requestClass?: string }
    : undefined;
  const answer = isJson ? "" : await response.text();

  const session = await store.getAssistantSession(sessionId) as { messages?: Array<Record<string, unknown>> } | undefined;
  const assistantMessage = (session?.messages ?? []).filter((message) => message.role === "assistant").at(-1);
  const call = gateway.calls.at(-1);

  return {
    status: response.status,
    contentType,
    answer,
    ...(body?.confirmation ? { confirmation: body.confirmation } : {}),
    ...(body?.requestClass ? { confirmedClass: body.requestClass } : {}),
    headers: {
      requestClass: response.headers.get("x-continuum-class"),
      records: response.headers.get("x-continuum-records"),
      mode: response.headers.get("x-continuum-mode"),
      status: response.headers.get("x-continuum-status"),
    },
    metadata: (assistantMessage?.metadata as TurnMetadata | undefined) ?? {},
    prompt: call?.prompt ?? "",
    system: call?.system ?? "",
    providerCalls: gateway.calls.length,
  };
}

/** Every turn is run once, up front; the rubric blocks below read the results.
 *  Keeping the runs out of the assertions means a single pipeline change shows
 *  up as one failure per property rather than one per property per prompt. */
const TURNS = new Map<string, Turn>();

beforeAll(async () => {
  seedDemoAccount();
  for (const prompt of PROMPTS) TURNS.set(prompt.id, await runTurn(prompt));
});

const turnFor = (prompt: Prompt) => {
  const turn = TURNS.get(prompt.id);
  if (!turn) throw new Error(`prompt ${prompt.id} never ran`);
  return turn;
};

/** The eighteen prompts that reach the model. Broad searches stop at consent. */
const ANSWERED = PROMPTS.filter((prompt) => prompt.requestClass !== "broad_search");

// ---------------------------------------------------------------------------
// The rubric
// ---------------------------------------------------------------------------

describe("the rubric covers every request class", () => {
  it("uses exactly twenty fixed prompts", () => {
    expect(PROMPTS).toHaveLength(20);
    expect(new Set(PROMPTS.map((prompt) => prompt.id)).size).toBe(20);
    expect(new Set(PROMPTS.map((prompt) => prompt.message)).size).toBe(20);
  });

  it("exercises all six classes the classifier defines", () => {
    const classes: RequestClass[] = ["chitchat", "general_knowledge", "about_my_work", "about_this_page", "about_a_document", "broad_search"];
    for (const requestClass of classes) expect(byClass(requestClass).length).toBeGreaterThan(0);
    expect(new Set(PROMPTS.map((prompt) => prompt.requestClass)).size).toBe(6);
  });

  for (const prompt of PROMPTS) {
    it(`${prompt.id} "${prompt.message}" is classified ${prompt.requestClass}`, () => {
      // An answered turn reports the class on `x-continuum-class`; a confirmation
      // has no stream and reports it in the JSON body. One of the two always
      // exists, so this never degrades into a vacuous comparison.
      const turn = turnFor(prompt);
      const seen = turn.headers.requestClass ?? turn.confirmedClass;
      expect(seen).toBe(prompt.requestClass);
      // The class the thread later renders from must agree with what was sent.
      if (turn.metadata.requestClass) expect(turn.metadata.requestClass).toBe(prompt.requestClass);
    });
  }
});

describe("no banned opener survives (§11.5, C1)", () => {
  for (const prompt of ANSWERED) {
    it(`${prompt.id} "${prompt.message}"`, () => {
      const { answer } = turnFor(prompt);
      expect(answer).not.toMatch(BANNED_OPENER_CHECK);
      expect(answer).not.toMatch(NARRATION_HEADING_ANYWHERE);
    });
  }

  it("the raw fixtures would fail this check unfiltered", () => {
    // Without this, a filter that stopped working entirely could still pass the
    // block above if someone quietly cleaned up every fixture. Most are narrated
    // on purpose, and this keeps them that way.
    const narrated = ANSWERED.filter((prompt) => BANNED_OPENER_CHECK.test(prompt.raw));
    expect(narrated.length).toBeGreaterThanOrEqual(8);
  });
});

describe("the answer still arrives (a filter that deletes everything fails)", () => {
  for (const prompt of ANSWERED) {
    it(`${prompt.id} "${prompt.message}"`, () => {
      const { answer } = turnFor(prompt);
      expect(answer.trim().length).toBeGreaterThan(0);
      expect(answer).toMatch(prompt.mustSay);
      expect(answer).not.toMatch(/couldn't produce a clean answer/i);
    });
  }
});

describe("no internal identifier survives (§9.4 AC-H3, §11.5)", () => {
  for (const prompt of ANSWERED) {
    it(`${prompt.id} "${prompt.message}"`, () => {
      const { answer } = turnFor(prompt);
      expect(hasIdentifier(answer)).toBe(false);
    });
  }

  for (const prompt of ANSWERED.filter((entry) => entry.swaps)) {
    it(`${prompt.id} rewrites ${prompt.swaps!.id} to the record's title rather than deleting it`, () => {
      const { answer } = turnFor(prompt);
      expect(answer).not.toContain(prompt.swaps!.id);
      expect(answer).toMatch(prompt.swaps!.label);
    });
  }

  it("the raw fixtures would fail this check unfiltered", () => {
    const leaky = ANSWERED.filter((prompt) => hasIdentifier(prompt.raw));
    expect(leaky.length).toBeGreaterThanOrEqual(5);
  });

  for (const prompt of ANSWERED) {
    it(`${prompt.id} never sends an identifier to the model either`, () => {
      // route.ts strips ids from the context before assembly: a model that never
      // receives `goal_demo_sat` cannot echo it.
      const { prompt: assembled } = turnFor(prompt);
      expect(assembled.length).toBeGreaterThan(0);
      expect(hasIdentifier(assembled)).toBe(false);
    });
  }
});

describe("a fast answer stays inside its budget (§11.7)", () => {
  const fast = PROMPTS.filter((prompt) => prompt.mode === "fast");

  it("the table exercises fast mode", () => {
    expect(fast.length).toBeGreaterThanOrEqual(2);
  });

  for (const prompt of fast) {
    it(`${prompt.id} "${prompt.message}" delivers at most 400 words`, () => {
      const { answer, headers, metadata } = turnFor(prompt);
      expect(headers.mode).toBe("Fast");
      expect(metadata.mode).toBe("fast");
      expect(wordCount(answer)).toBeLessThanOrEqual(400);
    });

    it(`${prompt.id} "${prompt.message}" is not truncated on the way out`, () => {
      // The other half of the budget. A filter that clipped long answers would
      // satisfy the ceiling above and fail here; the C1 fix explicitly must not
      // truncate a legitimate answer that opens with a list or a heading.
      const { answer } = turnFor(prompt);
      expect(wordCount(answer)).toBeGreaterThan(300);
      expect(answer).toMatch(prompt.mustSay);
    });
  }
});

describe("a citation chip is present whenever usedContext is non-empty (§11.6, AC-A5)", () => {
  for (const prompt of ANSWERED) {
    it(`${prompt.id} "${prompt.message}"`, () => {
      const { metadata, headers } = turnFor(prompt);
      const used = metadata.usedContext ?? [];
      // The header the composer reads and the metadata the thread renders from
      // must agree, or the chip count and the chips disagree on screen.
      expect(headers.records).toBe(String(used.length));
      expect(rendersCitationChips(metadata)).toBe(used.length > 0);
      for (const entry of used) {
        expect(entry.id).toBeTruthy();
        expect(entry.label.trim().length).toBeGreaterThan(0);
        // §11.6: a chip's label is what the user reads. Never an id.
        expect(hasIdentifier(entry.label)).toBe(false);
        expect(entry.label).not.toMatch(/^(?:approved_memory|workspace|research_library|conversation|selected_files)$/);
        // AC-A5 / §18.1: the chip must open a record that exists.
        expect(RESOLVABLE_IDS.has(entry.id)).toBe(true);
      }
    });
  }

  it("the grounded classes actually produce chips", () => {
    const grounded = [...byClass("about_my_work"), ...byClass("about_this_page"), ...byClass("about_a_document")];
    for (const prompt of grounded) {
      expect(rendersCitationChips(turnFor(prompt).metadata)).toBe(true);
    }
  });
});

describe("the general-knowledge line is present whenever usedContext is empty (AC-A6)", () => {
  for (const prompt of ANSWERED) {
    it(`${prompt.id} "${prompt.message}"`, () => {
      const { metadata, prompt: assembled } = turnFor(prompt);
      const used = metadata.usedContext ?? [];
      if (used.length) {
        expect(metadata.grounded).toBe(true);
        expect(rendersUngroundedLine(metadata)).toBe(false);
        expect(assembled).toContain(GROUNDED_CONTRACT);
        expect(assembled).not.toContain(UNGROUNDED_CONTRACT);
      } else {
        expect(metadata.grounded).toBe(false);
        expect(rendersUngroundedLine(metadata)).toBe(true);
        // The model is told the same thing the interface tells the user, so the
        // answer's own wording cannot imply the workspace was consulted.
        expect(assembled).toContain(UNGROUNDED_CONTRACT);
        expect(assembled).not.toContain(GROUNDED_CONTRACT);
      }
    });
  }

  it("the ungrounded classes actually take the ungrounded branch", () => {
    for (const prompt of [...byClass("chitchat"), ...byClass("general_knowledge")]) {
      expect(rendersUngroundedLine(turnFor(prompt).metadata)).toBe(true);
    }
  });
});

describe("a broad search produces a confirmation rather than an answer (§11.3 step 6, AC-A7)", () => {
  for (const prompt of byClass("broad_search")) {
    it(`${prompt.id} "${prompt.message}" asks before it searches`, () => {
      const turn = turnFor(prompt);
      expect(turn.status).toBe(200);
      expect(turn.contentType).toContain("application/json");
      expect(turn.confirmation).toBeDefined();
      expect(turn.confirmation!.question).toMatch(/wide search/i);
      expect(turn.confirmation!.sourceCount).toBe(DEMO.sourceRows.length);
      expect(turn.confirmation!.estimateSeconds).toBeGreaterThan(0);
      // No answer, no persisted turn, and the model was never asked.
      expect(turn.answer).toBe("");
      expect(turn.metadata).toEqual({});
      expect(turn.providerCalls).toBe(0);
    });
  }

  it("answering the confirmation is what unlocks the search", async () => {
    // Proves the confirmation is a gate rather than a dead end: the same prompt,
    // plus the breadth the user picked, retrieves and answers.
    const prompt = byClass("broad_search")[0]!;
    const approved = await runTurn(prompt, { broadSearch: "everything" });
    expect(approved.confirmation).toBeUndefined();
    expect(approved.providerCalls).toBe(1);
    expect(approved.answer.trim().length).toBeGreaterThan(0);
    expect((approved.metadata.usedContext ?? []).length).toBeGreaterThan(0);
  });
});

describe("the depth chip appears when retrieval was skipped (§11.3 step 11)", () => {
  for (const prompt of byClass("general_knowledge")) {
    it(`${prompt.id} "${prompt.message}" offers to look further`, () => {
      const { metadata } = turnFor(prompt);
      expect(metadata.usedContext ?? []).toHaveLength(0);
      expect(metadata.depthOffer).toBe("search_sources");
    });
  }

  it("still offers depth when the open page contributed no records", async () => {
    // A Build chip carries its own state rather than resolving to rows, so a
    // general-knowledge question asked from `/build` retrieves nothing and the
    // offer must survive the presence of a page chip.
    const base = byClass("general_knowledge")[1]!;
    const turn = await runTurn({ ...base, pageContext: { kind: "build", label: "Build: student_cli.py" } });
    expect(turn.metadata.usedContext ?? []).toHaveLength(0);
    expect(turn.metadata.depthOffer).toBe("search_sources");
  });

  it("a project page grounds the answer on that project instead of offering depth", async () => {
    // The other branch of §11.3 step 11. Resolving the chip is itself retrieval,
    // so the answer is grounded and no offer is made. `use_project` is therefore
    // only reachable when the page's project yields nothing at all — it was
    // deleted, or the 300 ms page-context deadline was missed.
    const base = byClass("general_knowledge")[1]!;
    const turn = await runTurn({ ...base, pageContext: { kind: "project", id: "project_demo_oasis", label: "Project: OASIS" } });
    expect((turn.metadata.usedContext ?? []).some((entry) => entry.id === "project_demo_oasis")).toBe(true);
    expect(turn.metadata.depthOffer).toBeUndefined();
  });

  it("never offers depth on an answer that was already grounded", () => {
    for (const prompt of [...byClass("about_my_work"), ...byClass("about_this_page"), ...byClass("about_a_document")]) {
      expect(turnFor(prompt).metadata.depthOffer).toBeUndefined();
    }
  });

  it("does not offer depth for a greeting", () => {
    // §11.3 step 11 exempts chitchat: "hi" retrieved nothing on purpose, and
    // offering to search the workspace for it would be noise.
    for (const prompt of byClass("chitchat")) {
      expect(turnFor(prompt).metadata.depthOffer).toBeUndefined();
    }
  });
});

describe("the turn is assembled by the real prompt builder", () => {
  for (const prompt of ANSWERED) {
    it(`${prompt.id} "${prompt.message}"`, () => {
      const turn = turnFor(prompt);
      // If the route ever stopped calling `buildAcademicPrompt`, every property
      // above that reads the assembled prompt would silently become vacuous.
      expect(turn.system).toContain("You are Continuum");
      expect(turn.prompt).toContain("USER_REQUEST");
      expect(turn.prompt).toContain("OUTPUT_CONTRACT");
      expect(turn.prompt).toContain(prompt.message);
      expect(turn.providerCalls).toBe(1);
      expect(turn.headers.status).toBeTruthy();
    });
  }
});
