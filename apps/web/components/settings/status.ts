import type { StatusTone } from "@/components/ui";

/**
 * The one status vocabulary, product-wide (redesign.md §9.10).
 *
 * Connections used to invent a word per card — "Ready to connect", "Optional",
 * "Handoff", "Token active", "Setup incomplete", "Streaming verified", "Needs a
 * check", "Replace key" — eleven phrases for seven states, so nothing could be
 * scanned and nothing could be compared. Every surface now picks from this set,
 * and the tone is derived from the word rather than chosen per call site.
 *
 * `WORKING_NO_SETUP` exists because a capability that already works without a
 * key is not "Not connected" (C8). OpenAlex answers Continuum through its polite
 * pool; reporting it as disconnected read as a broken integration.
 */
export const CONNECTION_STATUS = {
  NOT_CONNECTED: "Not connected",
  WORKING: "Working",
  WORKING_NO_SETUP: "Working — no setup needed",
  SYNCING: "Syncing…",
  NEEDS_ATTENTION: "Needs attention",
  EXPIRED: "Expired",
  PAUSED: "Paused",
} as const;

export type ConnectionStatus = (typeof CONNECTION_STATUS)[keyof typeof CONNECTION_STATUS];

const TONES: Record<ConnectionStatus, StatusTone> = {
  [CONNECTION_STATUS.NOT_CONNECTED]: "neutral",
  [CONNECTION_STATUS.WORKING]: "success",
  [CONNECTION_STATUS.WORKING_NO_SETUP]: "success",
  [CONNECTION_STATUS.SYNCING]: "processing",
  [CONNECTION_STATUS.NEEDS_ATTENTION]: "warning",
  [CONNECTION_STATUS.EXPIRED]: "danger",
  [CONNECTION_STATUS.PAUSED]: "neutral",
};

export function statusTone(status: ConnectionStatus): StatusTone {
  return TONES[status];
}

/** A connected card opens by default: its controls are why the user came. */
export function isLive(status: ConnectionStatus) {
  return status === CONNECTION_STATUS.WORKING || status === CONNECTION_STATUS.SYNCING;
}

/** States that need the user to do something now, so the card opens for them. */
export function needsUser(status: ConnectionStatus) {
  return status === CONNECTION_STATUS.NEEDS_ATTENTION || status === CONNECTION_STATUS.EXPIRED;
}
