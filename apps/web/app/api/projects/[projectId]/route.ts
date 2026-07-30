import { NextResponse } from "next/server";
import { enforceRateLimit, getRequestUser } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_VIEWS = ["overview", "claims", "sources", "decisions"] as const;
type ProjectView = (typeof PROJECT_VIEWS)[number];

/** §16.3 `GET /api/projects/[id]?view=`. Ownership-scoped exactly as
 *  `/api/goals/[id]` is — see the note there on 404-over-403. */
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "project-read", Number(process.env.STATE_READS_PER_MINUTE ?? 120), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Read rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "60" } });

  const { projectId } = await params;
  if (!projectId || projectId.length > 200 || !/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }
  const requested = new URL(request.url).searchParams.get("view") ?? "overview";
  if (!PROJECT_VIEWS.includes(requested as ProjectView)) return NextResponse.json({ error: "Unknown project view" }, { status: 400 });

  const data = await getStore(user.id).projectView(projectId, requested as ProjectView);
  if (!data) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ data, view: requested, freshness: new Date().toISOString() }, { headers: { "cache-control": "private, no-store" } });
}
