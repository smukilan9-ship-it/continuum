/**
 * Turns a failed scholarly request into copy a person can act on (§13.2,
 * AC-LB3).
 *
 * The rule the old surface broke: every failure rendered the same sentence
 * ("We couldn't complete that search"), which told the user nothing about
 * whether to retry, change the query, or wait. Each class of failure has
 * exactly one recovery, so each gets its own sentence and its own affordance.
 *
 * The client sees the *Continuum* status, not the upstream one:
 * `/api/openalex` deliberately maps an OpenAlex 4xx to 502 so upstream detail
 * never becomes the user's problem. Where that detail is present and safe it is
 * used to recover the distinction, because an unparseable query and an outage
 * need opposite responses.
 */

export type ScholarlyFailure = {
  /** Heading. Names the provider so the user knows what is broken. */
  title: string;
  /** One sentence: what happened and what to do. */
  body: string;
  /** Whether re-issuing the identical request could plausibly work. */
  retryable: boolean;
  /** A settings pointer, when the recovery is a configuration change. */
  hint?: string;
  /** Safe upstream text, shown collapsed under "Technical details". */
  detail?: string;
};

export type FailureInput = {
  /** HTTP status seen by the browser. 0 means the request never completed. */
  status: number;
  code?: string;
  message?: string;
  detail?: string;
};

/**
 * OpenAlex answers a malformed query with its own explanation. When Continuum
 * has forwarded that text, a parameter complaint is recoverable by editing the
 * query, while anything else is an outage — the two must not share a message.
 */
const queryComplaint = /invalid|not a valid|unrecognis|unrecogniz|param|malformed|could not be parsed|syntax/i;

export function classifyScholarlyFailure(input: FailureInput): ScholarlyFailure {
  const { status, code, message, detail } = input;

  if (status === 400) {
    // Our own validation failures already carry exact copy ("Enter at least two
    // search characters."); keep it rather than overwriting it with a guess.
    if (message && code !== "openalex_upstream") {
      return { title: "That search could not run", body: message, retryable: false, detail };
    }
    return {
      title: "That query wasn't understood",
      body: "That query wasn't understood — try fewer operators.",
      retryable: false,
      detail,
    };
  }

  if (status === 401) {
    return {
      title: "Your session has expired",
      body: "Sign in again to keep searching. Nothing you have saved is affected.",
      retryable: false,
    };
  }

  if (status === 429) {
    return {
      title: "OpenAlex is rate-limiting",
      body: "OpenAlex is rate-limiting. Retry in a moment, or add your own key in Settings.",
      retryable: true,
      hint: "Settings › Connections › OpenAlex",
      detail,
    };
  }

  // An upstream 4xx arrives here as 502. If OpenAlex said the query was the
  // problem, that is a query problem, not an outage.
  if (code === "openalex_upstream" && detail && queryComplaint.test(detail)) {
    return {
      title: "That query wasn't understood",
      body: "That query wasn't understood — try fewer operators.",
      retryable: false,
      detail,
    };
  }

  return {
    title: "OpenAlex is unavailable",
    body: "OpenAlex is unavailable. Your saved sources still work.",
    retryable: true,
    detail: detail ?? (status ? undefined : message),
  };
}

/** Reads a failed `fetch` + JSON body into the shape the classifier expects. */
export function failureFromResponse(status: number, payload: { error?: string; detail?: string; code?: string } | undefined) {
  return classifyScholarlyFailure({ status, code: payload?.code, message: payload?.error, detail: payload?.detail });
}

/** A thrown network/abort error, which never produced a status at all. */
export function failureFromNetwork(cause: unknown): ScholarlyFailure {
  return classifyScholarlyFailure({ status: 0, message: cause instanceof Error ? cause.message : undefined });
}

export type ZoteroFailure = { title: string; body: string; action?: "reconnect" | "retry" };

/**
 * §13.3: "Errors are named." Zotero's own status text reaches the client
 * intact, so the cause is recoverable from it without inventing a code.
 */
export function classifyZoteroFailure(status: number, message: string | undefined): ZoteroFailure {
  const text = (message ?? "").toLowerCase();

  if (text.includes("not connected")) {
    return { title: "Zotero isn't connected", body: "Connect a read-only Zotero key to browse your libraries here.", action: "reconnect" };
  }
  if (text.includes("no longer be decrypted") || text.includes("invalid key") || text.includes("http 403") || text.includes("forbidden")) {
    return { title: "Your Zotero key no longer works", body: "Your Zotero key no longer works. Reconnect.", action: "reconnect" };
  }
  if (status === 403 || text.includes("permission") || text.includes("cannot access")) {
    return {
      title: "This key can't read group libraries",
      body: "This key can't read group libraries. Create one with group access.",
      action: "reconnect",
    };
  }
  if (status === 429 || text.includes("rate limit")) {
    return { title: "Zotero is rate-limiting", body: "Zotero is rate-limiting. Continuum will retry automatically in 60s.", action: "retry" };
  }
  if (text.includes("no longer exists") || status === 404) {
    return { title: "That Zotero item is gone", body: "It was removed in Zotero. Refresh the list to see what is still there.", action: "retry" };
  }
  return {
    title: "Zotero could not be reached",
    body: message?.trim() || "Zotero did not answer. Your imported sources are unaffected.",
    action: "retry",
  };
}
