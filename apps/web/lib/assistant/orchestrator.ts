/**
 * The eleven-step retrieval contract of §11.3, in one place.
 *
 * It used to live inline in `api/assistant/route.ts`, interleaved with request
 * parsing, persistence, and stream plumbing, which made the actual policy — how
 * much of someone's workspace a question is allowed to reach — impossible to
 * read or test on its own. Everything here is pure with respect to the request:
 * it takes a store and a message and returns the context, the provenance, and
 * the reason for both.
 *
 * The rules it enforces, in the order they apply:
 *   1  classify the request                       (`classify.ts`)
 *   2  reuse conversational context when it suffices — zero retrieval
 *   3  resolve the current page to concrete records
 *   4  one targeted workspace pass for `about_my_work`
 *   5  connected sources only for documents and approved broad searches
 *   6  never scan the whole workspace without explicit consent
 *   7  rank, deduplicate, and cap
 *   8  record real provenance
 *   9  hand a redacted context to prompt assembly
 *  10  degrade on a deadline rather than block the first token
 *  11  offer depth instead of assuming it
 */

import type { Store } from "@/lib/store";
import { classifyHeuristic, isAnsweredByConversation, retrievalPlan, type Classification } from "./classify";
import { fromAttachments, fromMemoryChunks, fromWorkspaceContext, labelMap, mergeProvenance, type UsedContextEntry } from "./provenance";

/** The route-derived chip (§8.5). One of these is attached on panel open. */
export type PageContextKind = "goal" | "project" | "concept" | "build" | "source" | "week";

export interface PageContext {
  kind: PageContextKind;
  id?: string;
  /** What the chip reads, already user-facing: "Goal: Ace the SAT". */
  label: string;
  /** Free-form extra the page owns — Build's last run, a passage number. */
  detail?: string;
}

/** How a broad search was resolved by the user (§11.3 step 6). */
export type BroadSearchChoice = "everything" | "current";

export interface OrchestrateInput {
  store: Store;
  message: string;
  attachmentIds: string[];
  /** Prior turns, newest last, with whatever provenance they recorded. */
  history: Array<{ role: string; content: string; usedContext?: Array<{ id?: string; label?: string }> }>;
  pageContext?: PageContext;
  broadSearch?: BroadSearchChoice;
  /** Records the user marked "Don't use this again" in this conversation. */
  excludedRecordIds?: string[];
}

export interface ConfirmationRequest {
  /** The exact question rendered in the thread. */
  question: string;
  sourceCount: number;
  estimateSeconds: number;
}

export interface OrchestrateResult {
  classification: Classification;
  /** Set when §11.3 step 6 requires consent before anything is retrieved. */
  confirmation?: ConfirmationRequest;
  /** The assembled, still-unredacted context handed to prompt assembly. */
  context: Record<string, unknown>;
  usedContext: UsedContextEntry[];
  labels: Map<string, string>;
  taskClass: TaskClass;
  /** Which stages hit their deadline and returned partial results (step 10). */
  degraded: string[];
  /** The depth chip offered under the answer (step 11), if any. */
  depthOffer?: "search_sources" | "use_project";
  /** The status the composer shows instead of an unexplained spinner (§11.9). */
  statusLabel: string;
  /** True when nothing at all was retrieved, so the answer must say so (AC-A6). */
  groundedInWorkspace: boolean;
}

type TaskClass = "conversational_support" | "research_synthesis" | "document_understanding" | "code_reasoning";

/** §11.3: classification 1.5s, retrieval 2.0s, page context 300ms. */
export const DEADLINES = { classification: 1_500, retrieval: 2_000, pageContext: 300 } as const;

/** §11.3 step 7. */
const SIMILARITY_FLOOR = 0.35;
const MAX_RECORDS = 8;
const MAX_CONTEXT_TOKENS = 2_000;

/**
 * Runs `work` under a deadline. A stage that overruns yields its fallback and
 * names itself in `degraded` — the answer still ships, and §11.6 requires the
 * interface to say the reach was smaller than intended rather than imply it was
 * complete.
 */
async function withDeadline<T>(label: string, ms: number, work: Promise<T>, fallback: T, degraded: string[]): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<typeof TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), ms); });
  try {
    const settled = await Promise.race([work.catch(() => TIMED_OUT), expiry]);
    if (settled === TIMED_OUT) { degraded.push(label); return fallback; }
    return settled as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const TIMED_OUT = Symbol("timed-out");

function taskClassFor(classification: Classification, mode: "auto" | "fast" | "deep"): TaskClass {
  // An explicit Deep selection is the user asking for the slower route on
  // purpose, so it wins over the inferred class.
  if (mode === "deep") return "research_synthesis";
  if (classification.requestClass === "about_a_document") return "document_understanding";
  if (classification.requestClass === "broad_search") return "research_synthesis";
  return "conversational_support";
}

/** §11.9: name the step rather than showing an unexplained spinner. */
function statusFor(classification: Classification, pageContext?: PageContext): string {
  switch (classification.requestClass) {
    case "chitchat":
    case "general_knowledge": return "Thinking…";
    case "about_a_document": return "Reading the attached material…";
    case "about_this_page": return pageContext ? `Looking at ${pageContext.label.replace(/^[^:]+:\s*/, "")}…` : "Looking at this page…";
    case "broad_search": return "Searching everything…";
    case "about_my_work": return pageContext ? `Looking through ${pageContext.label.replace(/^[^:]+:\s*/, "")}…` : "Looking through your workspace…";
  }
}

/**
 * §11.3 step 3. Turns the route chip into the records that page is *about*, so
 * "explain this error" has the file and the run, and "what did I decide" on a
 * project page is scoped to that project without the user saying so.
 */
async function resolvePageContext(store: Store, page: PageContext | undefined, degraded: string[]): Promise<{ records: Record<string, unknown> | undefined; provenance: UsedContextEntry[] }> {
  if (!page) return { records: undefined, provenance: [] };
  // Build and week context is carried on the chip itself — the page already
  // holds it, and a round-trip to re-read it would be pure latency.
  if (page.kind === "build" || page.kind === "week" || !page.id) {
    return { records: { page: { kind: page.kind, label: page.label, detail: page.detail } }, provenance: [] };
  }
  const read = async (): Promise<{ records: Record<string, unknown> | undefined; provenance: UsedContextEntry[] }> => {
    if (page.kind === "goal") {
      const goal = await store.read("load_goal", { goalId: page.id }) as Record<string, unknown> | undefined;
      if (!goal) return { records: undefined, provenance: [] };
      return { records: { page: { kind: "goal", ...goal } }, provenance: fromWorkspaceContext({ goals: [(goal as { goal?: unknown }).goal ?? goal], tasks: (goal as { tasks?: unknown }).tasks }) };
    }
    if (page.kind === "project") {
      const project = await store.read("load_project", { projectId: page.id, limit: 4 }) as Record<string, unknown> | undefined;
      if (!project) return { records: undefined, provenance: [] };
      return { records: { page: { kind: "project", ...project } }, provenance: fromWorkspaceContext({ projects: [(project as { project?: unknown }).project ?? project], decisions: (project as { decisions?: unknown }).decisions }) };
    }
    if (page.kind === "concept") {
      const state = await store.getLearningState(page.id);
      return {
        records: { page: { kind: "concept", label: page.label, mastery: state } },
        provenance: [{ type: "concept", id: page.id!, label: page.label.replace(/^[^:]+:\s*/, ""), href: `/learn?concept=${encodeURIComponent(page.id!)}` }],
      };
    }
    // A library detail page: the source and the passages that matched.
    const chunks = (await store.listSourceChunks()).filter((chunk) => chunk.sourceId === page.id).slice(0, 8);
    if (!chunks.length) return { records: { page: { kind: "source", label: page.label } }, provenance: [] };
    return {
      records: { page: { kind: "source", label: page.label, passages: chunks.map((chunk) => ({ passage: chunk.passage, text: chunk.text.slice(0, 1_200) })) } },
      provenance: [{ type: "source", id: page.id!, label: page.label.replace(/^[^:]+:\s*/, ""), href: `/library?tab=sources&source=${encodeURIComponent(page.id!)}`, snippet: chunks[0]?.text.slice(0, 400) }],
    };
  };
  return withDeadline("page context", DEADLINES.pageContext, read(), { records: { page: { kind: page.kind, label: page.label } }, provenance: [] }, degraded);
}

/**
 * §11.3 step 7. `0.6 × similarity + 0.25 × recency + 0.15 × importance`, all
 * three of which already exist on `memory_chunks`. Anything under the similarity
 * floor is dropped rather than padding the prompt to a record count.
 */
function rankMemory(chunks: Array<Record<string, unknown>>, excluded: Set<string>): Array<Record<string, unknown>> {
  const now = Date.now();
  const scored = chunks
    .filter((chunk) => !excluded.has(String(chunk.id)))
    .map((chunk) => {
      const similarity = typeof chunk.score === "number" ? chunk.score : 0.5;
      const occurred = Date.parse(String(chunk.occurredAt ?? ""));
      // Half-life of roughly 30 days; an old record can still win on similarity.
      const recency = Number.isFinite(occurred) ? Math.exp(-Math.max(0, now - occurred) / (30 * 24 * 3_600_000)) : 0.3;
      const importance = typeof chunk.importance === "number" ? chunk.importance : 0.5;
      return { chunk, similarity, rank: 0.6 * similarity + 0.25 * recency + 0.15 * importance };
    })
    // A lexical-only store returns no score; the 0.5 default keeps those
    // results rather than silently discarding every hit without embeddings.
    .filter((entry) => entry.similarity >= SIMILARITY_FLOOR)
    .sort((left, right) => right.rank - left.rank);
  return scored.slice(0, MAX_RECORDS).map((entry) => entry.chunk);
}

/** A deliberately coarse token estimate — the same 4-chars-per-token rule the
 *  rest of the context budget uses. */
function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value ?? "").length / 4);
}

/** §11.3 step 7's hard 2,000-token ceiling, applied by dropping whole records
 *  from the tail rather than truncating one mid-sentence. */
function capContext(records: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const kept: Array<Record<string, unknown>> = [];
  let total = 0;
  for (const record of records) {
    const cost = estimateTokens(record);
    if (total + cost > MAX_CONTEXT_TOKENS && kept.length) break;
    kept.push(record);
    total += cost;
  }
  return kept;
}

export async function orchestrate(input: OrchestrateInput & { mode?: "auto" | "fast" | "deep" }): Promise<OrchestrateResult> {
  const degraded: string[] = [];
  const excluded = new Set(input.excludedRecordIds ?? []);
  const conversationEntities = input.history
    .slice(-6)
    .flatMap((message) => (message.usedContext ?? []).map((entry) => String(entry.label ?? "")))
    .filter(Boolean);

  // Step 1 — classify.
  const classification = classifyHeuristic({
    message: input.message,
    hasAttachments: input.attachmentIds.length > 0,
    hasPageContext: Boolean(input.pageContext),
    conversationEntities,
  });
  const taskClass = taskClassFor(classification, input.mode ?? "auto");
  const base = {
    classification,
    taskClass,
    degraded,
    statusLabel: statusFor(classification, input.pageContext),
  };

  // Step 2 — a follow-up whose referent is already on screen costs nothing.
  if (isAnsweredByConversation({ message: input.message, hasAttachments: false, hasPageContext: Boolean(input.pageContext), conversationEntities })) {
    return { ...base, context: {}, usedContext: [], labels: new Map(), groundedInWorkspace: false, statusLabel: "Thinking…" };
  }

  // Step 6 — a wide search is never run on a guess. Nothing is retrieved until
  // the user picks a breadth, which is what "approve especially broad searches"
  // has to mean if it is to mean anything.
  if (classification.requiresConfirmation && !input.broadSearch) {
    const sourceCount = await input.store.listSources().then((rows) => rows.length).catch(() => 0);
    return {
      ...base,
      context: {},
      usedContext: [],
      labels: new Map(),
      groundedInWorkspace: false,
      confirmation: {
        question: sourceCount
          ? `This looks like a wide search. Want me to look across all ${sourceCount} source${sourceCount === 1 ? "" : "s"}?`
          : "This looks like a wide search. Want me to look across your whole workspace?",
        sourceCount,
        // ~250ms per source with a floor, so the estimate is honest at both ends.
        estimateSeconds: Math.max(2, Math.round(sourceCount * 0.25)),
      },
    };
  }

  const plan = retrievalPlan(classification);
  // "Just my current project" narrows a broad search to the page's scope.
  const narrowed = input.broadSearch === "current";
  const scopeId = narrowed ? input.pageContext?.id : undefined;

  // Step 3 runs concurrently with steps 4 and 5 — none of them depend on each
  // other, and serialising them was dead time in front of the first token.
  const [page, workspace, memory, attachments] = await Promise.all([
    resolvePageContext(input.store, input.pageContext, degraded),
    // Step 4 — one targeted pass.
    plan.useWorkspace
      ? withDeadline("workspace retrieval", DEADLINES.retrieval, input.store.read("load_context", { focus: input.message.slice(0, 500), maxTokens: plan.maxTokens, ...(scopeId ? { projectId: scopeId } : {}) }, "continuum-assistant"), undefined, degraded)
      : Promise.resolve(undefined),
    // Step 5 — connected material only where the class permits it.
    plan.useMemory
      ? withDeadline("memory retrieval", DEADLINES.retrieval, input.store.searchMemory({ query: input.message.slice(0, 500), limit: Math.min(12, plan.maxRecords), ...(scopeId ? { projectId: scopeId } : {}) }), [], degraded)
      : Promise.resolve([]),
    // Attachment passages are already indexed; this is a lookup, not a search.
    input.attachmentIds.length ? loadAttachments(input.store, input.attachmentIds) : Promise.resolve({ sources: [], chunks: [], context: [] }),
  ]);

  const rankedMemory = capContext(rankMemory(memory as unknown as Array<Record<string, unknown>>, excluded));

  // Step 8 — provenance is the records that were actually retrieved.
  //
  // Two lists, deliberately. `usedContext` is what the answer cites and is
  // capped at MAX_RECORDS. `candidates` is everything retrieval saw, and it is
  // what §11.5's identifier swap reads: a model that leaks `goal_demo_oasis`
  // leaks it because the goal was in the prompt at all, not because that goal
  // finished in the top eight. Building the label map from the cited list alone
  // meant the filter had no title for the rest and deleted them, leaving
  // "That decision belongs to  and it is…" — a sentence with a hole in it,
  // which is worse than the identifier it removed.
  const candidates = mergeProvenance([
    fromAttachments(attachments.sources, attachments.chunks),
    page.provenance,
    fromMemoryChunks(rankedMemory),
    fromWorkspaceContext(workspace),
  ], Number.MAX_SAFE_INTEGER).filter((entry) => !excluded.has(entry.id));
  const usedContext = candidates.slice(0, MAX_RECORDS);

  const context: Record<string, unknown> = {
    ...(page.records ?? {}),
    ...(workspace ? { workspace } : {}),
    ...(rankedMemory.length ? { relevantMemory: rankedMemory } : {}),
    ...(attachments.context.length ? { selectedFiles: attachments.context } : {}),
  };

  // Step 11 — depth is offered, never assumed. Only when the answer is thin.
  const groundedInWorkspace = usedContext.length > 0;
  const depthOffer = groundedInWorkspace || classification.requestClass === "chitchat"
    ? undefined
    : input.pageContext?.kind === "project" ? "use_project" as const : "search_sources" as const;

  return { ...base, context, usedContext, labels: labelMap(candidates), groundedInWorkspace, ...(depthOffer ? { depthOffer } : {}) };
}

async function loadAttachments(store: Store, attachmentIds: string[]) {
  // `all` — a "this message only" attachment is deliberately absent from the
  // Library listing, but the turn that attached it must still be able to read it.
  const rows = await store.listSources("all") as Array<Record<string, unknown>>;
  const sources = rows.filter((source) => attachmentIds.includes(String(source.id)));
  if (sources.length !== attachmentIds.length) {
    throw new AttachmentAccessError("One or more attachments are unavailable or belong to another account");
  }
  const wanted = new Set(sources.map((source) => String(source.id)));
  const chunks = (await store.listSourceChunks()).filter((chunk) => wanted.has(String(chunk.sourceId))).slice(0, 36);
  return {
    sources,
    chunks: chunks as unknown as Array<Record<string, unknown>>,
    context: chunks.map((chunk) => ({ sourceId: chunk.sourceId, source: chunk.sourceTitle, passage: chunk.passage, reference: chunk.reference, text: chunk.text.slice(0, 4_000) })),
  };
}

/** Thrown when an attachment id does not resolve to a row this user owns, so
 *  the route can answer 404 rather than silently answering without it. */
export class AttachmentAccessError extends Error {}
