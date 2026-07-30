import { redirect } from "next/navigation";

/** §7.1: `/settings` is the area, `/settings/account` is its first page. */
export default function SettingsIndexPage() {
  redirect("/settings/account");
}
