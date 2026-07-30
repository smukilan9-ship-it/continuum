import { beforeEach, describe, expect, it } from "vitest";
import { POST as memory } from "../apps/web/app/api/memory/route";
import { demoStore } from "../apps/web/lib/demo-store";
import { getStore } from "../apps/web/lib/store";

/**
 * Forget — redesign.md §9.9 AC-CX3.
 *
 * "Forget removes the record from a subsequent assistant answer's context."
 * That is a claim about retrieval, not about a list, so these cases assert the
 * two reads an answer is actually built from — `searchMemory` (the assistant's
 * recall) and `searchWorkspace` (the palette and cross-object search) — and
 * they assert it for both shapes a `/context` row can carry: a durable record
 * and a retrieved passage.
 *
 * The store is the in-memory adapter, which §16.8 requires to behave the same
 * as Neon; the flags it sets (`superseded`, `deleted`) are the same two every
 * Neon read already filters on.
 */

const phrase = "grouped held-out validation by patient";

function reset() {
  demoStore.events.length = 0;
  demoStore.memoryChunks.length = 0;
  demoStore.memoryRecords.length = 0;
  demoStore.goals.length = 0;
  demoStore.tasks.length = 0;
  demoStore.projects.length = 0;
  demoStore.sources.length = 0;
  demoStore.papers.length = 0;
  demoStore.notes.length = 0;
  demoStore.assistantSessions.length = 0;
}

async function remember(summary: string, entityId = "decision_validation") {
  return getStore("user_maya").appendEvent({
    type: "research.decision.saved",
    summary,
    entityIds: [entityId],
    payload: { text: summary },
  });
}

function forgetRequest(recordId: unknown) {
  return new Request("http://localhost/api/memory", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "forget", recordId }),
  });
}

describe("forget a remembered record", () => {
  beforeEach(reset);

  it("keeps a remembered record retrievable until it is forgotten", async () => {
    await remember(`Use ${phrase}.`);
    const store = getStore("user_maya");
    expect(await store.searchMemory({ query: phrase })).toHaveLength(1);
    expect((await store.searchWorkspace({ query: phrase })).some((hit) => hit.kind === "memory")).toBe(true);
  });

  it("excludes a forgotten passage from the next searchMemory and searchWorkspace", async () => {
    await remember(`Use ${phrase}.`);
    const store = getStore("user_maya");
    const [chunk] = await store.searchMemory({ query: phrase });
    expect(chunk).toBeDefined();

    const forgotten = await store.forgetMemoryRecord(chunk!.id);
    expect(forgotten).toMatchObject({ kind: "passage" });
    expect(forgotten!.passages).toBeGreaterThan(0);

    expect(await store.searchMemory({ query: phrase })).toEqual([]);
    expect(await store.searchWorkspace({ query: phrase })).toEqual([]);
  });

  it("excludes a forgotten record's passages too, so the list and retrieval cannot disagree", async () => {
    await remember(`Use ${phrase}.`);
    const store = getStore("user_maya");
    const record = demoStore.memoryRecords.find((row) => row.type === "research.decision.saved");
    expect(record).toBeDefined();

    const forgotten = await store.forgetMemoryRecord(record!.id);
    expect(forgotten).toMatchObject({ kind: "record" });
    // Forgetting the record must reach the passage that shares its event;
    // otherwise the row disappears from /context and the assistant keeps citing it.
    expect(forgotten!.passages).toBeGreaterThan(0);
    expect(await store.searchMemory({ query: phrase })).toEqual([]);
    expect(await store.searchWorkspace({ query: phrase })).toEqual([]);
  });

  it("removes the record from the screen's own read as well", async () => {
    await remember(`Use ${phrase}.`);
    const store = getStore("user_maya");
    const before = await store.workspace("memory") as { memoryRecords: Array<{ id: string }> };
    expect(before.memoryRecords).toHaveLength(1);

    await store.forgetMemoryRecord(before.memoryRecords[0]!.id);
    const after = await store.workspace("memory") as { memoryRecords: unknown[]; memoryChunks: unknown[] };
    expect(after.memoryRecords).toEqual([]);
    expect(after.memoryChunks).toEqual([]);
  });

  it("leaves every other record alone", async () => {
    await remember(`Use ${phrase}.`);
    await remember("Use a fixed random seed for every run.", "decision_seed");
    const store = getStore("user_maya");
    const [target] = await store.searchMemory({ query: phrase });

    await store.forgetMemoryRecord(target!.id);
    expect(await store.searchMemory({ query: phrase })).toEqual([]);
    expect(await store.searchMemory({ query: "fixed random seed" })).toHaveLength(1);
  });

  it("is permanent — forgetting twice reports nothing left to forget", async () => {
    await remember(`Use ${phrase}.`);
    const store = getStore("user_maya");
    const [chunk] = await store.searchMemory({ query: phrase });
    expect(await store.forgetMemoryRecord(chunk!.id)).toBeTruthy();
    expect(await store.forgetMemoryRecord(chunk!.id)).toBeUndefined();
  });

  it("returns nothing for an id the workspace never held", async () => {
    expect(await getStore("user_maya").forgetMemoryRecord("record_not_a_real_id")).toBeUndefined();
  });
});

describe("POST /api/memory { action: 'forget' }", () => {
  beforeEach(reset);

  it("forgets through the route and reports what it removed", async () => {
    await remember(`Use ${phrase}.`);
    const store = getStore("user_maya");
    const [chunk] = await store.searchMemory({ query: phrase });

    const response = await memory(forgetRequest(chunk!.id));
    expect(response.status).toBe(200);
    const body = await response.json() as { forgotten: { records: number; passages: number } };
    expect(body.forgotten.passages).toBeGreaterThan(0);
    expect(await store.searchMemory({ query: phrase })).toEqual([]);
  });

  it("does not echo the forgotten text into the audit trail", async () => {
    await remember(`Use ${phrase}.`);
    const store = getStore("user_maya");
    const [chunk] = await store.searchMemory({ query: phrase });
    await memory(forgetRequest(chunk!.id));

    // An audit event is written, so the removal is accountable — but writing the
    // forgotten wording into it would immediately re-index what was just erased.
    const audit = demoStore.events.find((event) => event.type === "memory.record.forgotten");
    expect(audit).toBeDefined();
    expect(JSON.stringify(audit)).not.toContain(phrase);
    const live = demoStore.memoryChunks.filter((row) => !row.superseded && !row.deleted);
    expect(live.length).toBeGreaterThan(0);
    for (const remaining of live) expect(remaining.content).not.toContain(phrase);
    expect(await store.searchMemory({ query: phrase })).toEqual([]);
  });

  it("answers 404 for a record the caller does not have", async () => {
    const response = await memory(forgetRequest("record_absent_from_this_workspace"));
    expect(response.status).toBe(404);
    expect((await response.json() as { error: string }).error).toMatch(/no longer holds/i);
  });

  it("rejects a malformed forget request without touching anything", async () => {
    await remember(`Use ${phrase}.`);
    const response = await memory(forgetRequest(""));
    expect(response.status).toBe(400);
    expect(await getStore("user_maya").searchMemory({ query: phrase })).toHaveLength(1);
  });

  it("still answers a search request on the same endpoint", async () => {
    await remember(`Use ${phrase}.`);
    const response = await memory(new Request("http://localhost/api/memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "search", query: phrase, limit: 5 }),
    }));
    expect(response.status).toBe(200);
    expect((await response.json() as { results: unknown[] }).results).toHaveLength(1);
  });
});
