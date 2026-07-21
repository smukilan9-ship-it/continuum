import { answerFromSources, answerFromVectorMatches, chunkDocument } from "@continuum/retrieval";
import { embedQuery, embeddingConfiguration } from "@continuum/ai";
import { NextResponse } from "next/server";
import { researchClaims } from "@/lib/demo-data";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";

const inputSchema = z.object({ query: z.string().min(2).max(2000), sourceLocked: z.boolean().default(true) });

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin retrieval is not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "retrieval", Number(process.env.RETRIEVAL_REQUESTS_PER_MINUTE ?? 60), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Retrieval rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "60" } });
  const parsed = inputSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid retrieval request", issues: parsed.error.issues }, { status: 400 });
  const store = getStore(user.id);
  const persisted = await store.listSourceChunks();
  if (store.kind === "neon" && embeddingConfiguration() && persisted.length) {
    try {
      const matches = await store.vectorSearch(await embedQuery(parsed.data.query), 3);
      // Calibrated against gemini-embedding-001: on-topic queries score ~0.72+,
      // unrelated queries ~0.42–0.46, so 0.6 cleanly separates grounded from
      // unanswerable instead of citing an irrelevant passage.
      const configuredThreshold = Number(process.env.RETRIEVAL_COSINE_THRESHOLD ?? 0.6);
      const threshold = Number.isFinite(configuredThreshold) ? Math.max(-1, Math.min(1, configuredThreshold)) : 0.6;
      const vectorAnswer = answerFromVectorMatches(matches.map((match) => ({ ...match, score: match.score ?? 0 })), parsed.data.sourceLocked, threshold);
      if (vectorAnswer.citations.length || parsed.data.sourceLocked) return NextResponse.json({ ...vectorAnswer, retrievalMode: "vector" });
    } catch {
      // Provider or vector search failure intentionally falls through to lexical retrieval.
    }
  }
  const chunks = persisted.length
    ? persisted
    : store.kind === "memory"
      ? researchClaims.flatMap((claim, claimIndex) => claim.evidence.flatMap((evidence, evidenceIndex) => chunkDocument({
          id: `source_demo_${claimIndex}_${evidenceIndex}`,
          title: evidence.source,
          text: evidence.text,
          version: 1,
          deleted: false,
        })))
      : [];
  return NextResponse.json({
    ...answerFromSources(parsed.data.query, chunks, parsed.data.sourceLocked),
    retrievalMode: persisted.length ? "lexical_persisted" : store.kind === "memory" ? "lexical_local_seed" : "no_user_sources",
  }, { headers: { "cache-control": "private, no-store" } });
}
