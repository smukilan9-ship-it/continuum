import { redirect } from "next/navigation";
import type { Route } from "next";
import { getServerUser } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
import { publicRegistrationEnabled } from "@/lib/env";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const user = await getServerUser();
  const params = await searchParams;
  if (user) redirect((params.returnTo?.startsWith("/") ? params.returnTo : "/") as Route);
  return <LoginForm returnTo={params.returnTo} demoMode={!process.env.DATABASE_URL && process.env.NODE_ENV !== "production"} registrationEnabled={publicRegistrationEnabled()} />;
}
