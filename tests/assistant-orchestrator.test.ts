import { describe, expect, it } from "vitest";
import { orchestrate, AttachmentAccessError, DEADLINES } from "../apps/web/lib/assistant/orchestrator";
import type { Store } from "../apps/web/lib/store";

/**
 * §11.3's contract, asserted at the seam the route calls.
 *
 * The properties that matter here are refusals: what the orchestrator must
 * *not* do. AC-A3 (a greeting performs zero retrieval), AC-A6 (an ungrounded
 * answer is marked as such), and AC-A7 (a wide search asks first) are all
 * negative guarantees, so each is asserted with a call counter rather than by
 * inspecting the returned context.
 */

type Calls = { read: string[]; searchMemory: number; listSources: number; listSourceChunks: number };

function fakeStore(overrides: Partial<Record<keyof Store, unknown>> = {}) {
  const calls: Calls = { read: [], searchMemory: 0, listSources: 0, listSourceChunks: 0 };
  const store = {
    kind: "memory" as const,
    userId: "user_maya",
    async read(name: string) {
      calls.read.push(name);
      if (name === "load_context") {
        return {
          activeGoals: [{ id: "goal_sat", title: "Raise SAT score" }],
          activeProjects: [{ id: "project_oasis", title: "OASIS" }],
          currentTasks: [],
          acceptedDecisions: [{ id: "decision_1", text: "Use cross-marker association" }],
        };
      }
      if (name === "load_goal") return { goal: { id: "goal_sat", title: "Raise SAT score" }, tasks: [] };
      if (name === "load_project") return { project: { id: "project_oasis", title: "OASIS" }, decisions: [] };
      return {};
    },
    async searchMemory() {
      calls.searchMemory += 1;
      return [
        { id: "mchunk_1", kind: "project_decision", content: "Decided on cross-marker association.", occurredAt: new Date().toISOString(), importance: 0.8, tokenEstimate: 20, sourceEventIds: [], metadata: {}, score: 0.82 },
      ];
    },
    async listSources() { calls.listSources += 1; return [{ id: "source_1", title: "Stack et al. 2014" }]; },
    async listSourceChunks() { calls.listSourceChunks += 1; return [{ id: "chunk_1", sourceId: "source_1", sourceTitle: "Stack et al. 2014", passage: 3, text: "Multiplexed staining permits…", contentHash: "h", sourceVersion: 1, deleted: false, reference: "Stack et al. 2014 · passage 3" }]; },
    async getLearningState() { return { conceptId: "concept_1", status: "developing" }; },
    ...overrides,
  } as unknown as Store;
  return { store, calls };
}

describe("assistant orchestrator", () => {
  it("AC-A3: a greeting performs zero retrieval calls", async () => {
    const { store, calls } = fakeStore();
    const result = await orchestrate({ store, message: "hi", attachmentIds: [], history: [] });
    expect(result.classification.requestClass).toBe("chitchat");
    expect(calls.read).toEqual([]);
    expect(calls.searchMemory).toBe(0);
    expect(result.usedContext).toEqual([]);
  });

  it("a general-knowledge question retrieves nothing either", async () => {
    const { store, calls } = fakeStore();
    const result = await orchestrate({ store, message: "What is the adiabatic theorem?", attachmentIds: [], history: [] });
    expect(result.classification.requestClass).toBe("general_knowledge");
    expect(calls.read).toEqual([]);
    expect(calls.searchMemory).toBe(0);
  });

  it("AC-A6: an answer with no workspace match is reported as ungrounded and offered depth", async () => {
    const { store } = fakeStore();
    const result = await orchestrate({ store, message: "What is the adiabatic theorem?", attachmentIds: [], history: [] });
    expect(result.groundedInWorkspace).toBe(false);
    expect(result.depthOffer).toBe("search_sources");
  });

  it("AC-A7: a broad query asks before searching, and retrieves nothing until it is answered", async () => {
    const { store, calls } = fakeStore();
    const result = await orchestrate({ store, message: "everything I have on immunohistochemistry", attachmentIds: [], history: [] });
    expect(result.confirmation).toBeDefined();
    expect(result.confirmation?.question).toMatch(/wide search/i);
    // `listSources` is only the count shown in the question; nothing was read.
    expect(calls.read).toEqual([]);
    expect(calls.searchMemory).toBe(0);
    expect(result.usedContext).toEqual([]);
  });

  it("runs the wide search once the user approves it", async () => {
    const { store, calls } = fakeStore();
    const result = await orchestrate({ store, message: "everything I have on immunohistochemistry", attachmentIds: [], history: [], broadSearch: "everything" });
    expect(result.confirmation).toBeUndefined();
    expect(calls.searchMemory).toBe(1);
    expect(result.usedContext.length).toBeGreaterThan(0);
  });

  it("a workspace question runs exactly one targeted pass", async () => {
    const { store, calls } = fakeStore();
    const result = await orchestrate({ store, message: "what did I decide about my project?", attachmentIds: [], history: [] });
    expect(result.classification.requestClass).toBe("about_my_work");
    expect(calls.read).toEqual(["load_context"]);
    expect(calls.searchMemory).toBe(1);
    expect(result.groundedInWorkspace).toBe(true);
  });

  it("§11.3 step 2: a follow-up whose referent is already on screen costs no retrieval", async () => {
    const { store, calls } = fakeStore();
    const result = await orchestrate({
      store,
      message: "why?",
      attachmentIds: [],
      history: [{ role: "assistant", content: "Because…", usedContext: [{ id: "mchunk_1", label: "Cross-marker association" }] }],
    });
    expect(calls.read).toEqual([]);
    expect(calls.searchMemory).toBe(0);
  });

  it("AC-A5: provenance carries real record ids, never scope names", async () => {
    const { store } = fakeStore();
    const result = await orchestrate({ store, message: "what did I decide about my project?", attachmentIds: [], history: [] });
    for (const entry of result.usedContext) {
      expect(entry.id).toMatch(/^[a-z]+_/);
      expect(entry.label).not.toMatch(/approved_memory|workspace|research_library/);
    }
  });

  it("§11.6: a record the user excluded never returns in provenance", async () => {
    const { store } = fakeStore();
    const before = await orchestrate({ store, message: "what did I decide about my project?", attachmentIds: [], history: [] });
    expect(before.usedContext.some((entry) => entry.id === "mchunk_1")).toBe(true);
    const after = await orchestrate({ store, message: "what did I decide about my project?", attachmentIds: [], history: [], excludedRecordIds: ["mchunk_1"] });
    expect(after.usedContext.some((entry) => entry.id === "mchunk_1")).toBe(false);
  });

  it("caps provenance at eight records", async () => {
    const { store } = fakeStore({
      async searchMemory() {
        return Array.from({ length: 30 }, (_, index) => ({
          id: `mchunk_${index}`, kind: "note", content: `Chunk ${index}`, occurredAt: new Date().toISOString(),
          importance: 0.5, tokenEstimate: 10, sourceEventIds: [], metadata: {}, score: 0.9,
        }));
      },
    });
    const result = await orchestrate({ store, message: "what did I decide about my project?", attachmentIds: [], history: [] });
    expect(result.usedContext.length).toBeLessThanOrEqual(8);
  });

  it("drops candidates below the similarity floor rather than padding to a count", async () => {
    const { store } = fakeStore({
      async searchMemory() {
        return [
          { id: "mchunk_good", kind: "note", content: "Relevant", occurredAt: new Date().toISOString(), importance: 0.5, tokenEstimate: 10, sourceEventIds: [], metadata: {}, score: 0.9 },
          { id: "mchunk_weak", kind: "note", content: "Barely related", occurredAt: new Date().toISOString(), importance: 0.5, tokenEstimate: 10, sourceEventIds: [], metadata: {}, score: 0.11 },
        ];
      },
    });
    const result = await orchestrate({ store, message: "what did I decide about my project?", attachmentIds: [], history: [] });
    expect(result.usedContext.some((entry) => entry.id === "mchunk_good")).toBe(true);
    expect(result.usedContext.some((entry) => entry.id === "mchunk_weak")).toBe(false);
  });

  it("attaches the page's records when a route chip is supplied (§11.3 step 3)", async () => {
    const { store, calls } = fakeStore();
    const result = await orchestrate({
      store,
      message: "what should I do next here?",
      attachmentIds: [],
      history: [],
      pageContext: { kind: "goal", id: "goal_sat", label: "Goal: Raise SAT score" },
    });
    expect(calls.read).toContain("load_goal");
    expect(result.statusLabel).toContain("Raise SAT score");
  });

  it("rejects an attachment id the user does not own", async () => {
    const { store } = fakeStore({ async listSources() { return []; } });
    await expect(orchestrate({ store, message: "summarise this", attachmentIds: ["source_other"], history: [] }))
      .rejects.toBeInstanceOf(AttachmentAccessError);
  });

  it("degrades on a retrieval deadline instead of blocking the answer", async () => {
    const { store } = fakeStore({
      async searchMemory() { return new Promise(() => { /* never settles */ }); },
    });
    const started = Date.now();
    const result = await orchestrate({ store, message: "what did I decide about my project?", attachmentIds: [], history: [] });
    // It returned, and it named what it lost rather than implying full reach.
    expect(Date.now() - started).toBeLessThan(DEADLINES.retrieval + 1_500);
    expect(result.degraded).toContain("memory retrieval");
  });

  it("names the step it is on rather than showing an unexplained spinner (§11.9)", async () => {
    const { store } = fakeStore();
    const chat = await orchestrate({ store, message: "hi", attachmentIds: [], history: [] });
    expect(chat.statusLabel).toBe("Thinking…");
    const work = await orchestrate({ store, message: "what did I decide about my goals?", attachmentIds: [], history: [] });
    expect(work.statusLabel).toMatch(/Looking through/);
  });
});

/**
 * §11.6: clicking a citation chip must open the record. The inspector's
 * **Open** action is half of what makes provenance checkable — a chip you can
 * read but not follow is still just a claim.
 *
 * These were the pre-rename addresses, so every chip cost a redirect, and
 * `memory` — the most common type, since it is what `searchMemory` returns —
 * had no destination at all and rendered the inspector without Open.
 */
describe("provenance destinations", () => {
  it("gives every retrieved record a §7.1 address", async () => {
    const { store } = fakeStore();
    const result = await orchestrate({ store, message: "what did I decide about my project?", attachmentIds: [], history: [] });
    expect(result.usedContext.length).toBeGreaterThan(0);
    for (const entry of result.usedContext) {
      expect(entry.href, `${entry.type} has no destination`).toBeTruthy();
      expect(entry.href).toMatch(/^\/(g|plan|research|library|learn|context)\b/);
      // None of the pre-rename paths survive.
      expect(entry.href).not.toMatch(/^\/(goals|memory|assistant|code|today|activity|integrations|account)\b/);
    }
  });

  it("routes an attachment to the Library entry for that source", async () => {
    const { store } = fakeStore();
    const result = await orchestrate({ store, message: "summarise this", attachmentIds: ["source_1"], history: [] });
    const attachment = result.usedContext.find((entry) => entry.type === "attachment");
    expect(attachment?.href).toBe("/library?tab=sources&source=source_1");
  });
});
