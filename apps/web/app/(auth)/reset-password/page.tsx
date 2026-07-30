import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/recovery-forms";
import { inspectPasswordReset } from "@/lib/account-security";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  // Checked before render so an expired link shows its own state rather than a
  // form that can only fail on submit. Inspecting does not consume the token.
  const usable = Boolean(token) && (await inspectPasswordReset(token!).catch(() => ({ usable: false as const }))).usable;
  return <ResetPasswordForm token={token ?? ""} usable={usable} />;
}
