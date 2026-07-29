import { redirect } from "next/navigation";

/**
 * §9.11 names this area `/settings/*`. The workspace shell resolves a view from
 * the first path segment, and `account` is the segment it already knows, so
 * `/settings` is kept as an alias that lands on the same page rather than
 * inventing a second route the shell cannot resolve.
 */
export default function SettingsIndexPage() {
  redirect("/account");
}
