import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

const searchSchema = z.object({
  query: z.string().min(2).max(2000),
  goalId: z.string().min(3).optional(),
  projectId: z.string().min(3).optional(),
  types: z.array(z.string().min(1).max(120)).max(20).optional(),
  limit: z.number().int().min(1).max(20).default(10),
});

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin memory search is not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "memory-search", Number(process.env.MEMORY_SEARCH_REQUESTS_PER_MINUTE ?? 60), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Memory search rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "60" } });
  const parsed = searchSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid memory search", issues: parsed.error.issues }, { status: 400 });
  const results = await getStore(user.id).searchMemory(parsed.data);
  return NextResponse.json({ results, retrieval: "hybrid_semantic_lexical", query: parsed.data.query, generatedAt: new Date().toISOString() }, { headers: { "cache-control": "private, no-store" } });
}
