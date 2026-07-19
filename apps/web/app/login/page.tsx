import { redirect } from "next/navigation";
import type { Route } from "next";
import { getServerUser } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
import { publicRegistrationEnabled } from "@/lib/env";
import { googleSignInConfigured } from "@/lib/google-auth";

const authErrors: Record<string, string> = {
  cancelled: "Google sign-in was cancelled.",
  google_failed: "Google could not verify this account. Try again.",
  google_not_configured: "Google sign-in is not available yet.",
  invalid_state: "That sign-in request expired or was invalid. Start again.",
  rate_limited: "Too many sign-in attempts. Wait a few minutes and try again.",
  session_expired: "That sign-in request expired. Start again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; auth_error?: string }> }) {
  const user = await getServerUser();
  const params = await searchParams;
  if (user) redirect((params.returnTo?.startsWith("/") ? params.returnTo : "/") as Route);
  return <LoginForm returnTo={params.returnTo} demoMode={!process.env.DATABASE_URL && process.env.NODE_ENV !== "production"} registrationEnabled={publicRegistrationEnabled()} googleSignInEnabled={googleSignInConfigured()} authError={params.auth_error ? authErrors[params.auth_error] ?? "Sign-in could not be completed." : undefined} />;
}
