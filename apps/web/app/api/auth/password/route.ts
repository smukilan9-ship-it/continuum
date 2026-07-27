import { NextResponse } from "next/server";
import { z } from "zod";
import { changePassword } from "@/lib/account-security";
import { currentSession, enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { passwordSchema } from "@/lib/password-policy";

const schema = z.object({
  action: z.literal("change"),
  currentPassword: z.string().min(1).max(200),
  password: passwordSchema,
  passwordConfirmation: z.string().min(1).max(200),
}).refine((value) => value.password === value.passwordConfirmation, { path: ["passwordConfirmation"], message: "Passwords do not match" });

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin password changes are not allowed" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
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
