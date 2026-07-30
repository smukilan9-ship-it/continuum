import type { ContextKind } from "@/components/ui";

/** A record the assistant actually retrieved (§11.6). Never a scope name. */
export type UsedContext = {
  type: string;
  id: string;
  label: string;
  href?: string;
  snippet?: string;
};

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  mode?: string;
  /** Set locally when a stream was stopped part-way (§11.8). */
  stopped?: boolean;
  metadata?: {
    attachmentIds?: string[];
    usedContext?: UsedContext[];
    mode?: AssistantMode;
    requestClass?: string;
    grounded?: boolean;
    depthOffer?: "search_sources" | "use_project";
    degraded?: string[];
  };
};

export type AssistantSession = {
  id: string;
  title: string;
  status: string;
  summary?: string;
  memoryExcluded?: boolean;
  pinned?: boolean;
  archived?: boolean;
  groupLabel?: string;
  contextSettings?: { mode?: AssistantMode };
  lastMessageAt?: string;
  messages?: AssistantMessage[];
  obsidianSync?: {
    syncId: string;
    status: "pending" | "syncing" | "retry" | "conflict" | "synced";
    error?: string;
    acknowledgedAt?: string;
  };
};

/** §11.7: three user-facing modes. BYOK is a chip, not a fourth option. */
export type AssistantMode = "auto" | "fast" | "deep";

export const ASSISTANT_MODES: readonly AssistantMode[] = ["auto", "fast", "deep"];

export function readMode(value: unknown): AssistantMode | undefined {
  return ASSISTANT_MODES.includes(value as AssistantMode) ? value as AssistantMode : undefined;
}

/** The route-derived chip attached on panel open (§8.5). */
export type PageContext = {
  kind: "goal" | "project" | "concept" | "build" | "source" | "week";
  id?: string;
  label: string;
  detail?: string;
};

/** A chip in the composer's control row: the page, an attachment, or a pin. */
export type ComposerChip = {
  id: string;
  kind: ContextKind;
  label: string;
  origin: "page" | "attachment" | "pinned";
  /** Attachments only: how the file was filed (§11.4). */
  retention?: "library" | "session";
  state?: "extracting" | "ready" | "error";
  message?: string;
  pageContext?: PageContext;
};

export type BroadSearchConfirmation = {
  question: string;
  sourceCount: number;
  estimateSeconds: number;
  /** The message that triggered it, replayed once the user chooses. */
  message: string;
};

/** Maps a provenance record's type onto the chip vocabulary. */
export function chipKind(type: string): ContextKind {
  switch (type) {
    case "goal": case "project": case "source": case "paper":
    case "concept": case "conversation": case "decision": case "note":
      return type;
    case "attachment": return "file";
    case "passage": return "source";
    case "task": return "goal";
    default: return "note";
  }
}
