"use client";

import { ConnectionsSettings } from "@/components/settings/connections-settings";

type Toast = (message: string | null) => void;

/**
 * The `integrations` view's entry point.
 *
 * The page itself is now `components/settings/connections-settings.tsx`, where
 * it is grouped by outcome rather than presented as a flat list of equal-weight
 * rows (§9.10, S3) and shares its cards, status vocabulary, and setup dialogs
 * with Settings › Connections. This file remains the name the workspace shell
 * imports, so no routing or navigation change was needed.
 */
export function IntegrationsScreen({ showToast }: { showToast: Toast }) {
  return <ConnectionsSettings showToast={showToast} />;
}
