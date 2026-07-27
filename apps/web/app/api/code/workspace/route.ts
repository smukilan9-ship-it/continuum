import { randomUUID } from "node:crypto";
import { getDatabase, sql } from "@continuum/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stateSchema = z.record(z.string(), z.unknown());
const maxStateBytes = 1_500_000;

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "code-workspace-read", 60, 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Code workspace refresh limit reached" }, { status: 429 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ state: null, persistence: "browser_only" });
  const result = await getDatabase().execute(sql`select state, updated_at from code_workspaces where user_id = ${user.id} and name = 'Primary workspace' limit 1`);
  const row = result.rows[0];
  return NextResponse.json({
    state: row?.state ?? null,
    updatedAt: row?.updated_at instanceof Date ? row.updated_at.toISOString() : row?.updated_at,
  }, { headers: { "cache-control": "private, no-store" } });
}

export async function PUT(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin code workspace writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "code-workspace-write", 120, 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Code workspace save limit reached" }, { status: 429 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > maxStateBytes) return NextResponse.json({ error: "Code workspace state is limited to 1.5 MB" }, { status: 413 });
  const parsedBody = await Promise.resolve().then(() => JSON.parse(raw) as unknown).catch(() => undefined);
  if (!parsedBody) return NextResponse.json({ error: "Invalid JSON workspace state" }, { status: 400 });
  const parsed = stateSchema.safeParse(parsedBody);
  if (!parsed.success) return NextResponse.json({ error: "Invalid code workspace state" }, { status: 400 });
  const files = Array.isArray(parsed.data.files) ? parsed.data.files : [];
  if (files.length > 24 || files.some((file) => {
    if (!file || typeof file !== "object") return true;
    const value = file as Record<string, unknown>;
    return typeof value.name !== "string" || value.name.length > 120 || typeof value.content !== "string" || value.content.length > 200_000;
  })) return NextResponse.json({ error: "Code workspaces support at most 24 files of 200,000 characters each" }, { status: 413 });
  const id = `code_workspace_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  await getDatabase().execute(sql`
    insert into code_workspaces (id, user_id, name, state, created_at, updated_at, version)
    values (${id}, ${user.id}, 'Primary workspace', ${JSON.stringify(parsed.data)}::jsonb, now(), now(), 1)
    on conflict (user_id, name) do update set state = excluded.state, updated_at = now(), version = code_workspaces.version + 1
  `);
  return NextResponse.json({ saved: true, updatedAt: new Date().toISOString() });
}
