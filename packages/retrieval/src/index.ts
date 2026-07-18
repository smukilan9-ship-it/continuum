import { createHash } from "node:crypto";

export interface SourceDocument {
  id: string;
  title: string;
  text: string;
  version: number;
  deleted: boolean;
}

export interface SourceChunk {
  id: string;
  sourceId: string;
  sourceTitle: string;
  passage: number;
  text: string;
  contentHash: string;
  sourceVersion: number;
  deleted: boolean;
}

export interface RetrievalMatch extends SourceChunk {
  score: number;
  reference: string;
}

const injectionPatterns = [
  /ignore (all|any|the) (previous|prior|system) instructions?/gi,
  /system\s*prompt/gi,
  /call (this|the|a) tool/gi,
  /execute (this|the following)/gi,
  /developer message/gi,
];

export function contentHash(content: string) {
  return createHash("sha256").update(content.normalize("NFKC")).digest("hex");
}

export function sanitizeUntrustedContent(content: string) {
  let sanitized = content.replaceAll("\0", "").normalize("NFKC");
  let injectionDetected = false;
  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, (match) => {
      injectionDetected = true;
      return `[embedded instruction removed: ${match.length} chars]`;
    });
  }
  return { sanitized, injectionDetected };
}

export function chunkDocument(document: SourceDocument, maxChars = 700, overlapChars = 100): SourceChunk[] {
  if (maxChars <= overlapChars || maxChars < 100) throw new Error("Chunk size must exceed overlap by at least 100 characters");
  const { sanitized } = sanitizeUntrustedContent(document.text);
  const paragraphs = sanitized.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      chunks.push(current);
      current = `${current.slice(-overlapChars)}\n\n${paragraph}`;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);

  return chunks.map((text, index) => ({
    id: `chunk_${document.id.replace(/^source_/, "")}_${index + 1}`,
    sourceId: document.id,
    sourceTitle: document.title,
    passage: index + 1,
    text,
    contentHash: contentHash(text),
    sourceVersion: document.version,
    deleted: document.deleted,
  }));
}

function terms(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
}

export function retrieve(query: string, chunks: SourceChunk[], limit = 4): RetrievalMatch[] {
  const queryTerms = new Set(terms(query));
  return chunks
    .filter((chunk) => !chunk.deleted)
    .map((chunk) => {
      const chunkTerms = terms(chunk.text);
      const matches = chunkTerms.filter((term) => queryTerms.has(term)).length;
      const score = queryTerms.size ? matches / Math.sqrt(queryTerms.size * Math.max(1, chunkTerms.length)) : 0;
      return { ...chunk, score, reference: `${chunk.sourceTitle} · passage ${chunk.passage}` };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, Math.min(limit, 10)));
}

export function answerFromSources(query: string, chunks: SourceChunk[], sourceLocked = true) {
  const matches = retrieve(query, chunks, 3);
  if (!matches.length && sourceLocked) {
    return {
      answer: "I couldn’t find a supporting passage in the selected sources, so I won’t make an unsupported claim.",
      evidenceState: "unverified" as const,
      citations: [],
    };
  }
  if (!matches.length) {
    return { answer: "No relevant source passage was found.", evidenceState: "model_inference" as const, citations: [] };
  }
  return {
    answer: matches.map((match) => match.text).join("\n\n"),
    evidenceState: "direct_support" as const,
    citations: matches.map((match) => ({ chunkId: match.id, reference: match.reference, passage: match.text })),
  };
}

export function findDuplicate(document: SourceDocument, existing: SourceDocument[]) {
  const hash = contentHash(document.text);
  return existing.find((item) => !item.deleted && contentHash(item.text) === hash);
}

export function comparePassages(left: SourceChunk, right: SourceChunk) {
  const leftTerms = new Set(terms(left.text));
  const rightTerms = new Set(terms(right.text));
  const shared = [...leftTerms].filter((term) => rightTerms.has(term));
  return {
    sources: [left.sourceId, right.sourceId],
    sharedTerms: shared,
    summary: shared.length
      ? `Both passages discuss ${shared.slice(0, 5).join(", ")}; inspect each exact passage for differences in scope.`
      : "The passages do not share enough terminology for a grounded comparison.",
  };
}
