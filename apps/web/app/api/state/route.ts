import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "state-read", Number(process.env.STATE_READS_PER_MINUTE ?? 120), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "State read rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "60" } });
  const view = new URL(request.url).searchParams.get("view") ?? "today";
  const allowedViews = new Set(["today", "assistant", "goals", "learn", "research", "openalex", "zotero", "memory", "activity", "integrations", "account", "code", "library"]);
  if (!allowedViews.has(view)) return NextResponse.json({ error: "Unknown workspace view" }, { status: 400 });
  const store = getStore(user.id);
  return NextResponse.json({ data: await store.workspace(view), freshness: new Date().toISOString() }, {
    headers: {
      "cache-control": "private, no-store",
      // §16.3: replaced by the per-route reads (`/api/home`, `/api/goals/[id]`,
      // `/api/projects/[id]`, `/api/search`). Kept for one release so a client
      // that has not reloaded keeps working, then deleted.
      deprecation: "true",
      link: '</api/home>; rel="successor-version"',
    },
  });
}

const appEventSchema = z.object({
  type: z.string().regex(/^[a-z]+(\.[a-z]+)+$/),
  summary: z.string().min(3).max(500),
  entityIds: z.array(z.string()).max(20),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin app writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "state-write", Number(process.env.STATE_WRITES_PER_HOUR ?? 180), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "State write rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "3600" } });
  const parsed = appEventSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid app event", issues: parsed.error.issues }, { status: 400 });
  const now = new Date().toISOString();
  if (parsed.data.type === "goal.created") {
    const result = await getStore(user.id).write("create_goal", parsed.data.payload, now, "standalone_app");
    return NextResponse.json({ data: result.data, changeSummary: result.summary }, { status: 201 });
  }
  if (parsed.data.type === "project.created") {
    const result = await getStore(user.id).write("create_project", parsed.data.payload, now, "standalone_app");
    return NextResponse.json({ data: result.data, changeSummary: result.summary }, { status: 201 });
  }
  if (parsed.data.type === "task.created") {
    const result = await getStore(user.id).write("create_task", parsed.data.payload, now, "standalone_app");
    return NextResponse.json({ data: result.data, changeSummary: result.summary }, { status: 201 });
  }
  if (parsed.data.type === "task.progress.recorded") {
    const result = await getStore(user.id).write("record_progress", parsed.data.payload, now, "standalone_app");
    return NextResponse.json({ data: result.data, changeSummary: result.summary });
  }
  if (parsed.data.type === "research.decision.saved") {
    const result = await getStore(user.id).write("save_decision", parsed.data.payload, now, "standalone_app");
    return NextResponse.json({ data: result.data, changeSummary: result.summary }, { status: 201 });
  }
  const event = await getStore(user.id).appendEvent(parsed.data);
  return NextResponse.json({ data: event, changeSummary: event.summary }, { status: 201 });
}
