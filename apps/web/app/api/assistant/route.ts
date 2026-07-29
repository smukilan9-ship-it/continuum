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
import { createReasoningFilter, isConversationalFiller } from "@/lib/reasoning-filter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sessionIdSchema = z.string().min(8).max(200).regex(/^[a-zA-Z0-9_-]+$/);
const assistantModeSchema = z.enum(["auto", "fast", "deep", "coding", "document"]);
const contextScopeSchema = z.enum([
  "conversation", "selected_files", "current_project", "current_learning",
  "research_library", "zotero", "obsidian", "approved_memory", "code_workspace", "workspace",
]);
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
  const taskClass = ({
    auto: "conversational_support",
    fast: "conversational_support",
    deep: "research_synthesis",
    coding: "code_reasoning",
    document: "document_understanding",
  } as const)[assistantMode];
  const conversational = isConversationalFiller(userMessage);

  const useWorkspace = !conversational && requestedScopes.some((scope) => ["current_project", "current_learning", "research_library", "zotero", "obsidian", "code_workspace", "workspace"].includes(scope));
  const useMemory = !conversational && (requestedScopes.includes("approved_memory") || requestedScopes.includes("workspace"));

  // Everything needed before the model call is independent, so it runs
  // concurrently. Serialising these was up to five DB round-trips of dead time
  // in front of the first streamed token.
  const [sourceRows, context, relevantMemory] = await Promise.all([
    attachmentIds.length ? store.listSources() as Promise<Array<Record<string, unknown>>> : Promise.resolve([]),
    useWorkspace ? store.read("load_context", { focus: userMessage.slice(0, 500), maxTokens: 1_400 }, "continuum-assistant") : undefined,
    useMemory ? store.searchMemory({ query: userMessage.slice(0, 500), limit: 6 }) : [],
  ]);

  const selectedSources = sourceRows.filter((source) => attachmentIds.includes(String(source.id)));
  if (selectedSources.length !== attachmentIds.length) {
    return NextResponse.json({ error: "One or more attachments are unavailable or belong to another account" }, { status: 404 });
  }
  const selectedSourceIds = new Set(selectedSources.map((source) => String(source.id)));
  const sourceChunks = selectedSources.length
    ? (await store.listSourceChunks()).filter((chunk) => selectedSourceIds.has(String(chunk.sourceId))).slice(0, 36)
    : [];
  const attachmentContext = sourceChunks.map((chunk) => ({
    sourceId: chunk.sourceId,
    source: chunk.sourceTitle,
    passage: chunk.passage,
    reference: chunk.reference,
    text: chunk.text.slice(0, 4_000),
  }));
  const usedContext = [
    ...selectedSources.map((source) => ({ type: "attachment", id: String(source.id), label: String(source.title ?? "Attached source") })),
    ...requestedScopes.filter((scope) => scope !== "conversation" && scope !== "selected_files").map((scope) => ({
      type: "scope",
      id: scope,
      label: scope.replaceAll("_", " "),
    })),
  ];
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
  const prompt = buildAcademicPrompt({
    surface: "assistant",
    taskClass: "conversational_support",
    userRequest: userMessage,
    educationLevel: user.educationLevel,
    relevantContext: { workspace: context, relevantMemory, selectedFiles: attachmentContext },
    previousAttempts: history,
    outputContract: "Answer in calm, plain Markdown. Use only relevant supplied context. Cite selected files using their supplied [Source: title · passage N] reference when making source-grounded claims. Clearly distinguish saved facts from suggestions. Do not claim to change workspace records.",
  });
  try {
    const streamed = await runStreamingAi({
      request,
      userId: user.id,
      feature: "assistant.chat",
      taskClass,
      system: prompt.system,
      prompt: prompt.prompt,
      maxOutputTokens: 2_000,
      credentialMode,
    });
    const encoder = new TextEncoder();
    let answer = "";
    const responseStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const filter = createReasoningFilter();
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
          if (answer.trim()) {
            await store.appendAssistantMessage({
              id: id("assistant_message"),
              sessionId: messageSessionId,
              role: "assistant",
              content: answer.slice(0, 50_000),
              provider: credentialMode === "user" ? `byok:${streamed.decision.route}` : streamed.decision.route,
              model: streamed.decision.model,
              metadata: { usedContext, mode: assistantMode },
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
      },
    });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
