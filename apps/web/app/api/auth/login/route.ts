import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser, createAppSession, enforceRateLimit, sameOriginWrite, sessionCookie } from "@/lib/auth";

const schema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin login is not allowed" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  const addressRate = await enforceRateLimit(request, "login-address", 50, 15 * 60_000);
  if (!addressRate.allowed) return NextResponse.json({ error: "Too many login attempts", resetAt: addressRate.resetAt }, { status: 429 });
  const rate = await enforceRateLimit(request, "login", 10, 15 * 60_000, parsed.data.email);
  if (!rate.allowed) return NextResponse.json({ error: "Too many login attempts", resetAt: rate.resetAt }, { status: 429 });
  const user = await authenticateUser(parsed.data.email, parsed.data.password);
  if (!user) return NextResponse.json({ error: "Email or password is incorrect" }, { status: 401 });
  const token = await createAppSession(user.id, request);
  return NextResponse.json({ user }, { headers: { "set-cookie": sessionCookie(token), "cache-control": "no-store" } });
}
