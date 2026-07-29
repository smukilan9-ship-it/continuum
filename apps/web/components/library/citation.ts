/**
 * Citation export for a discovery result (§13.2, AC-LB2).
 *
 * Three formats because a reference manager, a LaTeX document, and an email all
 * want different text, and the previous surface offered only the third.
 * Everything is derived from metadata already on screen — nothing is fetched,
 * so "Copy citation" cannot fail on a slow network.
 */

import type { NormalizedScholarlyWork } from "@/lib/scholarly";

export type CitationFormat = "bibtex" | "ris" | "plain";

export const citationFormats: Array<{ id: CitationFormat; label: string }> = [
  { id: "bibtex", label: "BibTeX" },
  { id: "ris", label: "RIS" },
  { id: "plain", label: "Plain text" },
];

function surname(author: string) {
  const parts = author.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1]! : author.trim();
}

/** A stable, collision-resistant BibTeX key: first author, year, first title word. */
function citeKey(work: NormalizedScholarlyWork) {
  const author = work.authors[0] ? surname(work.authors[0]) : "anon";
  const word = work.title.split(/\s+/).find((token) => token.length > 3) ?? "work";
  return `${author}${work.year ?? "nd"}${word}`.replace(/[^A-Za-z0-9]/g, "").toLowerCase() || "continuum";
}

/** Braces and backslashes end a BibTeX field early; nothing else needs escaping here. */
function bibtexValue(value: string) {
  return value.replace(/[\\{}]/g, " ").replace(/\s+/g, " ").trim();
}

function bibtexType(work: NormalizedScholarlyWork) {
  const type = (work.type ?? "").toLowerCase();
  if (type.includes("book")) return "book";
  if (type.includes("thesis") || type.includes("dissertation")) return "phdthesis";
  if (type.includes("proceedings") || type.includes("conference")) return "inproceedings";
  return "article";
}

/** RIS type tags. `JOUR` is the honest default for an unlabelled work. */
function risType(work: NormalizedScholarlyWork) {
  const type = (work.type ?? "").toLowerCase();
  if (type.includes("book")) return "BOOK";
  if (type.includes("thesis") || type.includes("dissertation")) return "THES";
  if (type.includes("proceedings") || type.includes("conference")) return "CPAPER";
  return "JOUR";
}

export function formatCitation(work: NormalizedScholarlyWork, format: CitationFormat) {
  if (format === "bibtex") {
    const fields: Array<[string, string | undefined]> = [
      ["title", bibtexValue(work.title)],
      ["author", work.authors.length ? work.authors.map(bibtexValue).join(" and ") : undefined],
      ["year", work.year ? String(work.year) : undefined],
      ["journal", work.venue ? bibtexValue(work.venue) : undefined],
      ["doi", work.doi],
      ["url", work.landingPageUrl ?? work.fullTextUrl],
    ];
    const body = fields
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([key, value]) => `  ${key} = {${value}}`)
      .join(",\n");
    return `@${bibtexType(work)}{${citeKey(work)},\n${body}\n}`;
  }

  if (format === "ris") {
    const lines = [`TY  - ${risType(work)}`, `TI  - ${work.title}`];
    for (const author of work.authors) lines.push(`AU  - ${author}`);
    if (work.year) lines.push(`PY  - ${work.year}`);
    if (work.venue) lines.push(`JO  - ${work.venue}`);
    if (work.doi) lines.push(`DO  - ${work.doi}`);
    const url = work.landingPageUrl ?? work.fullTextUrl;
    if (url) lines.push(`UR  - ${url}`);
    if (work.abstract) lines.push(`AB  - ${work.abstract.replace(/\s+/g, " ").trim()}`);
    lines.push("ER  - ");
    return lines.join("\n");
  }

  const authors = work.authors.length ? work.authors.join(", ") : "Unknown author";
  return `${authors} (${work.year ?? "n.d."}). ${work.title}.${work.venue ? ` ${work.venue}.` : ""}${work.doi ? ` https://doi.org/${work.doi}` : ""}`;
}

/**
 * Clipboard writes are rejected outside a user gesture and in insecure
 * contexts, so the caller always needs to know whether the copy happened.
 */
export async function copyToClipboard(value: string) {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
