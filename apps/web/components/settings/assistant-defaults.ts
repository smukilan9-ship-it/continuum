/**
 * What the assistant may draw on without being asked each time (§9.11, Privacy).
 *
 * These are defaults, not permissions: a message can always narrow the sources
 * it uses, and nothing here grants a third party anything. They live on
 * `profiles.preferences`, which is already `jsonb`, so no migration is involved.
 *
 * Every switch defaults to on because that is what the product already did
 * before there was a control for it — shipping them off would silently change
 * every existing user's answers on their next question.
 */
export const ASSISTANT_DEFAULT_KEYS = ["sources", "obsidian", "zotero", "code"] as const;

export type AssistantDefaultKey = (typeof ASSISTANT_DEFAULT_KEYS)[number];
export type AssistantDefaults = Record<AssistantDefaultKey, boolean>;

export const ASSISTANT_DEFAULTS: AssistantDefaults = { sources: true, obsidian: true, zotero: true, code: true };

export const ASSISTANT_DEFAULT_COPY: Record<AssistantDefaultKey, { label: string; description: string }> = {
  sources: {
    label: "My sources",
    description: "Papers and files you uploaded or saved to Library.",
  },
  obsidian: {
    label: "My Obsidian notes",
    description: "Only the folder you paired — never your whole vault.",
  },
  zotero: {
    label: "My Zotero library",
    description: "Citation details and abstracts from the library you synced.",
  },
  code: {
    label: "My code",
    description: "Files and programs from the Code workspace.",
  },
};

export function normalizeAssistantDefaults(value: unknown): AssistantDefaults {
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  return Object.fromEntries(
    ASSISTANT_DEFAULT_KEYS.map((key) => [key, typeof record[key] === "boolean" ? record[key] : ASSISTANT_DEFAULTS[key]]),
  ) as AssistantDefaults;
}
