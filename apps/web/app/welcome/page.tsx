import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { WelcomeScreen } from "@/components/welcome-screen";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * Onboarding is a route, not a condition inside Today.
 *
 * It used to render only on `/today` and only for a user with zero goals, so a
 * new user who landed on `/code`, `/research`, or `/learn` — from the sidebar, a
 * bookmark, or a shared link — got the full complex UI with no data and no
 * guidance at all.
 */
export default async function WelcomePage() {
  const user = await getServerUser();
  if (!user) redirect("/login?returnTo=%2Fwelcome");
  const snapshot = await getStore(user.id).workspace("today") as { goals?: unknown[] };
  if (snapshot.goals?.length) redirect("/today");
  return <WelcomeScreen userName={user.displayName.split(/\s+/)[0] ?? user.displayName} />;
}
