import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { listParameters, openAlexWorkSelect, publicationYearFilter, validOpenAlexId, zoteroMatchQuery } from "../apps/web/lib/openalex";

const dialect = new PgDialect();

describe("OpenAlex request shape", () => {
  it("sends the select projection and hyphenated per-page on works search", () => {
    const parameters = listParameters("works", { search: "quantum annealing", paginated: true, perPage: 25 });
    expect(parameters.get("select")).toBe(openAlexWorkSelect);
    expect(parameters.get("per-page")).toBe("25");
    expect(parameters.get("per_page")).toBeNull();
    expect(parameters.get("search")).toBe("quantum annealing");
    expect(parameters.get("cursor")).toBe("*");
  });

  it("omits the projection for non-work entities", () => {
    const parameters = listParameters("topics", { search: "machine learning", paginated: true });
    expect(parameters.get("select")).toBeNull();
    expect(parameters.get("per-page")).toBe("25");
  });

  it("omits the cursor entirely for non-paginated lookups", () => {
    expect(listParameters("works", { filters: ["openalex_id:W1|W2"], perPage: 100 }).get("cursor")).toBeNull();
  });

  it("carries a real cursor forward when paging", () => {
    expect(listParameters("works", { search: "cell", paginated: true, cursor: "IlszLjE=" }).get("cursor")).toBe("IlszLjE=");
  });

  it("clamps per-page into the range OpenAlex accepts", () => {
    expect(listParameters("authors", { search: "hinton", perPage: 5000 }).get("per-page")).toBe("100");
    expect(listParameters("authors", { search: "hinton", perPage: 0 }).get("per-page")).toBe("1");
  });

  it("rejects identifiers that do not match the entity kind", () => {
    expect(validOpenAlexId("works", "https://openalex.org/w2741809807")).toBe("W2741809807");
    expect(() => validOpenAlexId("works", "A5023888391")).toThrow("Invalid OpenAlex entity ID.");
  });
});

describe("Zotero DOI cross-reference query", () => {
  it("expands the DOI list into a real IN list rather than a row constructor", () => {
    const { sql: text, params } = dialect.sqlToQuery(zoteroMatchQuery("user_demo", ["10.1000/a", "10.1000/b", "10.1000/c"]));
    // The regression: `= any(${dois})` emitted `any(($2, $3, $4))`, which Postgres
    // parses as a row constructor and `any()` rejects.
    expect(text).not.toMatch(/any\(/i);
    expect(text.replace(/\s+/g, " ")).toContain("lower(doi) in ($2, $3, $4)");
    expect(params).toEqual(["user_demo", "10.1000/a", "10.1000/b", "10.1000/c"]);
  });

  it("parameterises every DOI so no value is interpolated into the statement", () => {
    const { sql: text, params } = dialect.sqlToQuery(zoteroMatchQuery("user_demo", ["10.1000/'; drop table zotero_items; --"]));
    expect(text).not.toContain("drop table");
    expect(params).toHaveLength(2);
  });
});

describe("publication year filter", () => {
  it("ignores an absent bound rather than emitting year 0", () => {
    // The outage: `Number(null)` is 0, which passed a bare `<= 2200` check and
    // put `to_publication_date:0-12-31` on every works search. OpenAlex answered
    // "Value for param to_publication_date is an invalid date" with HTTP 400,
    // which is why Works search failed and the other four kinds did not.
    expect(publicationYearFilter(null)).toBeUndefined();
    expect(publicationYearFilter("")).toBeUndefined();
    expect(publicationYearFilter("   ")).toBeUndefined();
  });

  it("accepts a real year", () => {
    expect(publicationYearFilter("2018")).toBe(2018);
    expect(publicationYearFilter("1800")).toBe(1800);
  });

  it("rejects out-of-range and non-numeric input", () => {
    expect(publicationYearFilter("0")).toBeUndefined();
    expect(publicationYearFilter("1799")).toBeUndefined();
    expect(publicationYearFilter("2201")).toBeUndefined();
    expect(publicationYearFilter("2018.5")).toBeUndefined();
    expect(publicationYearFilter("notayear")).toBeUndefined();
  });
});
