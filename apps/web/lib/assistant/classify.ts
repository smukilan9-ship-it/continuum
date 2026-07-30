/**
 * Decides how much context a message needs, so the user does not have to.
 *
 * The previous design exposed ten context scopes as checkboxes and branched
 * retrieval on them. That asked a student to design a retrieval strategy before
 * asking a question, and its default (`approved_memory`) quietly excluded the
 * project they were looking at — so the assistant was less informed than the
 * composer's "Workspace context ready" implied.
 *
 * Classification runs on a keyword/shape heuristic first. It is deterministic,
 * costs nothing, and is right for the clear cases; the model is consulted only
 * when the heuristic is genuinely unsure. Anything unresolved falls back to one
 * targeted retrieval pass — never a full-workspace scan.
 */

import { isConversationalFiller } from "./output-filter";

export type RequestClass =
  /** "hi", "thanks" — answer immediately, retrieve nothing. */
  | "chitchat"
  /** "what is the adiabatic theorem?" — general knowledge, retrieve nothing. */
  | "general_knowledge"
  /** "what did I decide about X?" — one targeted workspace pass. */
  | "about_my_work"
  /** "explain this error" — the current page is the context. */
  | "about_this_page"
  /** asked with attachments — use the attached passages. */
  | "about_a_document"
  /** "everything I have on X" — wide search, confirm before running. */
  | "broad_search";

export interface Classification {
  requestClass: RequestClass;
  /** 0–1. Below `MODEL_CONSULT_THRESHOLD` the caller may ask a model. */
  confidence: number;
  /** Why this class was chosen, for logging and the context inspector. */
  reason: string;
  /** How many retrieval passes this class permits. */
  retrievalPasses: 0 | 1 | 2;
  /** True when the user must approve the breadth before anything is fetched. */
  requiresConfirmation: boolean;
}

export const MODEL_CONSULT_THRESHOLD = 0.6;

/** First-person possessives that mean "my workspace". */
const POSSESSIVE = /\b(?:my|mine|our|i['’]?ve|i have|i did|i decided|i saved|i wrote|i added)\b/i;

/** Nouns that only exist inside Continuum. */
const WORKSPACE_NOUN =
  /\b(?:goal|goals|plan|planned|schedule|task|tasks|deadline|project|projects|source|sources|paper|papers|note|notes|decision|decisions|claim|claims|concept|concepts|progress|mastery|receipt|checkpoint|study|studying|revision|library|workspace|conversation)\b/i;

/** Deictic references that only resolve against what is on screen. */
const PAGE_DEICTIC =
  /\b(?:this|these|that|here|above|below|the error|the output|the code|the result|current|selected|on screen|this page|this file|this passage)\b/i;

/** Language that asks for breadth rather than an answer. */
const BROAD =
  /\b(?:everything|all of my|all my|across all|every (?:source|paper|note|project|goal)|anything (?:about|on)|full (?:review|audit|sweep)|search all|look through (?:all|everything)|comprehensive)\b/i;

/** Question shapes that are answerable without any user data. */
const GENERAL_KNOWLEDGE_OPENER =
  /^\s*(?:what(?:'|’)?s|what is|what are|who (?:is|was|were)|when (?:is|was|did)|where is|why (?:is|do|does|did)|how (?:do|does|did|can|would|is)|define|explain|describe|compare|difference between|tell me about)\b/i;

/** A request to produce something, not to recall something. */
const GENERATIVE =
  /\b(?:write|draft|generate|create|make me|give me an example|rewrite|translate|summari[sz]e this|convert)\b/i;

function classification(
  requestClass: RequestClass,
  confidence: number,
  reason: string,
): Classification {
  const retrievalPasses: 0 | 1 | 2 =
    requestClass === "chitchat" || requestClass === "general_knowledge" ? 0
      : requestClass === "broad_search" ? 2
        : 1;
  return {
    requestClass,
    confidence,
    reason,
    retrievalPasses,
    requiresConfirmation: requestClass === "broad_search",
  };
}

export interface ClassifyInput {
  message: string;
  /** True when the message carries ready attachments. */
  hasAttachments: boolean;
  /** True when the current route supplies a concrete record. */
  hasPageContext: boolean;
  /** Titles already referenced earlier in this conversation. */
  conversationEntities?: string[];
}

/**
 * The deterministic pass. Returns a classification with a confidence the caller
 * uses to decide whether a model consult is worth 1.5 seconds.
 */
export function classifyHeuristic(input: ClassifyInput): Classification {
  const message = input.message.trim();

  if (!message) return classification("chitchat", 1, "Empty message.");

  if (isConversationalFiller(message)) {
    return classification("chitchat", 0.98, "Greeting or acknowledgement with no request.");
  }

  // An attachment is an explicit instruction about what to read.
  if (input.hasAttachments) {
    return classification("about_a_document", 0.95, "The message carries attachments.");
  }

  if (BROAD.test(message)) {
    return classification("broad_search", 0.85, "Asks for breadth across the whole workspace.");
  }

  const possessive = POSSESSIVE.test(message);
  const workspaceNoun = WORKSPACE_NOUN.test(message);

  // "my goals", "what did I decide" — unambiguous references to stored work.
  if (possessive && workspaceNoun) {
    return classification("about_my_work", 0.95, "Refers to the user's own workspace records.");
  }

  // "explain this error" only means something against the current page.
  if (input.hasPageContext && PAGE_DEICTIC.test(message) && !possessive) {
    return classification("about_this_page", 0.85, "Refers to what is currently open.");
  }

  if (possessive) {
    return classification("about_my_work", 0.75, "First-person reference to the user's own material.");
  }

  // A definition question with no personal reference needs no retrieval.
  if (GENERAL_KNOWLEDGE_OPENER.test(message) && !workspaceNoun && !PAGE_DEICTIC.test(message)) {
    return classification("general_knowledge", 0.85, "General question with no reference to the user's work.");
  }

  if (GENERATIVE.test(message) && !workspaceNoun && !PAGE_DEICTIC.test(message)) {
    return classification("general_knowledge", 0.7, "Asks to produce something without referencing stored work.");
  }

  // A workspace noun without a possessive is ambiguous ("what is a good study
  // plan?" vs "what is my study plan?"). Retrieve once rather than guess wrong.
  if (workspaceNoun) {
    return classification("about_my_work", 0.55, "Mentions workspace concepts without saying whose.");
  }

  if (input.hasPageContext && PAGE_DEICTIC.test(message)) {
    return classification("about_this_page", 0.55, "Ambiguous, but something is open.");
  }

  // Unresolved. One targeted pass is the safe default: it is cheap, and being
  // under-informed is worse than a single extra query.
  return classification("about_my_work", 0.4, "Could not classify confidently; defaulting to one targeted pass.");
}

/**
 * True when the conversation already contains what the message refers to, so a
 * follow-up like "why?" or "expand on the second one" costs no retrieval.
 */
export function isAnsweredByConversation(input: ClassifyInput): boolean {
  const message = input.message.trim();
  if (message.length > 80) return false;

  const FOLLOW_UP =
    /^\s*(?:why|why not|how come|and\??|so\??|then\??|expand|go on|continue|more|tell me more|explain (?:that|it|more)|what about (?:that|it)|the (?:first|second|third|last) one|elaborate)\b/i;
  if (!FOLLOW_UP.test(message)) return false;

  // A follow-up only stands on its own if something preceded it.
  return (input.conversationEntities?.length ?? 0) > 0;
}

/** The retrieval plan a class permits, used by the orchestrator. */
export function retrievalPlan(classification: Classification) {
  return {
    useWorkspace:
      classification.requestClass === "about_my_work" ||
      classification.requestClass === "about_this_page" ||
      classification.requestClass === "broad_search",
    useMemory:
      classification.requestClass === "about_my_work" ||
      classification.requestClass === "broad_search",
    /**
     * The user's own indexed passages.
     *
     * Same classes as the workspace, because "what did I decide about X" and
     * "why can't X claim Y" are the same kind of question — one is answered by
     * a record and the other by a passage, and the user does not know or care
     * which. Leaving this off is why the product's headline claim failed: the
     * documents it is built to know were the one store nothing searched.
     */
    useSources:
      classification.requestClass === "about_my_work" ||
      classification.requestClass === "about_this_page" ||
      classification.requestClass === "broad_search",
    useAttachments:
      classification.requestClass === "about_a_document",
    /** Hard ceiling on records assembled into the prompt. */
    maxRecords: classification.requestClass === "broad_search" ? 12 : 8,
    /** Hard ceiling on context tokens. */
    maxTokens: classification.requestClass === "broad_search" ? 2_400 : 1_400,
  };
}
