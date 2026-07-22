import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser, createAppSession, enforceRateLimit, sameOriginWrite, sessionCookie } from "@/lib/auth";
import { DEMO_USERNAME, resolveLoginIdentifier } from "@/lib/password-policy";

// Accept a valid email or the bare demo username; nothing else is a valid login.
const schema = z.object({
  email: z.union([z.string().email().max(254), z.literal(DEMO_USERNAME)]),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin login is not allowed" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  const addressRate = await enforceRateLimit(request, "login-address", 50, 15 * 60_000);
  if (!addressRate.allowed) return NextResponse.json({ error: "Too many login attempts", resetAt: addressRate.resetAt }, { status: 429 });
  const identifier = resolveLoginIdentifier(parsed.data.email);
  const rate = await enforceRateLimit(request, "login", 10, 15 * 60_000, identifier);
  if (!rate.allowed) return NextResponse.json({ error: "Too many login attempts", resetAt: rate.resetAt }, { status: 429 });
  const user = await authenticateUser(identifier, parsed.data.password);
  if (!user) return NextResponse.json({ error: "Email or password is incorrect" }, { status: 401 });
  const token = await createAppSession(user.id, request);
  return NextResponse.json({ user }, { headers: { "set-cookie": sessionCookie(token), "cache-control": "no-store" } });
}
