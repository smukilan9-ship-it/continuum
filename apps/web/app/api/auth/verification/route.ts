import { NextResponse } from "next/server";
import { z } from "zod";
import { completeEmailVerification, issueEmailVerification } from "@/lib/account-security";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send") }),
  z.object({ action: z.literal("confirm"), token: z.string().min(20).max(400) }),
]);

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin requests are not allowed" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Check the request and try again" }, { status: 400 });

  if (parsed.data.action === "confirm") {
    const rate = await enforceRateLimit(request, "email-verify-confirm", 10, 60 * 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    const result = await completeEmailVerification(parsed.data.token);
    if (!result.ok) return NextResponse.json({ error: "This link has expired or has already been used." }, { status: 400 });
    return NextResponse.json({ verified: true });
  }

  // Sending requires a signed-in user: the address being confirmed is the one on
  // the current account, so there is nothing to look up and nothing to leak.
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "email-verify-send", 3, 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "You have requested this a few times already. Try again later." }, { status: 429 });

  const { token } = await issueEmailVerification(user.id);
  // As with password reset, no mail provider is configured here. The link is
  // logged server-side rather than returned to the browser.
  console.info("email_verification_issued", JSON.stringify({ userId: user.id, path: `/verify-email?token=${token}` }));
  return NextResponse.json({ sent: true });
}
