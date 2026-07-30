export const featureNames = ["zotero", "obsidian", "chatgpt_ui", "voice", "demo_token"] as const;
export type FeatureName = (typeof featureNames)[number];

export function getFeatureFlags(value = process.env.FEATURE_FLAGS ?? "") {
  const enabled = new Set(value.split(",").map((flag) => flag.trim()).filter(Boolean));
  return Object.fromEntries(featureNames.map((flag) => [flag, enabled.has(flag)])) as Record<FeatureName, boolean>;
}
