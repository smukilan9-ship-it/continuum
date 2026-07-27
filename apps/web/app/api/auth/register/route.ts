import { NextResponse } from "next/server";
import { z } from "zod";
import { createAppSession, enforceRateLimit, registerUser, sameOriginWrite, sessionCookie } from "@/lib/auth";
import { issueVerificationEmail } from "@/lib/account-security";
import { publicRegistrationEnabled } from "@/lib/env";
import { passwordSchema } from "@/lib/password-policy";

const schema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
  password: passwordSchema,
  passwordConfirmation: z.string().min(1).max(200),
  displayName: z.string().trim().min(2).max(80),
  timezone: z.string().min(1).max(80).refine((value) => {
    try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
  }, "Invalid IANA timezone"),
  educationLevel: z.string().trim().max(120).optional(),
  termsAccepted: z.literal(true),
}).refine((value) => value.password === value.passwordConfirmation, {
  path: ["passwordConfirmation"],
  message: "Passwords do not match",
});

export async function POST(request: Request) {
  if (!publicRegistrationEnabled()) return NextResponse.json({ error: "Public registration is not enabled" }, { status: 403 });
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin registration is not allowed" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid account details", issues: parsed.error.issues }, { status: 400 });
  const addressRate = await enforceRateLimit(request, "register-address", 20, 60 * 60_000);
  if (!addressRate.allowed) return NextResponse.json({ error: "Too many registration attempts", resetAt: addressRate.resetAt }, { status: 429 });
  const rate = await enforceRateLimit(request, "register", 5, 60 * 60_000, parsed.data.email);
  if (!rate.allowed) return NextResponse.json({ error: "Too many registration attempts", resetAt: rate.resetAt }, { status: 429 });
  try {
    const user = await registerUser(parsed.data);
    const verification = await issueVerificationEmail(request, user.id);
    const token = await createAppSession(user.id, request);
    return NextResponse.json({
      user,
      verificationRequired: true,
      emailDelivery: verification?.delivery.provider === "development_noop" ? "not_configured_in_development" : "sent",
      message: "Account created. Check your email to verify this address.",
    }, { status: 201, headers: { "set-cookie": sessionCookie(token), "cache-control": "no-store" } });
  } catch (error) {
    const duplicate = error instanceof Error && /unique|duplicate/i.test(error.message);
    if (duplicate) {
      return NextResponse.json({
        accepted: true,
        verificationRequired: true,
        message: "If this address is eligible, verification instructions have been sent.",
      }, { status: 201, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: "Account creation failed" }, { status: 500 });
  }
}
