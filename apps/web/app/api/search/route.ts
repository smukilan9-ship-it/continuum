import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { searchHitHref, searchKinds } from "@/lib/workspace-routes";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().min(2).max(200),
  kinds: z.array(z.enum(searchKinds)).max(searchKinds.length).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * §8.4 cross-object search. The command palette could previously only find the
 * four entity types the client already held in its snapshot, so a source, a
 * paper, a conversation, or a concept was unreachable by name (C13).
 *
 * §16.10 requires every new surface to be user-scoped: the store binds the
 * caller's own id, so a query can only ever reach that user's rows.
 */
export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "search", Number(process.env.SEARCH_READS_PER_MINUTE ?? 120), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Search rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "60" } });

  const params = new URL(request.url).searchParams;
  const kinds = params.get("kinds")?.split(",").map((kind) => kind.trim()).filter(Boolean);
  const parsed = querySchema.safeParse({
    q: params.get("q") ?? "",
    ...(kinds?.length ? { kinds } : {}),
    ...(params.get("limit") ? { limit: params.get("limit") } : {}),
  });
  // A query shorter than two characters is not an error the user should see —
  // the palette types into this endpoint on every keystroke.
  if (!parsed.success) return NextResponse.json({ results: [], query: params.get("q") ?? "" }, { headers: { "cache-control": "private, no-store" } });

  const { q, ...rest } = parsed.data;
  const hits = await getStore(user.id).searchWorkspace({ query: q, ...rest });
  return NextResponse.json(
    { query: q, results: hits.map((hit) => ({ ...hit, href: searchHitHref(hit) })) },
    { headers: { "cache-control": "private, no-store" } },
  );
}
