import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { logRequestFailure, publicErrorMessage } from "@/lib/api-errors";

export const runtime = "nodejs";

const searchSchema = z.object({
  action: z.literal("search").optional(),
  query: z.string().min(2).max(2000),
  goalId: z.string().min(3).optional(),
  projectId: z.string().min(3).optional(),
  types: z.array(z.string().min(1).max(120)).max(20).optional(),
  limit: z.number().int().min(1).max(20).default(10),
});
const packSchema = z.object({ action: z.literal("context_pack"), packId: z.string().min(3).max(300), maxTokens: z.number().int().min(200).max(4000).default(1800) });
/**
 * §9.9 AC-CX3, §16.3. `recordId` is whichever id the row on `/context` carries
 * — a durable record or a retrieved passage — because the user is told they are
 * forgetting a thing they can see, not a row in a named table.
 */
const forgetSchema = z.object({
  action: z.literal("forget"),
  // The product's identifier shape, so a malformed id is a 400 here rather than
  // a schema failure inside the audit write that follows a successful forget.
  recordId: z.string().min(3).max(300).regex(/^[a-z]+_[A-Za-z0-9_-]+$/),
});

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "memory-packs", Number(process.env.MEMORY_SEARCH_REQUESTS_PER_MINUTE ?? 60), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Memory context-pack rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "60" } });
  const packs = await getStore(user.id).read("list_context_packs", {});
  return NextResponse.json({ packs, generatedAt: new Date().toISOString() }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin memory search is not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "memory-search", Number(process.env.MEMORY_SEARCH_REQUESTS_PER_MINUTE ?? 60), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Memory search rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "60" } });
  const parsed = z.union([forgetSchema, packSchema, searchSchema]).safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid memory request", issues: parsed.error.issues }, { status: 400 });
  if (parsed.data.action === "forget") {
    const store = getStore(user.id);
    const forgotten = await store.forgetMemoryRecord(parsed.data.recordId);
    if (!forgotten) return NextResponse.json({ error: "Continuum no longer holds that record." }, { status: 404 });
    // The audit entry deliberately carries no trace of what was forgotten —
    // echoing the text into a new event would re-remember it on the next write.
    await store.appendEvent({
      type: "memory.record.forgotten",
      summary: "Forgot a remembered record at the person's request.",
      entityIds: [forgotten.id],
      payload: { records: forgotten.records, passages: forgotten.passages },
      importance: 0.1,
    });
    return NextResponse.json({ forgotten }, { headers: { "cache-control": "private, no-store" } });
  }
  if (parsed.data.action === "context_pack") {
    try {
      const pack = await getStore(user.id).read("get_context_pack", { packId: parsed.data.packId, maxTokens: parsed.data.maxTokens }, "standalone-memory");
      return NextResponse.json({ pack, generatedAt: new Date().toISOString() }, { headers: { "cache-control": "private, no-store" } });
    } catch (error) {
      logRequestFailure("memory_pack_failed", {}, error);
    return NextResponse.json({ error: publicErrorMessage(error, "Context pack could not be loaded") }, { status: 404 });
    }
  }
  const results = await getStore(user.id).searchMemory(parsed.data);
  return NextResponse.json({ results, retrieval: "hybrid_semantic_lexical", query: parsed.data.query, generatedAt: new Date().toISOString() }, { headers: { "cache-control": "private, no-store" } });
}
