"use client";

import { useCallback, useEffect, useState } from "react";

import { normalizeAssistantDefaults, type AssistantDefaults } from "./assistant-defaults";

export type SettingsProfile = {
  account: { displayName: string; educationLevel: string; email: string; emailVerified: boolean };
  assistantDefaults: AssistantDefaults;
};

/**
 * Identity and assistant-source defaults, read and written through the one
 * owned endpoint that merges into `profiles.preferences` instead of replacing
 * it. The switches update optimistically and roll back on failure — a privacy
 * control that appears to have taken effect and has not is worse than one that
 * is slow.
 */
export function useSettingsProfile(showToast: (message: string | null) => void) {
  const [profile, setProfile] = useState<SettingsProfile>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/account/preferences", { cache: "no-store" });
      const payload = await response.json() as SettingsProfile & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Your settings could not be loaded.");
      setProfile({ account: payload.account, assistantDefaults: normalizeAssistantDefaults(payload.assistantDefaults) });
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your settings could not be loaded.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (patch: { displayName?: string; educationLevel?: string; assistantDefaults?: Partial<AssistantDefaults> }) => {
    const previous = profile;
    if (previous && patch.assistantDefaults) {
      setProfile({ ...previous, assistantDefaults: { ...previous.assistantDefaults, ...patch.assistantDefaults } });
    }
    setSaving(true);
    try {
      const response = await fetch("/api/account/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await response.json() as SettingsProfile & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "That change could not be saved.");
      setProfile({ account: payload.account, assistantDefaults: normalizeAssistantDefaults(payload.assistantDefaults) });
      return true;
    } catch (cause) {
      if (previous) setProfile(previous);
      showToast(cause instanceof Error ? cause.message : "That change could not be saved.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [profile, showToast]);

  return { profile, error, saving, save, reload: load };
}
