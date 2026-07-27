import { NextResponse } from "next/server";
import { z } from "zod";
import { changePassword, inspectRecoveryToken, requestRecoveryEmail, resetPassword, safeRecoveryResponse } from "@/lib/account-security";
import { currentSession, enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { passwordSchema } from "@/lib/password-policy";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("forgot"), email: z.string().email().max(254).transform((value) => value.toLowerCase()) }),
  z.object({ action: z.literal("inspect"), token: z.string().min(32).max(200) }),
  z.object({
    action: z.literal("reset"),
    token: z.string().min(32).max(200),
    password: passwordSchema,
    passwordConfirmation: z.string().min(1).max(200),
  }).refine((value) => value.password === value.passwordConfirmation, { path: ["passwordConfirmation"], message: "Passwords do not match" }),
  z.object({
    action: z.literal("change"),
    currentPassword: z.string().min(1).max(200),
    password: passwordSchema,
    passwordConfirmation: z.string().min(1).max(200),
  }).refine((value) => value.password === value.passwordConfirmation, { path: ["passwordConfirmation"], message: "Passwords do not match" }),
]);

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin password changes are not allowed" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Check the password form", issues: parsed.error.issues }, { status: 400 });
  if (parsed.data.action === "forgot") {
    const addressRate = await enforceRateLimit(request, "password-forgot-address", 10, 60 * 60_000);
    const accountRate = await enforceRateLimit(request, "password-forgot-account", 3, 60 * 60_000, parsed.data.email);
    if (!addressRate.allowed || !accountRate.allowed) return NextResponse.json(safeRecoveryResponse(), { status: 202 });
    await requestRecoveryEmail(request, parsed.data.email).catch(() => undefined);
    return NextResponse.json(safeRecoveryResponse(), { status: 202, headers: { "cache-control": "no-store" } });
  }
  if (parsed.data.action === "inspect") {
    const result = await inspectRecoveryToken(parsed.data.token);
    return NextResponse.json(result, { status: result.valid ? 200 : 400, headers: { "cache-control": "no-store" } });
  }
  if (parsed.data.action === "reset") {
    const rate = await enforceRateLimit(request, "password-reset", 10, 60 * 60_000);
    if (!rate.allowed) return NextResponse.json({ error: "Too many reset attempts" }, { status: 429 });
    const result = await resetPassword(parsed.data.token, parsed.data.password);
    if (!result.ok) {
      return NextResponse.json({
        error: result.state === "reused"
          ? "Choose a password you have not used recently."
          : "This reset link is invalid, expired, or already used.",
      }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ reset: true, converted: result.converted, redirectTo: "/login?password_reset=1" }, { headers: { "cache-control": "no-store" } });
  }
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
