import { describe, expect, it } from "vitest";
import { POST as learn } from "../apps/web/app/api/learning/route";
import { POST as schedule } from "../apps/web/app/api/schedule/route";
import { DELETE as deleteSource, POST as ingestSource } from "../apps/web/app/api/sources/route";
import { POST as retrieve } from "../apps/web/app/api/retrieval/route";

function jsonRequest(url: string, body: unknown) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("wired application routes", () => {
  it("diagnoses, preserves transfer on reading, then raises it after a correct unseen checkpoint", async () => {
    const diagnosisResponse = await learn(jsonRequest("http://localhost/api/learning", {
      action: "diagnose",
      liveAi: false,
      answers: [
        { itemId: "item_potential_1", selectedIndex: 0 },
        { itemId: "item_potential_2", selectedIndex: 2 },
        { itemId: "item_potential_3", selectedIndex: 1 },
      ],
    }));
    expect(diagnosisResponse.status).toBe(200);
    const diagnosis = await diagnosisResponse.json() as { result: { misconception?: unknown }; mastery: { transfer: number } };
    expect(diagnosis.result.misconception).toBeTruthy();

    const readResponse = await learn(jsonRequest("http://localhost/api/learning", { action: "lesson_read" }));
    const read = await readResponse.json() as { mastery: { transfer: number }; transferChanged: boolean };
    expect(read.transferChanged).toBe(false);
    expect(read.mastery.transfer).toBe(diagnosis.mastery.transfer);

    const checkpointResponse = await learn(jsonRequest("http://localhost/api/learning", { action: "checkpoint", answer: "24" }));
    const checkpoint = await checkpointResponse.json() as { correct: boolean; attemptId: string; mastery: { transfer: number; explanation: string } };
    expect(checkpoint.correct).toBe(true);
    expect(checkpoint.attemptId).toMatch(/^attempt_checkpoint_/);
    expect(checkpoint.mastery.transfer).toBeGreaterThan(read.mastery.transfer);
    expect(checkpoint.mastery.explanation).toMatch(/unseen/i);
  });

  it("returns a real solver proposal and preserves unaffected work during replan", async () => {
    const proposedResponse = await schedule(jsonRequest("http://localhost/api/schedule", { action: "propose" }));
    const proposed = await proposedResponse.json() as { proposal: { blocks: Array<{ id: string; taskId: string; status: string; start: string; end: string }>; explanation: string[] } };
    expect(proposed.proposal.explanation[0]).toMatch(/deterministically/i);
    const first = proposed.proposal.blocks[0]!;
    first.status = "done";
    const research = proposed.proposal.blocks.find((block) => block.taskId === "task_research")!;
    const replannedResponse = await schedule(jsonRequest("http://localhost/api/schedule", { action: "replan", current: proposed.proposal, missedBlockId: research.id }));
    const replanned = await replannedResponse.json() as { proposal: { preservedBlockIds: string[]; blocks: Array<{ id: string; taskId: string; status: string }> } };
    expect(replanned.proposal.preservedBlockIds).toContain(first.id);
    expect(replanned.proposal.blocks.find((block) => block.id === first.id)?.status).toBe("done");
    for (const taskId of new Set(proposed.proposal.blocks.filter((block) => block.id !== research.id && Date.parse(block.end) <= Date.parse(research.start)).map((block) => block.taskId))) {
      expect(replanned.proposal.blocks.filter((block) => block.taskId === taskId)).toHaveLength(1);
    }
  });

  it("persists an uploaded source, reuses duplicates, retrieves its exact chunk, and excludes it after deletion", async () => {
    const text = "Patient-grouped validation prevents morphology leakage between training and validation partitions.";
    const upload = () => {
      const form = new FormData();
      form.set("file", new File([text], "validation.txt", { type: "text/plain" }));
      return ingestSource(new Request("http://localhost/api/sources", { method: "POST", body: form }));
    };
    const firstResponse = await upload();
    expect(firstResponse.status).toBe(201);
    const first = await firstResponse.json() as { source: { id: string }; chunks: Array<{ id: string }> };
    const duplicateResponse = await upload();
    expect(duplicateResponse.status).toBe(200);
    expect((await duplicateResponse.json() as { duplicate: boolean }).duplicate).toBe(true);

    const retrievalResponse = await retrieve(jsonRequest("http://localhost/api/retrieval", { query: "morphology leakage validation", sourceLocked: true }));
    const result = await retrievalResponse.json() as { citations: Array<{ chunkId: string }>; retrievalMode: string };
    expect(result.citations[0]?.chunkId).toBe(first.chunks[0]?.id);
    expect(result.retrievalMode).toBe("lexical_persisted");

    const deletionResponse = await deleteSource(new Request(`http://localhost/api/sources?sourceId=${first.source.id}`, { method: "DELETE" }));
    expect(deletionResponse.status).toBe(200);
    const afterDeletion = await retrieve(jsonRequest("http://localhost/api/retrieval", { query: "morphology leakage validation", sourceLocked: true }));
    const after = await afterDeletion.json() as { citations: Array<{ chunkId: string }> };
    expect(after.citations.map((citation) => citation.chunkId)).not.toContain(first.chunks[0]?.id);
  });
});
