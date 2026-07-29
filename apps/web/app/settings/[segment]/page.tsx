import type { Route } from "next";
import { redirect } from "next/navigation";

const SEGMENTS = new Set(["account", "appearance", "ai", "privacy", "security", "data", "advanced"]);

/**
 * `/settings/<segment>` aliases. Connections has its own live route, so it
 * resolves there instead of opening the embedded copy — one page, one address.
 */
export default async function SettingsSegmentAliasPage({ params }: { params: Promise<{ segment: string }> }) {
  const { segment } = await params;
  if (segment === "connections") redirect("/integrations");
  redirect((SEGMENTS.has(segment) && segment !== "account" ? `/account/${segment}` : "/account") as Route);
}
