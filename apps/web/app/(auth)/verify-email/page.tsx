import type { Metadata } from "next";
import { VerifyEmailPanel } from "@/components/recovery-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm your email", robots: { index: false, follow: false } };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <VerifyEmailPanel token={token ?? ""} />;
}
