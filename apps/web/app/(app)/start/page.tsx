import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { StartScreen } from "@/components/start/start-screen";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * §9.3 first run, at the `/start` address §16.7 specifies. `/welcome` is now a
 * 308 to here.
 *
 * Onboarding is a route, not a condition inside Home. It used to render only on
 * `/today` and only for a user with zero goals, so a new user who landed on
 * `/build`, `/research`, or `/learn` — from the sidebar, a bookmark, or a
 * shared link — got the full complex UI with no data and no guidance at all.
 */
export default async function StartPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?returnTo=%2Fstart");
  const shell = await getStore(user.id).shellData();
  if (shell.goals.length) redirect("/home");
  return <StartScreen userName={user.displayName.split(/\s+/)[0] ?? user.displayName} />;
}
