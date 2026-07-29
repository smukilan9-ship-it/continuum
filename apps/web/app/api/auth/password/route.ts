import { NextResponse } from "next/server";
import { z } from "zod";
import { changePassword, completePasswordReset, issuePasswordReset } from "@/lib/account-security";
import { currentSession, enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { passwordSchema } from "@/lib/password-policy";

const changeSchema = z.object({
  action: z.literal("change"),
  currentPassword: z.string().min(1).max(200),
  password: passwordSchema,
  passwordConfirmation: z.string().min(1).max(200),
}).refine((value) => value.password === value.passwordConfirmation, { path: ["passwordConfirmation"], message: "Passwords do not match" });

const requestResetSchema = z.object({
  action: z.literal("request_reset"),
  username: z.string().trim().min(1).max(120),
});

const performResetSchema = z.object({
  action: z.literal("perform_reset"),
  token: z.string().min(20).max(400),
  password: passwordSchema,
  passwordConfirmation: z.string().min(1).max(200),
}).refine((value) => value.password === value.passwordConfirmation, { path: ["passwordConfirmation"], message: "Passwords do not match" });

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("change") }).passthrough(),
  z.object({ action: z.literal("request_reset") }).passthrough(),
  z.object({ action: z.literal("perform_reset") }).passthrough(),
]);

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin password changes are not allowed" }, { status: 403 });
  const body = await request.json().catch(() => undefined);
  const routed = schema.safeParse(body);
  if (!routed.success) return NextResponse.json({ error: "Check the password form" }, { status: 400 });

  if (routed.data.action === "request_reset") {
    const parsed = requestResetSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Enter your username" }, { status: 400 });

    // Rate limited by IP because there is no authenticated user yet. A throttled
    // request returns the same acknowledgement as a successful one so the
    // endpoint cannot be used to probe which usernames exist.
    const rate = await enforceRateLimit(request, "password-reset-request", 5, 60 * 60_000);
    if (rate.allowed) {
      const issued = await issuePasswordReset(parsed.data.username).catch(() => ({ issued: false as const }));
      // No mail provider is wired up in this repository. The token is created
      // and logged server-side so an operator can complete the flow; it is
      // never returned to the browser, which would defeat the whole mechanism.
      if (issued.issued) {
        console.info("password_reset_issued", JSON.stringify({ userId: issued.userId, path: `/reset-password?token=${issued.token}` }));
      }
    }
    return NextResponse.json({ requested: true });
  }

  if (routed.data.action === "perform_reset") {
    const parsed = performResetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the new password" }, { status: 400 });
    }
    const rate = await enforceRateLimit(request, "password-reset-perform", 10, 60 * 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

    const result = await completePasswordReset(parsed.data.token, parsed.data.password);
    if (!result.ok) {
      return NextResponse.json({
        error: result.state === "reused"
          ? "Choose a password you have not used recently."
          : "This link has expired or has already been used. Request a new one.",
      }, { status: 400 });
    }
    return NextResponse.json({ reset: true, otherSessionsRevoked: true });
  }

  const parsed = changeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the password form", issues: parsed.error.issues }, { status: 400 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "password-change", 5, 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Too many password-change attempts" }, { status: 429 });
  const session = await currentSession(request);
  const result = await changePassword(user.id, parsed.data.currentPassword, parsed.data.password, session?.id);
  if (!result.ok) {
    return NextResponse.json({
      error: result.state === "reused" ? "Choose a password you have not used recently." : "The current password is incorrect.",
    }, { status: 400 });
  }
  return NextResponse.json({ changed: true, otherSessionsRevoked: true });
}
