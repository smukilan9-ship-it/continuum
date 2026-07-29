"use client";

import type { AuthUser } from "@continuum/db";

import { SettingsPage } from "@/components/settings/settings-page";

type Toast = (message: string | null) => void;

/**
 * The `account` view's entry point.
 *
 * It used to be the whole of settings: identity, password, sessions, the data
 * export, and account deletion on one scroll (S9). That page is now the eight
 * segments of §9.11 in `components/settings/`; this file stays as the mount
 * point the workspace router already knows about, so the split did not require
 * a change to routing or navigation.
 */
export function AccountScreen({ user, showToast }: { user: AuthUser; showToast: Toast }) {
  return <SettingsPage user={user} showToast={showToast} />;
}
