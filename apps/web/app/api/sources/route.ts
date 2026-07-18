import { contentHash, sanitizeUntrustedContent, chunkDocument } from "@continuum/retrieval";
import { extractText } from "unpdf";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "A PDF or text file is required" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Files are limited to 10 MB" }, { status: 413 });
  if (!file.type.includes("pdf") && !file.type.startsWith("text/") && !file.name.endsWith(".txt")) return NextResponse.json({ error: "Only PDF and text sources are supported" }, { status: 415 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const rawText = file.type.includes("pdf") ? (await extractText(bytes, { mergePages: true })).text : new TextDecoder().decode(bytes);
  const { sanitized, injectionDetected } = sanitizeUntrustedContent(rawText);
  if (!sanitized.trim()) return NextResponse.json({ error: "No readable text was found in this source" }, { status: 422 });
  const id = `source_${contentHash(sanitized).slice(0, 12)}`;
  const chunks = chunkDocument({ id, title: file.name, text: sanitized, version: 1, deleted: false });
  return NextResponse.json({
    source: { id, title: file.name, contentHash: contentHash(sanitized), version: 1, parserVersion: "unpdf-1.6.2", injectionDetected },
    chunks,
    duplicateKey: contentHash(sanitized),
  }, { status: 201 });
}
