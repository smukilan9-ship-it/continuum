import { describe, expect, it, vi } from "vitest";
import {
  CrossrefProvider,
  deduplicateScholarlyWorks,
  normalizeCrossrefWork,
  normalizeOpenAlexWork,
  OpenAlexProvider,
  scholarSearchUrl,
  ScholarlyProviderError,
  type NormalizedScholarlyWork,
} from "../apps/web/lib/scholarly";

const retrievedAt = "2026-07-22T10:00:00.000Z";

describe("scholarly discovery adapters", () => {
  it("normalizes an OpenAlex work without treating upstream markup as UI", () => {
    const work = normalizeOpenAlexWork({
      id: "https://openalex.org/W123",
      doi: "https://doi.org/10.1000/Continuum",
      display_name: "A Continuum Study",
      publication_year: 2025,
      cited_by_count: 17,
      authorships: [{ author: { display_name: "Ada Lovelace" }, institutions: [{ display_name: "Analytical Institute" }] }],
      primary_location: { is_oa: true, landing_page_url: "https://example.edu/paper", source: { display_name: "Journal of Durable Systems" } },
      best_oa_location: { pdf_url: "https://example.edu/paper.pdf" },
      open_access: { is_oa: true },
      topics: [{ display_name: "Knowledge Systems" }],
      abstract_inverted_index: { Durable: [0], context: [1], matters: [2] },
      related_works: ["https://openalex.org/W456"],
      referenced_works: ["https://openalex.org/W789"],
      type: "article",
    }, retrievedAt);

    expect(work).toMatchObject({
      providerId: "W123",
      doi: "10.1000/continuum",
      title: "A Continuum Study",
      abstract: "Durable context matters",
      authors: ["Ada Lovelace"],
      institutions: ["Analytical Institute"],
      venue: "Journal of Durable Systems",
      openAccess: true,
      sourceProvider: "openalex",
      relatedWorkIds: ["W456"],
      referenceIds: ["W789"],
    });
  });

  it("normalizes Crossref metadata and strips abstract tags", () => {
    const work = normalizeCrossrefWork({
      DOI: "10.1000/CONTINUUM",
      title: ["A Continuum Study"],
      author: [{ given: "Ada", family: "Lovelace", affiliation: [{ name: "Analytical Institute" }] }],
      issued: { "date-parts": [[2025, 4, 1]] },
      "container-title": ["Journal of Durable Systems"],
      abstract: "<jats:p>Durable context matters.</jats:p>",
      URL: "https://doi.org/10.1000/continuum",
      link: [{ URL: "https://example.edu/paper.pdf", "content-type": "application/pdf" }],
      license: [{ URL: "https://creativecommons.org/licenses/by/4.0/" }],
      subject: ["Knowledge Systems"],
      reference: [{ DOI: "10.1000/REFERENCE" }],
      type: "journal-article",
    }, retrievedAt);

    expect(work).toMatchObject({
      providerId: "10.1000/continuum",
      abstract: "Durable context matters.",
      year: 2025,
      openAccess: true,
      fullTextUrl: "https://example.edu/paper.pdf",
      sourceProvider: "crossref",
      referenceIds: ["10.1000/reference"],
    });
  });

  it("deduplicates provider results by DOI while preserving richer metadata", () => {
    const base: NormalizedScholarlyWork = {
      providerId: "W123", doi: "10.1000/continuum", title: "A Continuum Study", authors: ["Ada Lovelace"],
      openAccess: false, topics: [], institutions: [], sourceProvider: "openalex", retrievedAt, relatedWorkIds: [], referenceIds: [],
    };
    const merged = deduplicateScholarlyWorks([base, { ...base, providerId: "10.1000/continuum", sourceProvider: "crossref", openAccess: true, abstract: "Evidence", citedByCount: 21, topics: ["Systems"] }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ openAccess: true, abstract: "Evidence", citedByCount: 21, topics: ["Systems"] });
  });

  it("uses bounded, provider-correct search parameters", async () => {
    const openAlexFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://api.openalex.org");
      expect(url.searchParams.get("search")).toBe("knowledge graph");
      expect(url.searchParams.get("filter")).toContain("open_access.is_oa:true");
      expect(url.searchParams.get("per-page")).toBe("25");
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    await new OpenAlexProvider("fixture-key", openAlexFetch).search({ query: "knowledge graph", mode: "keywords", openAccessOnly: true, limit: 100 });

    const crossrefFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://api.crossref.org");
      expect(url.searchParams.get("query.author")).toBe("Ada Lovelace");
      expect(url.searchParams.get("mailto")).toBe("research@example.com");
      return new Response(JSON.stringify({ message: { items: [] } }), { status: 200 });
    });
    await new CrossrefProvider("research@example.com", crossrefFetch).search({ query: "Ada Lovelace", mode: "author" });
  });

  it("fails closed when OpenAlex is unconfigured and emits a search-only Scholar handoff", async () => {
    await expect(new OpenAlexProvider(undefined).search({ query: "continuum", mode: "keywords" })).rejects.toEqual(expect.objectContaining<Partial<ScholarlyProviderError>>({ code: "unconfigured" }));
    const url = new URL(scholarSearchUrl("continuum memory"));
    expect(url.origin).toBe("https://scholar.google.com");
    expect(url.pathname).toBe("/scholar");
    expect(url.searchParams.get("q")).toBe("continuum memory");
  });
});
