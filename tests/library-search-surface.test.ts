import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * One paper-search surface, one exact Zotero answer, no dead controls.
 *
 * These are structural guards, because the behaviour they protect cannot be
 * exercised from a unit test: the search branch of `/api/openalex` needs both
 * a Postgres cache and the live OpenAlex API, and the surfaces themselves are
 * React screens. What can be pinned is that the duplicate surface stays gone
 * (§13.1 AC-P3), that the Zotero match stays server-side and exact (§13.2
 * AC-Z3), and that no control ships explaining why it does nothing.
 */

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("paper search exists at exactly one URL (AC-P3)", () => {
  it("has a single caller of ScholarlySearch", () => {
    const callers = [
      "apps/web/components/library/library-page.tsx",
      "apps/web/components/workspace/research-screen.tsx",
      "apps/web/components/workspace/scholarly-search.tsx",
    ].filter((path) => /<ScholarlySearch\b/.test(read(path)));
    expect(callers).toEqual(["apps/web/components/library/library-page.tsx"]);
  });

  it("leaves no second search surface in the Research screen", () => {
    const source = read("apps/web/components/workspace/research-screen.tsx");
    // The tab used to own a query field, six filters, a result list, and its own
    // calls to the discovery endpoint. All four are what "one URL" rules out.
    expect(source).not.toContain("/api/research/discovery");
    expect(source).not.toContain("discovery-form");
    expect(source).not.toContain("discovery-filters");
    expect(source).not.toContain("discovery-results");
  });

  it("sends people to the Library's Discover tab with this project as the destination", () => {
    const source = read("apps/web/components/workspace/research-screen.tsx");
    expect(source).toContain("tab=discover");
    expect(source).toContain("target=p:");
  });
});

describe("the Zotero match is exact and server-side (AC-Z3)", () => {
  it("no longer builds a session-wide DOI index in the browser", () => {
    expect(existsSync(new URL("apps/web/components/library/use-zotero-doi-index.ts", root))).toBe(false);
    for (const path of ["apps/web/components/library/library-page.tsx", "apps/web/components/workspace/scholarly-search.tsx"]) {
      expect(read(path), path).not.toContain("useZoteroDoiIndex");
    }
  });

  it("attaches the match to the OpenAlex search response, not only to detail and graph", () => {
    const route = read("apps/web/app/api/openalex/route.ts");
    const searchBranch = route.slice(route.indexOf("const result = await searchOpenAlex"));
    expect(searchBranch).toContain("safeZoteroMatches");
    expect(searchBranch).toContain("zoteroMatches");
  });

  it("attaches it on the precise-search path too, so both paths agree", () => {
    const route = read("apps/web/app/api/research/discovery/route.ts");
    expect(route).toContain("matchZoteroByDoi");
    expect(route).toMatch(/payload = \{[^}]*zoteroMatches/);
  });

  it("stops qualifying the chip with a crawl limit it no longer has", () => {
    const source = read("apps/web/components/workspace/scholarly-search.tsx");
    expect(source).not.toContain("500 most recent items");
    // The chip is still rendered — from the matches the server returned.
    expect(source).toContain("In your Zotero");
    expect(source).toContain("mergeZoteroMatches");
  });
});

describe("no control explains why it does nothing", () => {
  it("gives Send to project and Download real handlers", () => {
    const row = read("apps/web/components/library/source-row.tsx");
    expect(row).not.toMatch(/isn't available yet|not available yet|coming soon/i);
    // Both callbacks are required now; the optional `?.` call was the shape that
    // let the menu render an item with nothing behind it.
    expect(row).toContain("actions.onSendToProject(source)");
    expect(row).toContain("actions.onDownload(source)");
  });

  it("keeps the download honest about sources that have no stored file", () => {
    const row = read("apps/web/components/library/source-row.tsx");
    expect(row).toContain("source.hasOriginal");
    expect(row).toContain("disabledReason");
  });

  it("wires both actions to the routes that serve them", () => {
    const page = read("apps/web/components/library/library-page.tsx");
    expect(page).toContain("/api/sources/download?sourceId=");
    expect(page).toMatch(/method: "PATCH"/);
  });
});

describe("forgotten memory stays out of every Neon read", () => {
  const repo = read("packages/db/src/repo.ts");

  it("forgets by setting the two flags the reads already filter on", () => {
    const method = repo.slice(repo.indexOf("async forgetMemoryRecord"), repo.indexOf("async upsertEntitySummary"));
    expect(method).toContain("superseded: true, deleted: true");
    expect(method).toContain("memoryChunks");
    expect(method).toContain("memoryRecords");
  });

  it("keeps both retrieval reads filtering on both flags", () => {
    // If either filter is ever dropped, Forget silently stops working on Neon
    // while the in-memory tests keep passing.
    const searchMemory = repo.slice(repo.indexOf("async searchMemory("), repo.indexOf("async forgetMemoryRecord"));
    expect(searchMemory).toContain("eq(memoryChunks.deleted, false)");
    expect(searchMemory).toContain("eq(memoryChunks.superseded, false)");

    const searchWorkspace = repo.slice(repo.indexOf("async searchWorkspace("), repo.indexOf("async getClaimEvidence"));
    expect(searchWorkspace).toContain("eq(memoryChunks.deleted, false)");
    expect(searchWorkspace).toContain("eq(memoryChunks.superseded, false)");
  });

  it("distinguishes permanent Forget from the assistant's per-conversation exclusion (§11.10)", () => {
    const page = read("apps/web/components/context/context-page.tsx");
    expect(page).toMatch(/cannot be brought back/i);
    expect(page).toContain("Don’t use this again");
    // The temporary one is still where it was, and is still per-conversation.
    expect(read("apps/web/components/assistant/use-assistant.tsx")).toContain("excludedRecordIds");
  });
});
