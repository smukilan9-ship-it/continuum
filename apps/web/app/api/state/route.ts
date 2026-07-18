import { NextResponse } from "next/server";
import { demoStore } from "@/lib/demo-store";
import { z } from "zod";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ data: demoStore, freshness: new Date().toISOString() });
}

const appEventSchema = z.object({
  type: z.string().regex(/^[a-z]+(\.[a-z]+)+$/),
  summary: z.string().min(3).max(500),
  entityIds: z.array(z.string()).max(20),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Cross-origin app writes are not allowed" }, { status: 403 });
  const parsed = appEventSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid app event", issues: parsed.error.issues }, { status: 400 });
  const event = {
    id: `audit_app_${demoStore.events.length + 1}`,
    ...parsed.data,
    occurredAt: new Date().toISOString(),
  };
  demoStore.events.push(event);
  return NextResponse.json({ data: event, changeSummary: event.summary }, { status: 201 });
}
