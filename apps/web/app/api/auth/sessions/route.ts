import { NeonRepository } from "@continuum/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentSession, enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("revoke"), sessionId: z.string().min(3).max(200) }),
  z.object({ action: z.literal("revoke_others") }),
  z.object({ action: z.literal("revoke_all") }),
]);

function deviceLabel(value: string | null) {
  if (!value) return "Unknown device";
  const browser = /Edg\//.test(value) ? "Edge" : /Firefox\//.test(value) ? "Firefox" : /Chrome\//.test(value) ? "Chrome" : /Safari\//.test(value) ? "Safari" : "Browser";
  const device = /iPhone|iPad/.test(value) ? "iOS" : /Android/.test(value) ? "Android" : /Macintosh|Mac OS/.test(value) ? "macOS" : /Windows/.test(value) ? "Windows" : /Linux/.test(value) ? "Linux" : "device";
  return `${browser} on ${device}`;
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "sessions-read", 30, 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Session refresh limit reached" }, { status: 429 });
  const current = await currentSession(request);
  const sessions = await new NeonRepository().listUserSessions(user.id);
  return NextResponse.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      current: session.id === current?.id,
      device: deviceLabel(session.userAgent),
      createdAt: session.createdAt.toISOString(),
      lastActivityAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      status: session.revokedAt ? "revoked" : session.expiresAt <= new Date() ? "expired" : "active",
    })),
  }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin session changes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid session action" }, { status: 400 });
  const rate = await enforceRateLimit(request, "sessions-write", 20, 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Session change limit reached" }, { status: 429 });
  const repo = new NeonRepository();
  const current = await currentSession(request);
  if (parsed.data.action === "revoke") {
    const revoked = await repo.revokeUserSession(user.id, parsed.data.sessionId);
    return NextResponse.json({ revoked, currentSessionRevoked: parsed.data.sessionId === current?.id });
  }
  if (parsed.data.action === "revoke_others") return NextResponse.json({ revoked: await repo.revokeUserSessions(user.id, current?.id) });
  return NextResponse.json({ revoked: await repo.revokeUserSessions(user.id), currentSessionRevoked: true });
}
