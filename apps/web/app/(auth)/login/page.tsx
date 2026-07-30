import { redirect } from "next/navigation";
import type { Route } from "next";
import { getServerUser } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
import { demoLoginEnabled, publicRegistrationEnabled } from "@/lib/env";

const authErrors: Record<string, string> = {
  rate_limited: "Too many sign-in attempts. Wait a few minutes and try again.",
  session_expired: "That sign-in request expired. Start again.",
};

export const metadata = { title: "Sign in — Continuum", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; auth_error?: string; mode?: string }> }) {
  const user = await getServerUser();
  const params = await searchParams;
  if (user) redirect((params.returnTo?.startsWith("/") ? params.returnTo : "/home") as Route);
  return <LoginForm initialMode={params.mode === "register" ? "register" : "login"} returnTo={params.returnTo} demoMode={!process.env.DATABASE_URL && process.env.NODE_ENV !== "production"} registrationEnabled={publicRegistrationEnabled()} demoAvailable={Boolean(process.env.DATABASE_URL) && demoLoginEnabled()} authError={params.auth_error ? authErrors[params.auth_error] ?? "Sign-in could not be completed." : undefined} />;
}
