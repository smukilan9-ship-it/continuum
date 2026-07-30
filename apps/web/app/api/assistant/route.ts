import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { aiErrorResponse, runStreamingAi, runStructuredAi } from "@/lib/ai-gateway";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { buildAcademicPrompt } from "@/lib/prompt-context";
import { getStore } from "@/lib/store";
import { assistantMemoryMarkdown, assistantMemoryVaultPath } from "@/lib/assistant-memory-note";
import { assistantMemorySyncStatuses, enqueueContinuumRecord, type RecordSyncStatus } from "@/lib/obsidian-sync-engine";
import { publicErrorMessage } from "@/lib/api-errors";
import { createOutputFilter, redactContextValue } from "@/lib/assistant/output-filter";
import { AttachmentAccessError, orchestrate } from "@/lib/assistant/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sessionIdSchema = z.string().min(8).max(200).regex(/^[a-zA-Z0-9_-]+$/);
/** §11.7 reduced the user-facing modes to three. `coding` and `document` are
 *  still accepted so conversations saved before the reduction keep working. */
const assistantModeSchema = z.enum(["auto", "fast", "deep", "coding", "document"]);
/** §11.6 replaced the ten scope checkboxes with chips the classifier drives.
 *  The field stays accepted — and can still only *narrow* — so an older client
 *  that still sends it is not broken by the change. */
const contextScopeSchema = z.enum([
  "conversation", "selected_files", "current_project", "current_learning",
  "research_library", "zotero", "obsidian", "approved_memory", "code_workspace", "workspace",
]);
/** The route-derived chip the panel and page attach (§8.5, §11.3 step 3). */
const pageContextSchema = z.object({
  kind: z.enum(["goal", "project", "concept", "build", "source", "week"]),
  id: z.string().min(3).max(200).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  label: z.string().trim().min(1).max(160),
  detail: z.string().trim().max(2_000).optional(),
});
const memoryFields = {
  summary: z.string().trim().min(3).max(4_000),
  decisions: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  unresolvedQuestions: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  createdTasks: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  importantFacts: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  linkedEntityIds: z.array(z.string().min(3).max(200).regex(/^[a-zA-Z0-9_-]+$/)).max(50).default([]),
};

const writeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), title: z.string().trim().min(1).max(120).default("New conversation") }),
  z.object({
    action: z.literal("message"),
    sessionId: sessionIdSchema,
    message: z.string().trim().min(1).max(12_000),
    credentialMode: z.enum(["platform", "user"]).default("platform"),
    mode: assistantModeSchema.default("auto"),
    contextScopes: z.array(contextScopeSchema).max(10).default(["approved_memory"]),
    attachmentIds: z.array(z.string().min(3).max(200).regex(/^[a-zA-Z0-9_-]+$/)).max(12).default([]),
    pageContext: pageContextSchema.optional(),
    /** How the user answered the broad-search confirmation (§11.3 step 6). */
    broadSearch: z.enum(["everything", "current"]).optional(),
    /** Records marked "Don't use this again" in this conversation (§11.6). */
    excludedRecordIds: z.array(z.string().min(3).max(200)).max(50).default([]),
  }),
  z.object({
    action: z.literal("update_session"),
    sessionId: sessionIdSchema,
    title: z.string().trim().min(1).max(120).optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
    groupLabel: z.string().trim().max(80).nullable().optional(),
  }).refine((value) => value.title !== undefined || value.pinned !== undefined || value.archived !== undefined || value.groupLabel !== undefined),
  z.object({ action: z.literal("prepare_memory"), sessionId: sessionIdSchema }),
  z.object({ action: z.literal("save_memory"), sessionId: sessionIdSchema, includeRawTranscript: z.boolean().default(false), ...memoryFields }),
  z.object({ action: z.literal("exclude_memory"), sessionId: sessionIdSchema }),
  z.object({ action: z.literal("delete"), sessionId: sessionIdSchema }),
]);

const memorySummarySchema = z.object(memoryFields);

function id(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : value;
}

function publicSession(value: Record<string, unknown>, obsidianSync?: RecordSyncStatus) {
  return {
    ...value,
    createdAt: iso(value.createdAt),
    updatedAt: iso(value.updatedAt),
    lastMessageAt: iso(value.lastMessageAt),
    obsidianSync,
    messages: Array.isArray(value.messages)
      ? value.messages.map((message) => {
        const row = message as Record<string, unknown>;
        const { provider, model, ...safe } = row;
        void model;
        return {
          ...safe,
          createdAt: iso(row.createdAt),
          updatedAt: iso(row.updatedAt),
          mode: typeof provider === "string" && provider.startsWith("byok:") ? "My API key" : "Continuum Auto",
        };
      })
      : undefined,
  };
}

function fallbackMemory(messages: Array<Record<string, unknown>>) {
  const userMessages = messages.filter((message) => message.role === "user").map((message) => String(message.content ?? "").trim()).filter(Boolean);
  const assistantMessages = messages.filter((message) => message.role === "assistant").map((message) => String(message.content ?? "").trim()).filter(Boolean);
  const lastUser = userMessages.at(-1) ?? "Workspace session";
  const lastAssistant = assistantMessages.at(-1) ?? "";
  const sentences = `${lastUser}\n${lastAssistant}`.split(/(?<=[.!?])\s+/).map((value) => value.trim()).filter(Boolean);
  return {
    summary: sentences.slice(0, 3).join(" ").slice(0, 1_200) || "Workspace session",
    decisions: sentences.filter((value) => /\b(decid|choose|selected|will use)\w*/i.test(value)).slice(0, 8),
    unresolvedQuestions: sentences.filter((value) => value.endsWith("?")).slice(0, 8),
    createdTasks: sentences.filter((value) => /\b(next|todo|to-do|follow up|need to)\b/i.test(value)).slice(0, 8),
    importantFacts: sentences.filter((value) => /\b(is|are|found|result|evidence|score)\b/i.test(value)).slice(0, 8),
    linkedEntityIds: [],
  };
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "assistant-read", 120, 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Assistant refresh limit reached" }, { status: 429 });
  const store = getStore(user.id);
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) {
    const [sessions, syncStatuses] = await Promise.all([
      store.listAssistantSessions(),
      assistantMemorySyncStatuses(user.id).catch(() => ({} as Record<string, RecordSyncStatus>)),
    ]);
    return NextResponse.json({ sessions: sessions.map((session) => {
      const value = session as Record<string, unknown>;
      return publicSession(value, syncStatuses[String(value.id)]);
    }) }, { headers: { "cache-control": "private, no-store" } });
  }
  const parsedId = sessionIdSchema.safeParse(sessionId);
  if (!parsedId.success) return NextResponse.json({ error: "Invalid assistant session" }, { status: 400 });
  const [session, syncStatuses] = await Promise.all([
    store.getAssistantSession(parsedId.data),
    assistantMemorySyncStatuses(user.id, parsedId.data).catch(() => ({} as Record<string, RecordSyncStatus>)),
  ]);
  if (!session) return NextResponse.json({ error: "Assistant session not found" }, { status: 404 });
  return NextResponse.json({ session: publicSession(session, syncStatuses[parsedId.data]) }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin assistant requests are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "assistant-write", Number(process.env.ASSISTANT_ACTIONS_PER_HOUR ?? 120), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Assistant action limit reached. Try again later." }, { status: 429 });
  const parsed = writeSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Check the assistant request and try again" }, { status: 400 });
  const store = getStore(user.id);

  if (parsed.data.action === "create") {
    const session = await store.createAssistantSession({ id: id("assistant_session"), title: parsed.data.title });
    return NextResponse.json({ session: publicSession(session as Record<string, unknown>) }, { status: 201 });
  }

  const session = await store.getAssistantSession(parsed.data.sessionId);
  if (!session) return NextResponse.json({ error: "Assistant session not found" }, { status: 404 });

  if (parsed.data.action === "update_session") {
    const updated = await store.updateAssistantSession(parsed.data.sessionId, {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.pinned !== undefined ? { pinned: parsed.data.pinned } : {}),
      ...(parsed.data.archived !== undefined ? { archived: parsed.data.archived } : {}),
      ...(parsed.data.groupLabel !== undefined ? { groupLabel: parsed.data.groupLabel } : {}),
    });
    return NextResponse.json({ session: publicSession(updated as Record<string, unknown>) });
  }

  if (parsed.data.action === "delete") {
    await enqueueContinuumRecord({
      userId: user.id,
      recordId: parsed.data.sessionId,
      recordType: "assistant_memory",
      title: session.title ? String(session.title) : "Assistant memory",
      path: assistantMemoryVaultPath(parsed.data.sessionId, session.title ? String(session.title) : "Assistant memory"),
      content: "",
      deletionState: "tombstone",
      metadata: { source: "continuum-assistant", reason: "session_deleted" },
      idempotencyKey: `assistant-memory-delete:${parsed.data.sessionId}`,
    }).catch(() => undefined);
    await store.deleteAssistantSession(parsed.data.sessionId);
    return NextResponse.json({ deleted: true });
  }

  if (parsed.data.action === "exclude_memory") {
    const updated = await store.updateAssistantSessionMemory(parsed.data.sessionId, {
      summary: "",
      decisions: [],
      unresolvedQuestions: [],
      createdTasks: [],
      importantFacts: [],
      linkedEntityIds: [],
      memoryExcluded: true,
      status: "active",
    });
    const obsidian = await enqueueContinuumRecord({
      userId: user.id,
      recordId: parsed.data.sessionId,
      recordType: "assistant_memory",
      title: session.title ? String(session.title) : "Assistant memory",
      path: assistantMemoryVaultPath(parsed.data.sessionId, session.title ? String(session.title) : "Assistant memory"),
      content: "",
      deletionState: "tombstone",
      metadata: { source: "continuum-assistant", reason: "memory_excluded" },
      idempotencyKey: `assistant-memory-exclude:${parsed.data.sessionId}`,
    }).catch(() => undefined);
    return NextResponse.json({ session: publicSession(updated as Record<string, unknown>), obsidian });
  }

  const messages = Array.isArray(session.messages) ? session.messages as Array<Record<string, unknown>> : [];
  if (parsed.data.action === "prepare_memory") {
    if (messages.length < 2) return NextResponse.json({ error: "Have a meaningful exchange before saving memory." }, { status: 422 });
    const transcript = messages.slice(-30).map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${String(message.content ?? "").slice(0, 4_000)}`).join("\n\n");
    const fallback = fallbackMemory(messages);
    try {
      const prompt = buildAcademicPrompt({
        surface: "assistant",
        taskClass: "summarization",
        userRequest: "Prepare a compact, editable memory proposal for this session. Save only durable outcomes; omit greetings and casual conversation.",
        educationLevel: user.educationLevel,
        sourceContent: transcript,
        outputContract: "Return summary, decisions, unresolvedQuestions, createdTasks, importantFacts, and linkedEntityIds. Never invent an entity ID or fact.",
      });
      const result = await runStructuredAi({
        request,
        userId: user.id,
        feature: "assistant.memory.prepare",
        taskClass: "summarization",
        system: prompt.system,
        prompt: prompt.prompt,
        schema: memorySummarySchema,
        maxOutputTokens: 1_400,
      });
      return NextResponse.json({ memory: result.output, generatedBy: result.decision.model, fallback: false });
    } catch {
      return NextResponse.json({ memory: fallback, generatedBy: "continuum/extractive-summary", fallback: true });
    }
  }

  if (parsed.data.action === "save_memory") {
    const savedAt = new Date().toISOString();
    const memory = {
      summary: parsed.data.summary,
      decisions: parsed.data.decisions,
      unresolvedQuestions: parsed.data.unresolvedQuestions,
      createdTasks: parsed.data.createdTasks,
      importantFacts: parsed.data.importantFacts,
      linkedEntityIds: parsed.data.linkedEntityIds,
      memoryExcluded: false,
      status: "saved" as const,
    };
    const updated = await store.updateAssistantSessionMemory(parsed.data.sessionId, memory);
    await store.write("sync_session", {
      sessionId: parsed.data.sessionId,
      summary: parsed.data.summary,
      completed: parsed.data.importantFacts,
      decisions: parsed.data.decisions,
      conceptsLearned: [],
      misconceptions: [],
      unresolvedQuestions: parsed.data.unresolvedQuestions,
      nextActions: parsed.data.createdTasks,
      evidenceIds: [],
      mode: "propose",
    }, savedAt, "standalone_app", "continuum-assistant");
    const note = assistantMemoryMarkdown({
      sessionId: parsed.data.sessionId,
      title: session.title ? String(session.title) : "Assistant memory",
      savedAt,
      summary: parsed.data.summary,
      decisions: parsed.data.decisions,
      importantFacts: parsed.data.importantFacts,
      unresolvedQuestions: parsed.data.unresolvedQuestions,
      nextActions: parsed.data.createdTasks,
      linkedEntityIds: parsed.data.linkedEntityIds,
      transcript: parsed.data.includeRawTranscript
        ? messages.slice(-100).map((message) => ({ role: String(message.role), content: String(message.content ?? "").slice(0, 12_000) }))
        : undefined,
    });
    const obsidian = await enqueueContinuumRecord({
      userId: user.id,
      recordId: parsed.data.sessionId,
      recordType: "assistant_memory",
      title: session.title ? String(session.title) : "Assistant memory",
      path: assistantMemoryVaultPath(parsed.data.sessionId, session.title ? String(session.title) : "Assistant memory"),
      content: note,
      metadata: { source: "continuum-assistant", savedAt, rawTranscriptIncluded: parsed.data.includeRawTranscript },
      idempotencyKey: `assistant-memory:${parsed.data.sessionId}`,
    }).catch((error) => ({ status: "unavailable" as const, error: publicErrorMessage(error, "Obsidian sync is unavailable") }));
    return NextResponse.json({ session: publicSession(updated as Record<string, unknown>), saved: true, obsidian });
  }

  const messageSessionId = parsed.data.sessionId;
  const credentialMode = parsed.data.credentialMode;
  const requestedScopes = parsed.data.contextScopes;
  const attachmentIds = parsed.data.attachmentIds;
  const assistantMode = parsed.data.mode;
  const userMessage = parsed.data.message;
  const scopeOptedOut = requestedScopes.length === 1 && requestedScopes[0] === "conversation";

  // What the message needs is decided by §11.3's contract, not configured by
  // the user. `orchestrator.ts` owns all eleven steps; this route owns request
  // validation, persistence, and the stream.
  let plan;
  try {
    plan = await orchestrate({
      store,
      message: userMessage,
      attachmentIds,
      mode: assistantMode === "coding" || assistantMode === "document" ? "auto" : assistantMode,
      history: messages.map((message) => ({
        role: String(message.role),
        content: String(message.content ?? ""),
        usedContext: (message.metadata as { usedContext?: Array<{ id?: string; label?: string }> } | undefined)?.usedContext,
      })),
      ...(parsed.data.pageContext ? { pageContext: parsed.data.pageContext } : {}),
      ...(parsed.data.broadSearch ? { broadSearch: parsed.data.broadSearch } : {}),
      excludedRecordIds: parsed.data.excludedRecordIds,
    });
  } catch (error) {
    if (error instanceof AttachmentAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }

  // §11.3 step 6: a wide search stops here and asks. Nothing has been retrieved
  // and no message has been persisted, so answering the confirmation re-sends
  // the same turn rather than resuming a half-finished one.
  if (plan.confirmation) {
    return NextResponse.json({ confirmation: plan.confirmation, requestClass: plan.classification.requestClass }, { status: 200, headers: { "cache-control": "private, no-store" } });
  }

  const taskClass = assistantMode === "coding" ? "code_reasoning" as const : assistantMode === "document" ? "document_understanding" as const : plan.taskClass;
  // The legacy "this conversation only" scope is the one narrowing a stale
  // client can still express, and narrowing is all it may ever do.
  const context = scopeOptedOut ? {} : plan.context;
  const usedContext = scopeOptedOut ? [] : plan.usedContext;
  const contextLabels = scopeOptedOut ? new Map<string, string>() : plan.labels;
  await Promise.all([
    store.appendAssistantMessage({
      id: id("assistant_message"),
      sessionId: messageSessionId,
      role: "user",
      content: userMessage,
      metadata: { attachmentIds, contextScopes: requestedScopes, mode: assistantMode },
    }),
    store.updateAssistantSession(messageSessionId, {
      contextSettings: { contextScopes: requestedScopes, mode: assistantMode },
    }),
  ]);
  const history = messages.slice(-12).map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: String(message.content ?? "").slice(0, 4_000),
  }));
  // Identifiers are stripped from the context before the model ever sees them.
  // Filtering only the output is not enough: a model that never receives
  // `goal_demo_sat` cannot echo it, and the labels remain readable.
  const safeContext = redactContextValue(context, contextLabels);

  const prompt = buildAcademicPrompt({
    surface: "assistant",
    taskClass: "conversational_support",
    userRequest: userMessage,
    educationLevel: user.educationLevel,
    relevantContext: safeContext,
    previousAttempts: history,
    outputContract: [
      "Answer in calm, plain Markdown, beginning with the first sentence of the answer itself.",
      "Never output a plan, outline, or analysis of the request. Never write a heading such as 'Thinking Process', 'Analysis', 'Step 1', 'Persona', 'Constraints', 'Approach', or 'Synthesize'.",
      "Never restate the question before answering, and never describe what you are about to do.",
      "Refer to any record by its title. Never write an internal identifier.",
      "Use only relevant supplied context. Cite selected files using their supplied [Source: title · passage N] reference when making source-grounded claims.",
      // AC-A6: an answer with no workspace grounding must say so rather than
      // let the citation chips' absence be read as "nothing to cite".
      usedContext.length
        ? "Clearly distinguish saved facts from suggestions. Do not claim to change workspace records."
        : "Nothing in the user's workspace matched this question. Answer from general knowledge and do not imply you consulted their material.",
    ].join(" "),
  });
  // Only the provider call is guarded. Wrapping the whole tail in this catch
  // meant any bug after it — a bad header value, a serialisation error — was
  // reported to the user as "the model is unavailable", which is both false and
  // unactionable. Everything below is ours to get right, and should fail loudly.
  let streamed;
  try {
    streamed = await runStreamingAi({
      request,
      userId: user.id,
      feature: "assistant.chat",
      taskClass,
      system: prompt.system,
      prompt: prompt.prompt,
      maxOutputTokens: 2_000,
      credentialMode,
    });
  } catch (error) {
    return aiErrorResponse(error);
  }

  {
    const encoder = new TextEncoder();
    let answer = "";
    const responseStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const filter = createOutputFilter({ labels: contextLabels });
          for await (const part of streamed.result.textStream) {
            const visible = filter.push(part);
            if (visible) {
              answer += visible;
              controller.enqueue(encoder.encode(visible));
            }
          }
          const tail = filter.flush();
          if (tail) {
            answer += tail;
            controller.enqueue(encoder.encode(tail));
          }
          // The whole response was narration, so the user is looking at an empty
          // reply. Say so rather than leaving a blank turn; the client's Retry
          // re-sends without duplicating the user message.
          if (!answer.trim() && filter.suppressedNarration) {
            const notice = "I couldn't produce a clean answer for that. Try asking again, or rephrase it.";
            answer = notice;
            controller.enqueue(encoder.encode(notice));
          }
          if (answer.trim()) {
            await store.appendAssistantMessage({
              id: id("assistant_message"),
              sessionId: messageSessionId,
              role: "assistant",
              content: answer.slice(0, 50_000),
              provider: credentialMode === "user" ? `byok:${streamed.decision.route}` : streamed.decision.route,
              model: streamed.decision.model,
              // The chips, the inspector, and the "answered from general
              // knowledge" line are all rendered from this, so it is persisted
              // with the message rather than only streamed alongside it.
              metadata: {
                usedContext,
                mode: assistantMode,
                requestClass: plan.classification.requestClass,
                grounded: usedContext.length > 0,
                ...(plan.depthOffer ? { depthOffer: plan.depthOffer } : {}),
                ...(plan.degraded.length ? { degraded: plan.degraded } : {}),
              },
            });
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return new Response(responseStream, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
        "x-continuum-mode": credentialMode === "user"
          ? "My API key"
          : ({ auto: "Continuum Auto", fast: "Fast", deep: "Deep Reasoning", coding: "Coding", document: "Document Analysis" } as const)[assistantMode],
        // §11.9: the composer names the step it is on rather than showing an
        // unexplained spinner, so it needs the plan before the stream lands.
        //
        // Percent-encoded because header values are Latin-1: the status labels
        // carry an ellipsis ("Looking through your OASIS project…"), and
        // assigning one raw throws while the response is being constructed —
        // inside the try, so it surfaced as a bogus "model unavailable" 503
        // after a perfectly successful model call.
        "x-continuum-status": encodeURIComponent(plan.statusLabel),
        "x-continuum-class": plan.classification.requestClass,
        "x-continuum-records": String(usedContext.length),
        ...(plan.degraded.length ? { "x-continuum-degraded": plan.degraded.join(",") } : {}),
      },
    });
  }
}
