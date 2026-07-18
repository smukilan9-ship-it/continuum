import { answerFromSources, chunkDocument } from "@continuum/retrieval";
import { NextResponse } from "next/server";
import { researchClaims } from "@/lib/demo-data";
import { z } from "zod";

const inputSchema = z.object({ query: z.string().min(2), sourceLocked: z.boolean().default(true) });

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid retrieval request", issues: parsed.error.issues }, { status: 400 });
  const chunks = researchClaims.flatMap((claim, claimIndex) => claim.evidence.flatMap((evidence, evidenceIndex) => chunkDocument({
    id: `source_demo_${claimIndex}_${evidenceIndex}`,
    title: evidence.source,
    text: evidence.text,
    version: 1,
    deleted: false,
  })));
  return NextResponse.json(answerFromSources(parsed.data.query, chunks, parsed.data.sourceLocked));
}
