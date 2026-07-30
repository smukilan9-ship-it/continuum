import { beforeEach, describe, expect, it } from "vitest";
import { GET as download } from "../apps/web/app/api/sources/download/route";
import { GET as listSources, PATCH as fileSource } from "../apps/web/app/api/sources/route";
import { normalizeSourceRow } from "../apps/web/components/library/types";
import { demoStore } from "../apps/web/lib/demo-store";
import { getStore } from "../apps/web/lib/store";

/**
 * The two Library row actions that shipped disabled (§13.2), and the source
 * detail that had no passage list (§13.3).
 *
 * "Send to project" had no write behind it and "Download" had no route, so both
 * sat in the overflow menu explaining why they did nothing. These cases pin the
 * writes that replaced them, and — for the case that genuinely cannot be served
 * — that the failure names its own reason instead of breaking.
 */

function reset() {
  demoStore.sources.length = 0;
  demoStore.chunks.length = 0;
  demoStore.projects.length = 0;
  demoStore.events.length = 0;
  demoStore.memoryChunks.length = 0;
  demoStore.memoryRecords.length = 0;

  demoStore.projects.push({ id: "project_oasis", title: "OASIS", purpose: "Cross-marker spatial association" });
  demoStore.sources.push({
    id: "source_stack",
    userId: "user_maya",
    title: "Stack et al. 2014.pdf",
    mimeType: "application/pdf",
    storagePath: "https://blob.example/sources/user_maya/abc-stack.pdf",
    contentHash: "hash_stack",
    sourceVersion: 1,
    parserVersion: "unpdf-1.6.2",
    createdAt: "2026-07-04T00:00:00.000Z",
  });
  demoStore.sources.push({
    id: "source_pasted",
    userId: "user_maya",
    title: "Pasted protocol notes",
    mimeType: "text/plain",
    contentHash: "hash_pasted",
    sourceVersion: 1,
    parserVersion: "utf8-v1",
    createdAt: "2026-07-05T00:00:00.000Z",
  });
  demoStore.chunks.push(
    { id: "chunk_stack_1", sourceId: "source_stack", sourceTitle: "Stack et al. 2014.pdf", passage: 1, text: "Multiplexed staining preserves spatial context.", contentHash: "c1", sourceVersion: 1, deleted: false, reference: "Stack et al. 2014.pdf · passage 1" },
    { id: "chunk_stack_2", sourceId: "source_stack", sourceTitle: "Stack et al. 2014.pdf", passage: 2, text: "Marker panels must be validated per tissue.", contentHash: "c2", sourceVersion: 1, deleted: false, reference: "Stack et al. 2014.pdf · passage 2" },
    { id: "chunk_pasted_1", sourceId: "source_pasted", sourceTitle: "Pasted protocol notes", passage: 1, text: "Incubate overnight at four degrees.", contentHash: "c3", sourceVersion: 1, deleted: false, reference: "Pasted protocol notes · passage 1" },
  );
}

function patch(body: unknown) {
  return fileSource(new Request("http://localhost/api/sources", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("send an indexed source to a project", () => {
  beforeEach(reset);

  it("files a source into a project the caller owns", async () => {
    const response = await patch({ sourceId: "source_stack", projectId: "project_oasis" });
    expect(response.status).toBe(200);
    expect((await response.json() as { source: { projectId: string } }).source.projectId).toBe("project_oasis");
    expect(demoStore.sources.find((row) => row.id === "source_stack")?.projectId).toBe("project_oasis");
  });

  it("unfiles a source without deleting it", async () => {
    await patch({ sourceId: "source_stack", projectId: "project_oasis" });
    const response = await patch({ sourceId: "source_stack", projectId: null });
    expect(response.status).toBe(200);
    const source = demoStore.sources.find((row) => row.id === "source_stack");
    expect(source?.projectId).toBeUndefined();
    expect(source).toBeDefined();
  });

  it("refuses a project the caller cannot reach, and changes nothing", async () => {
    const response = await patch({ sourceId: "source_stack", projectId: "project_someone_else" });
    expect(response.status).toBe(404);
    expect((await response.json() as { error: string }).error).toMatch(/project not found/i);
    expect(demoStore.sources.find((row) => row.id === "source_stack")?.projectId).toBeUndefined();
  });

  it("answers 404 for a source the caller does not have", async () => {
    const response = await patch({ sourceId: "source_absent", projectId: "project_oasis" });
    expect(response.status).toBe(404);
  });

  it("rejects a malformed request", async () => {
    expect((await patch({ sourceId: "source_stack" })).status).toBe(400);
    expect((await patch({ projectId: "project_oasis" })).status).toBe(400);
  });

  it("records the change so the move is accountable", async () => {
    await patch({ sourceId: "source_stack", projectId: "project_oasis" });
    expect(demoStore.events.some((event) => event.type === "source.project.changed")).toBe(true);
  });
});

describe("source detail passages", () => {
  beforeEach(reset);

  it("returns only the passages of the source that was asked for", async () => {
    const response = await listSources(new Request("http://localhost/api/sources?sourceId=source_stack&include=passages"));
    expect(response.status).toBe(200);
    const body = await response.json() as { passages: Array<{ id: string; passage: number; text: string }> };
    expect(body.passages.map((entry) => entry.id)).toEqual(["chunk_stack_1", "chunk_stack_2"]);
    expect(body.passages[0]?.passage).toBe(1);
  });

  it("returns an empty list rather than an error for a source with nothing indexed", async () => {
    const response = await listSources(new Request("http://localhost/api/sources?sourceId=source_absent&include=passages"));
    expect(response.status).toBe(200);
    expect((await response.json() as { passages: unknown[] }).passages).toEqual([]);
  });

  it("requires a source id", async () => {
    expect((await listSources(new Request("http://localhost/api/sources?include=passages"))).status).toBe(400);
  });
});

describe("download the stored original", () => {
  beforeEach(reset);

  it("tells the Library which sources have a file, without leaking where it is", async () => {
    const response = await listSources(new Request("http://localhost/api/sources"));
    const rows = (await response.json() as { sources: Array<Record<string, unknown>> }).sources;
    const stack = rows.find((row) => row.id === "source_stack")!;
    const pasted = rows.find((row) => row.id === "source_pasted")!;
    expect(stack.hasStoredOriginal).toBe(true);
    expect(pasted.hasStoredOriginal).toBe(false);
    // The Blob URL is the thing that must never reach a browser.
    expect(JSON.stringify(rows)).not.toContain("blob.example");
    expect(stack.storagePath).toBeUndefined();
  });

  it("carries that flag through to the row the menu reads", () => {
    expect(normalizeSourceRow({ id: "source_stack", title: "Stack et al. 2014.pdf", mimeType: "application/pdf", hasStoredOriginal: true })?.hasOriginal).toBe(true);
    expect(normalizeSourceRow({ id: "source_pasted", title: "Pasted protocol notes", mimeType: "text/plain" })?.hasOriginal).toBe(false);
  });

  it("says plainly when there is no original to send", async () => {
    const response = await download(new Request("http://localhost/api/sources/download?sourceId=source_pasted"));
    expect(response.status).toBe(404);
    const body = await response.json() as { code: string; error: string };
    expect(body.code).toBe("no_original");
    expect(body.error).toMatch(/did not keep an original file/i);
  });

  it("reports unconfigured storage as a deployment fact, not a missing source", async () => {
    const response = await download(new Request("http://localhost/api/sources/download?sourceId=source_stack"));
    expect(response.status).toBe(503);
    expect((await response.json() as { code: string }).code).toBe("storage_unconfigured");
  });

  it("answers 404 for a source the caller does not have", async () => {
    const response = await download(new Request("http://localhost/api/sources/download?sourceId=source_absent"));
    expect(response.status).toBe(404);
    expect((await response.json() as { error: string }).error).toMatch(/source not found/i);
  });

  it("requires a source id", async () => {
    expect((await download(new Request("http://localhost/api/sources/download"))).status).toBe(400);
  });

  it("never resolves a storage path for someone else's source", async () => {
    expect(await getStore("user_other").getSourceOriginal("source_stack")).toBeUndefined();
  });
});
