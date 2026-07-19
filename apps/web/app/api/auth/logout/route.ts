import { NextResponse } from "next/server";
import { enforceRateLimit, revokeAppSession, sameOriginWrite, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin logout is not allowed" }, { status: 403 });
  const rate = await enforceRateLimit(request, "logout", Number(process.env.LOGOUTS_PER_MINUTE ?? 20), 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Logout rate limit exceeded" }, { status: 429, headers: { "retry-after": "60" } });
  await revokeAppSession(request);
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0, expires: new Date(0) });
  return response;
}
