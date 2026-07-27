import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { issueVerificationEmail, verifyEmailToken } from "@/lib/account-security";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify"), token: z.string().min(32).max(200) }),
  z.object({ action: z.literal("resend") }),
]);

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin verification is not allowed" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid verification request" }, { status: 400 });
  if (parsed.data.action === "verify") {
    const rate = await enforceRateLimit(request, "email-verify", 20, 60 * 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many verification attempts" }, { status: 429 });
    const verified = await verifyEmailToken(parsed.data.token);
    return verified
      ? NextResponse.json({ verified: true, redirectTo: "/" }, { headers: { "cache-control": "no-store" } })
      : NextResponse.json({ error: "This verification link is invalid, expired, or already used." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to resend verification" }, { status: 401 });
  if (user.emailVerified) return NextResponse.json({ sent: false, alreadyVerified: true });
  const rate = await enforceRateLimit(request, "email-verify-resend", 3, 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "A verification email was sent recently. Try again later.", resetAt: rate.resetAt }, { status: 429 });
  await issueVerificationEmail(request, user.id);
  return NextResponse.json({ sent: true, message: "Verification instructions were sent." });
}
