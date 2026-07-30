import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/recovery-forms";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
