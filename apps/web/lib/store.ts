import { createHash, randomUUID } from "node:crypto";
import {
  deriveConversationTitle,
  DEMO_USER_ID,
  NeonRepository,
  type AssistantSessionMemory,
  type ImageExtractionWrite,
  type PaperWrite,
  type QuestionBankAttemptWrite,
  type QuestionBankWrite,
  type SourceWrite,
  type StoredMemoryChunk,
  type StoredSourceChunk,
  type WorkspaceSearchHit,
} from "@continuum/db";
import { assertScheduleCommitAllowed, curatedResourceRegistry, recommendBestResource, updateMastery, type ResourceNeed } from "@continuum/domain";
import { contentHash } from "@continuum/retrieval";
import {
  memoryEventSchema,
  outcomeReceiptSchema,
  resourceActivitySchema,
  sessionSyncSchema,
  type MasteryState,
  type MemoryEvent,
  type OutcomeReceipt,
  type ResourceActivity,
  type ResourceRecommendation,
} from "@continuum/schemas";
import { embedDocuments, embedQuery, embeddingConfiguration } from "@continuum/ai";
import { demoStore, readDemoState, writeDemoState, type DemoEvent } from "@/lib/demo-store";
import { buildContextPacks, getContextPack } from "@/lib/context-packs";

export type AppEventInput = {
  type: string;
  summary: string;
  entityIds: string[];
  payload: Record<string, unknown>;
  source?: MemoryEvent["source"];
  goalId?: string;
  projectId?: string;
  importance?: number;
};

export type StoreWriteResult = {
  data: unknown;
  entityIds: string[];
  evidenceIds?: string[];
  summary: string;
};

export interface Store {
  readonly kind: "memory" | "neon";
  readonly userId: string;
  snapshot(): Promise<Record<string, unknown>>;
  /** @deprecated §16.3 — screens fetch their own data; use the per-route reads. */
  workspace(view: string): Promise<Record<string, unknown>>;
  /** Only what the shell chrome needs (§8.1), so it never depends on a screen. */
  shellData(): Promise<{ goals: Array<Record<string, unknown>>; projects: Array<Record<string, unknown>>; pendingProposals: number }>;
  homeData(): Promise<Record<string, unknown>>;
  goalView(goalId: string, view: "overview" | "plan" | "study" | "sources"): Promise<Record<string, unknown> | undefined>;
  projectView(projectId: string, view: "overview" | "claims" | "sources" | "decisions"): Promise<Record<string, unknown> | undefined>;
  updateGoal(goalId: string, changes: { title?: string; outcome?: string; targetDate?: string; status?: string; deleted?: boolean }): Promise<Record<string, unknown> | undefined>;
  read(name: string, args: Record<string, unknown>, clientId?: string): Promise<unknown>;
  write(name: string, args: Record<string, unknown>, now: string, surface?: "mcp" | "standalone_app", clientId?: string): Promise<StoreWriteResult>;
  appendEvent(input: AppEventInput, now?: string): Promise<DemoEvent>;
  getLearningState(conceptId?: string): Promise<MasteryState>;
  saveLearningState(state: MasteryState): Promise<void>;
  ensureConcept(topic: string): Promise<string>;
  saveQuestionBank(questionBank: QuestionBankWrite): Promise<unknown>;
  listQuestionBanks(): Promise<unknown[]>;
  getQuestionBank(questionBankId: string): Promise<Record<string, unknown> | undefined>;
  saveQuestionBankAttempt(attempt: QuestionBankAttemptWrite): Promise<unknown>;
  getImageExtractionByHash(contentHash: string): Promise<Record<string, unknown> | undefined>;
  getImageExtraction(extractionId: string): Promise<Record<string, unknown> | undefined>;
  saveImageExtraction(extraction: ImageExtractionWrite): Promise<unknown>;
  createAssistantSession(input: { id: string; title: string }): Promise<unknown>;
  listAssistantSessions(): Promise<unknown[]>;
  getAssistantSession(sessionId: string): Promise<Record<string, unknown> | undefined>;
  appendAssistantMessage(input: { id: string; sessionId: string; role: "user" | "assistant"; content: string; provider?: string; model?: string; metadata?: Record<string, unknown> }): Promise<unknown>;
  updateAssistantSession(sessionId: string, input: { title?: string; pinned?: boolean; archived?: boolean; groupLabel?: string | null; contextSettings?: Record<string, unknown> }): Promise<unknown>;
  updateAssistantSessionMemory(sessionId: string, memory: AssistantSessionMemory): Promise<unknown>;
  deleteAssistantSession(sessionId: string): Promise<boolean>;
  findSourceByHash(hash: string): Promise<{ id: string; title: string } | undefined>;
  saveSource(source: SourceWrite): Promise<void>;
  /** `all` includes session-only attachments (§11.4); the Library uses the default. */
  listSources(scope?: "library" | "all"): Promise<unknown[]>;
  savePaper(paper: PaperWrite): Promise<{ paper: unknown; duplicate: boolean }>;
  listPapers(projectId?: string): Promise<unknown[]>;
  listSourceChunks(): Promise<StoredSourceChunk[]>;
  deleteSource(sourceId: string): Promise<{ id: string; title: string; storagePath?: string } | undefined>;
  vectorSearch(embedding: number[], limit: number): Promise<StoredSourceChunk[]>;
  searchMemory(input: { query: string; types?: string[]; goalId?: string; projectId?: string; limit?: number }): Promise<StoredMemoryChunk[]>;
  searchWorkspace(input: { query: string; kinds?: string[]; limit?: number }): Promise<WorkspaceSearchHit[]>;
  saveReceipt(receipt: OutcomeReceipt, clientId?: string): Promise<void>;
  listReceipts(limit?: number): Promise<unknown[]>;
  createMilestone(input: { id: string; goalId: string; title: string; order: number; dueAt?: string }, now: string): Promise<void>;
  listMilestones(goalId?: string): Promise<unknown[]>;
  saveOnboardingIntake(educationLevel: string, intake: Record<string, unknown>, now: string): Promise<void>;
  seedResources(): Promise<void>;
  recommendResource(args: Record<string, unknown>): Promise<ResourceRecommendation>;
  saveResourceActivity(activity: ResourceActivity, metadata?: Record<string, unknown>): Promise<void>;
  getResourceActivity(activityId: string): Promise<Record<string, unknown> | undefined>;
  scheduleResourceFollowup(input: { goalId: string; activityId: string; title: string; evidence: string; startsAt: string; minutes: number }): Promise<Record<string, unknown>>;
  registerOAuthGrant(input: { jti: string; userId: string; clientId: string; kind: string; scopes: string[]; expiresAt: string }): Promise<void>;
  oauthGrantUnavailable(jti: string): Promise<boolean>;
  revokeOAuthGrant(jti: string): Promise<void>;
  consumeOAuthCode(jti: string): Promise<void>;
  consumeOAuthGrant(jti: string, kind: "code" | "refresh" | "consent"): Promise<void>;
}

function opaqueId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function toEvent(userId: string, input: AppEventInput, now = new Date().toISOString()): MemoryEvent {
  return memoryEventSchema.parse({
    id: opaqueId("event"),
    userId,
    type: input.type,
    goalId: input.goalId,
    entityId: input.entityIds[0],
    timestamp: now,
    payload: { ...input.payload, summary: input.summary, entityIds: input.entityIds, ...(input.projectId ? { projectId: input.projectId } : {}) },
    source: input.source ?? { surface: "standalone_app" },
  });
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

async function settleWithin<T>(promise: Promise<T>, milliseconds: number): Promise<T | undefined> {
  let cancelTimeout: (() => void) | undefined;
  try {
    return await Promise.race([
      promise.catch(() => undefined),
      new Promise<undefined>((resolve) => {
        const timeout = setTimeout(resolve, milliseconds);
        cancelTimeout = () => clearTimeout(timeout);
      }),
    ]);
  } finally {
    cancelTimeout?.();
  }
}

function compactToBudget<T>(value: T, maxTokens: number): T {
  const maxChars = Math.max(400, maxTokens * 4);
  const clone = JSON.parse(JSON.stringify(value)) as T;
  const serialized = () => JSON.stringify(clone);
  if (serialized().length <= maxChars || !clone || typeof clone !== "object") return clone;
  const root = clone as Record<string, unknown>;
  root._contextBudget = { maxTokens, truncated: true, policy: "ranked current state and relevant memories; full history remains searchable" };
  for (let iteration = 0; iteration < 1000 && serialized().length > maxChars; iteration += 1) {
    const arrays: unknown[][] = [];
    const strings: Array<{ owner: Record<string, unknown>; key: string; value: string }> = [];
    const visit = (item: unknown) => {
      if (Array.isArray(item)) { if (item.length) arrays.push(item); item.forEach(visit); return; }
      if (!item || typeof item !== "object") return;
      for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
        if (typeof child === "string" && child.length > 180) strings.push({ owner: item as Record<string, unknown>, key, value: child });
        else visit(child);
      }
    };
    visit(clone);
    const longestArray = arrays.sort((left, right) => JSON.stringify(right.at(-1)).length - JSON.stringify(left.at(-1)).length)[0];
    if (longestArray) { longestArray.pop(); continue; }
    const longestString = strings.sort((left, right) => right.value.length - left.value.length)[0];
    if (!longestString) break;
    longestString.owner[longestString.key] = `${longestString.value.slice(0, Math.max(120, Math.floor(longestString.value.length * 0.6)))}…`;
  }
  return clone;
}

function memoryContent(input: AppEventInput) {
  const durablePayload = Object.fromEntries(Object.entries(input.payload).filter(([key]) => !["rawConversation", "transcript", "fullText"].includes(key)));
  return `${input.summary}\nType: ${input.type}\n${JSON.stringify(durablePayload)}`.slice(0, 12_000);
}

function publicQuestionBanksForWorkspace(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((bank) => {
    if (!bank || typeof bank !== "object") return bank;
    const row = bank as Record<string, unknown>;
    const questions = Array.isArray(row.questions) ? row.questions : [];
    return {
      ...row,
      questions: questions.map((question) => {
        if (!question || typeof question !== "object") return question;
        const item = question as Record<string, unknown>;
        return {
          id: item.id,
          prompt: item.prompt,
          type: item.type,
          choices: item.choices,
          difficulty: item.difficulty,
          sourceChunkIds: item.sourceChunkIds,
        };
      }),
    };
  });
}

function assertRecentConfirmation(confirmedAt: unknown, now: string) {
  const confirmationTime = Date.parse(String(confirmedAt));
  const requestTime = Date.parse(now);
  if (Number.isNaN(confirmationTime) || Math.abs(requestTime - confirmationTime) > 15 * 60_000) throw new Error("Confirmation timestamp must be within 15 minutes of this write");
}

class MemoryStore implements Store {
  readonly kind = "memory" as const;

  constructor(readonly userId: string) {}

  async snapshot() { return demoStore as unknown as Record<string, unknown>; }

  async workspace(view: string) {
    const state = demoStore as unknown as Record<string, unknown>;
    const selected: Record<string, string[]> = {
      today: ["goals", "tasks", "projects", "receipts", "resourceActivities", "schedule"],
      goals: ["goals", "tasks", "schedule"],
      learn: ["goals", "tasks", "taskDependencies", "learningState", "resourceActivities", "questionBanks", "receipts"],
      research: ["goals", "tasks", "projects", "decisions", "claims", "notes", "sources", "papers"],
      memory: ["goals", "tasks", "projects", "decisions", "claims", "notes", "sources", "papers", "learningState", "memoryChunks", "receipts", "events", "schedule"],
      activity: ["proposals", "events"],
      code: ["goals", "tasks", "projects", "learningState", "receipts"],
      assistant: ["goals", "tasks", "projects", "learningState", "sources", "papers", "receipts", "assistantSessions"],
      integrations: [],
      library: ["goals", "projects"],
    };
    return Object.fromEntries((selected[view] ?? []).map((key) => [
      key,
      key === "questionBanks" ? publicQuestionBanksForWorkspace(state[key]) : state[key],
    ]));
  }

  async shellData() {
    const rows = demoStore.goals;
    return {
      goals: rows.map((goal) => ({ id: goal.id, title: goal.title, progress: goal.progress ?? 0, targetDate: goal.targetDate, status: goal.status ?? "active" })),
      projects: demoStore.projects.map((project) => ({ id: project.id, title: project.title, goalId: project.goalId })),
      pendingProposals: demoStore.proposals.filter((proposal) => proposal.status === "pending").length,
    };
  }

  async homeData() {
    const open = demoStore.tasks.filter((task) => task.status !== "done");
    return {
      nextTask: open[0] ?? null,
      todayBlocks: demoStore.schedule.slice(0, 6),
      weekBlocks: demoStore.schedule,
      goals: demoStore.goals,
      milestones: this.memoryMilestones,
      tasks: demoStore.tasks,
      resumeItems: demoStore.resourceActivities.filter((activity) => activity.status !== "verified").slice(0, 3),
      receipts: demoStore.receipts.slice(0, 4),
      weekSummary: { scheduledBlocks: demoStore.schedule.length, openTasks: open.length, goals: demoStore.goals.length },
    };
  }

  async goalView(goalId: string, view: "overview" | "plan" | "study" | "sources") {
    const goal = demoStore.goals.find((row) => row.id === goalId);
    if (!goal) return undefined;
    const goalTasks = demoStore.tasks.filter((task) => task.goalId === goalId);
    const goalProjects = demoStore.projects.filter((project) => project.goalId === goalId);
    const projectIds = new Set(goalProjects.map((project) => String(project.id)));
    if (view === "plan") {
      const taskIds = new Set(goalTasks.map((task) => String(task.id)));
      return { goal, tasks: goalTasks, taskDependencies: demoStore.taskDependencies.filter((row) => taskIds.has(String(row.taskId))), schedule: demoStore.schedule.filter((block) => taskIds.has(String(block.taskId))) };
    }
    if (view === "study") {
      return { goal, concepts: [], learningStates: [demoStore.learningState], questionBanks: publicQuestionBanksForWorkspace(demoStore.questionBanks), resourceActivities: demoStore.resourceActivities.filter((activity) => activity.goalId === goalId) };
    }
    if (view === "sources") {
      return {
        goal,
        projects: goalProjects,
        sources: demoStore.sources.filter((source) => (source.retention ?? "library") === "library" && source.projectId && projectIds.has(source.projectId)),
        papers: demoStore.papers.filter((paper) => projectIds.has(String(paper.projectId))),
      };
    }
    const taskIdSet = new Set(goalTasks.map((task) => String(task.id)));
    return {
      goal,
      milestones: this.memoryMilestones.filter((milestone) => milestone.goalId === goalId),
      tasks: goalTasks,
      taskDependencies: demoStore.taskDependencies.filter((row) => taskIdSet.has(String(row.taskId))),
      projects: goalProjects,
      concepts: [],
      events: demoStore.events.slice(0, 5),
      openQuestions: [],
      receipts: demoStore.receipts.filter((receipt) => receipt.goalId === goalId).slice(0, 10),
    };
  }

  async projectView(projectId: string, view: "overview" | "claims" | "sources" | "decisions") {
    const project = demoStore.projects.find((row) => row.id === projectId);
    if (!project) return undefined;
    const owned = <T extends Record<string, unknown>>(rows: T[]) => rows.filter((row) => row.projectId === projectId);
    if (view === "claims") return { project, claims: owned(demoStore.claims) };
    if (view === "decisions") return { project, decisions: owned(demoStore.decisions) };
    if (view === "sources") return { project, sources: demoStore.sources.filter((source) => source.projectId === projectId && (source.retention ?? "library") === "library"), papers: owned(demoStore.papers) };
    return { project, decisions: owned(demoStore.decisions).slice(0, 10), claims: owned(demoStore.claims).slice(0, 10), notes: owned(demoStore.notes).slice(0, 10) };
  }

  async updateGoal(goalId: string, changes: { title?: string; outcome?: string; targetDate?: string; status?: string; deleted?: boolean }) {
    const goal = demoStore.goals.find((row) => row.id === goalId);
    if (!goal) return undefined;
    Object.assign(goal, Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)), { updatedAt: new Date().toISOString() });
    if (changes.deleted) {
      demoStore.goals = demoStore.goals.filter((row) => row.id !== goalId);
      demoStore.tasks = demoStore.tasks.filter((task) => task.goalId !== goalId);
    }
    return goal;
  }

  async read(name: string, args: Record<string, unknown>) {
    if (name === "list_context_packs") return buildContextPacks(await this.workspace("memory")).map((pack) => pack.metadata);
    if (name === "get_context_pack") return getContextPack(await this.workspace("memory"), String(args.packId), Number(args.maxTokens ?? 1800));
    if (name === "get_context_changes_since") {
      const since = Date.parse(String(args.since));
      return compactToBudget(demoStore.events.filter((event) => Date.parse(event.occurredAt) > since).slice(0, Number(args.limit ?? 50)), Number(args.maxTokens ?? 1200));
    }
    if (name === "list_projects" || name === "load_project" || name === "list_goals" || name === "load_goal" || name === "load_outcome_receipt") return compactToBudget(readDemoState(name, args), Number(args.maxTokens ?? 1400));
    if (name === "search_memory" || name === "search_academic_memory") return compactToBudget(await this.searchMemory({ query: String(args.query), types: Array.isArray(args.types) ? args.types.map(String) : undefined, goalId: args.goalId ? String(args.goalId) : undefined, projectId: args.projectId ? String(args.projectId) : undefined, limit: Number(args.limit ?? 8) }), Number(args.maxTokens ?? 1200));
    if (name === "load_context") {
      const base = readDemoState(name, args) as Record<string, unknown>;
      const related = args.focus ? await this.searchMemory({ query: String(args.focus), goalId: args.goalId ? String(args.goalId) : undefined, projectId: args.projectId ? String(args.projectId) : undefined, limit: 6 }) : [];
      return compactToBudget({ ...base, relevantMemories: related, contextPolicy: "structured current state + relevant durable memories; raw history omitted" }, Number(args.maxTokens ?? 1200));
    }
    if (name === "recommend_resource") return this.recommendResource(args);
    return readDemoState(name, args);
  }

  async write(name: string, args: Record<string, unknown>, now: string, surface: "mcp" | "standalone_app" = "mcp", clientId?: string) {
    if (name === "record_approved_update") {
      const approval = args.approval as { approvedAt?: unknown; approvedBy?: unknown };
      assertRecentConfirmation(approval?.approvedAt, now);
      const event = await this.appendEvent({ type: `approved.${String(args.kind)}`, summary: String(args.summary), entityIds: [String(args.entityId)], payload: { detail: args.detail, provenance: args.provenance, approvedBy: approval.approvedBy, clientId }, source: { surface }, goalId: args.goalId ? String(args.goalId) : undefined, projectId: args.projectId ? String(args.projectId) : undefined, importance: 0.72 }, now);
      return { data: event, entityIds: [String(args.entityId)], summary: "Recorded the explicitly approved update with provenance." };
    }
    if (name === "sync_session") {
      const sync = sessionSyncSchema.parse(args);
      const event = await this.appendEvent({ type: "session.checkpoint.saved", summary: sync.summary, entityIds: [opaqueId("checkpoint")], payload: sync, goalId: sync.goalId, projectId: sync.projectId, source: { surface, sessionId: sync.sessionId }, importance: 0.8 }, now);
      const receipt = outcomeReceiptSchema.parse({ id: opaqueId("receipt"), userId: this.userId, sessionId: sync.sessionId, goalId: sync.goalId, projectId: sync.projectId, summary: sync.summary, completed: sync.completed, decisions: sync.decisions, conceptsLearned: sync.conceptsLearned, misconceptions: sync.misconceptions, unresolvedQuestions: sync.unresolvedQuestions, nextActions: sync.nextActions, evidenceIds: sync.evidenceIds, sourceEventIds: [event.id], createdAt: now });
      await this.saveReceipt(receipt);
      return { data: receipt, entityIds: [receipt.id], evidenceIds: receipt.evidenceIds, summary: "Saved a compact outcome receipt; full conversation history was not copied into the prompt." };
    }
    if (name.startsWith("propose_")) {
      const proposal = { id: opaqueId("proposal"), userId: this.userId, clientId, kind: name.replace(/^propose_/, "").replace(/_change$/, "_change"), entityId: args.entityId, summary: String(args.summary ?? `Proposed ${name.replaceAll("_", " ")}`), payload: args, risk: name.includes("schedule") || name.includes("goal") ? "high" : "medium", status: "pending", createdAt: now, expiresAt: new Date(Date.parse(now) + 24 * 3600_000).toISOString() };
      demoStore.proposals.unshift(proposal);
      return { data: proposal, entityIds: [proposal.id], summary: "Proposal saved without changing current state. Confirm it explicitly to apply." };
    }
    if (name === "confirm_proposal") {
      assertRecentConfirmation(args.confirmedAt, now);
      const proposal = demoStore.proposals.find((item) => item.id === args.proposalId && item.status === "pending");
      if (!proposal) throw new Error("Pending proposal not found");
      const changes = (proposal.payload as { changes?: Record<string, unknown> }).changes ?? {};
      const optionalString = (key: string) => typeof changes[key] === "string" ? String(changes[key]) : undefined;
      if (proposal.kind === "goal_change" && !proposal.entityId) {
        const title = optionalString("title"); const outcome = optionalString("outcome"); const target = optionalString("targetDate");
        if (!title || !outcome || !target || Number.isNaN(new Date(target).valueOf())) throw new Error("A new goal requires title, outcome, and a valid targetDate");
        proposal.entityId = opaqueId("goal");
        demoStore.goals.unshift({ id: proposal.entityId, title, outcome, targetDate: target, status: "active", progress: 0, createdAt: now });
      }
      if (proposal.kind === "goal_change" && proposal.entityId) {
        if (!demoStore.goals.some((goal) => goal.id === proposal.entityId)) throw new Error("Goal not found or not accessible");
        const target = optionalString("targetDate");
        if (target && Number.isNaN(new Date(target).valueOf())) throw new Error("Goal targetDate is invalid");
        demoStore.goals = demoStore.goals.map((goal) => goal.id === proposal.entityId ? { ...goal, ...(optionalString("title") ? { title: optionalString("title") } : {}), ...(optionalString("outcome") ? { outcome: optionalString("outcome") } : {}), ...(target ? { targetDate: target } : {}), ...(["active", "paused", "completed"].includes(optionalString("status") ?? "") ? { status: optionalString("status") } : {}), ...(typeof changes.progress === "number" ? { progress: Math.max(0, Math.min(1, changes.progress)) } : {}), updatedAt: now } : goal);
      }
      if (proposal.kind === "project_change" && !proposal.entityId) {
        const title = optionalString("title"); const purpose = optionalString("purpose"); const goalId = optionalString("goalId");
        if (!title || !purpose) throw new Error("A new project requires title and purpose");
        if (goalId && !demoStore.goals.some((goal) => goal.id === goalId)) throw new Error("Project goal is not accessible");
        proposal.entityId = opaqueId("project");
        demoStore.projects.unshift({ id: proposal.entityId, title, purpose, ...(goalId ? { goalId } : {}), phase: optionalString("phase") ?? "Planning", createdAt: now });
      }
      if (proposal.kind === "project_change" && proposal.entityId) {
        if (!demoStore.projects.some((project) => project.id === proposal.entityId)) throw new Error("Project not found or not accessible");
        demoStore.projects = demoStore.projects.map((project) => project.id === proposal.entityId ? { ...project, ...(optionalString("title") ? { title: optionalString("title") } : {}), ...(optionalString("purpose") ? { purpose: optionalString("purpose") } : {}), ...(optionalString("phase") ? { phase: optionalString("phase") } : {}), updatedAt: now } : project);
      }
      if (proposal.kind === "task_change" && !proposal.entityId) {
        const goalId = optionalString("goalId"); const title = optionalString("title"); const estimate = changes.estimatedMinutes;
        if (!goalId || !title || typeof estimate !== "number") throw new Error("A new task requires goalId, title, and estimatedMinutes");
        if (!demoStore.goals.some((goal) => goal.id === goalId)) throw new Error("Task goal is not accessible");
        proposal.entityId = opaqueId("task");
        demoStore.tasks.unshift({ id: proposal.entityId, goalId, title, ...(optionalString("description") ? { description: optionalString("description") } : {}), status: "backlog", estimatedMinutes: Math.max(5, Math.min(1440, Math.round(estimate))), priority: typeof changes.priority === "number" ? Math.max(1, Math.min(5, Math.round(changes.priority))) : 3, ...(optionalString("deadline") ? { deadline: optionalString("deadline") } : {}), ...(optionalString("completionEvidence") ? { completionEvidence: optionalString("completionEvidence") } : {}), createdAt: now });
      }
      if (proposal.kind === "task_change" && proposal.entityId) {
        if (!demoStore.tasks.some((task) => task.id === proposal.entityId)) throw new Error("Task not found or not accessible");
        const allowedStatus = ["backlog", "planned", "in_progress", "blocked", "done"].includes(optionalString("status") ?? "") ? optionalString("status") : undefined;
        demoStore.tasks = demoStore.tasks.map((task) => task.id === proposal.entityId ? { ...task, ...(optionalString("title") ? { title: optionalString("title") } : {}), ...(optionalString("description") ? { description: optionalString("description") } : {}), ...(allowedStatus ? { status: allowedStatus } : {}), ...(typeof changes.estimatedMinutes === "number" ? { estimatedMinutes: Math.max(5, Math.min(1440, Math.round(changes.estimatedMinutes))) } : {}), ...(typeof changes.priority === "number" ? { priority: Math.max(1, Math.min(5, Math.round(changes.priority))) } : {}), ...(optionalString("deadline") ? { deadline: optionalString("deadline") } : {}), ...(optionalString("completionEvidence") ? { completionEvidence: optionalString("completionEvidence") } : {}), updatedAt: now } : task);
      }
      proposal.status = proposal.kind === "schedule_change" ? "confirmed" : "applied";
      proposal.confirmedAt = now;
      await this.appendEvent({ type: "proposal.confirmed", summary: String(proposal.summary), entityIds: [String(proposal.id)], payload: proposal, source: { surface } }, now);
      return { data: proposal, entityIds: [String(proposal.id)], summary: proposal.kind === "schedule_change" ? "Confirmed the schedule proposal; a separate commit is still required." : "Confirmed and applied the approved fields to the shared state." };
    }
    if (name === "reject_proposal") {
      const proposal = demoStore.proposals.find((item) => item.id === args.proposalId && item.status === "pending");
      if (!proposal) throw new Error("Pending proposal not found");
      proposal.status = "rejected";
      proposal.rejectedAt = now;
      await this.appendEvent({ type: "proposal.rejected", summary: `Rejected: ${String(proposal.summary)}`, entityIds: [String(proposal.id)], payload: { kind: proposal.kind }, source: { surface } }, now);
      return { data: proposal, entityIds: [String(proposal.id)], summary: "Rejected the proposal without changing current state." };
    }
    if (name === "commit_schedule_change") {
      const proposal = demoStore.proposals.find((item) => item.id === args.proposalId && item.status === "confirmed" && item.kind === "schedule_change");
      if (!proposal) throw new Error("Confirmed schedule proposal not found");
      assertRecentConfirmation((args.confirmation as { confirmedAt?: unknown } | undefined)?.confirmedAt, now);
      if (proposal.entityId) {
        const current = demoStore.schedule.find((block) => block.id === proposal.entityId);
        if (!current) throw new Error("Schedule block not found or not accessible");
        const changes = (proposal.payload as { changes?: Record<string, unknown> }).changes ?? {};
        const start = String(changes.startsAt ?? changes.start ?? current.start ?? current.startsAt ?? "");
        const end = String(changes.endsAt ?? changes.end ?? current.end ?? current.endsAt ?? "");
        if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start) >= Date.parse(end) || Date.parse(end) - Date.parse(start) > 8 * 3600_000) throw new Error("Schedule proposal contains an invalid time range");
        demoStore.schedule = demoStore.schedule.map((block) => block.id === proposal.entityId ? { ...block, start, end, ...(typeof changes.status === "string" ? { status: changes.status } : {}), proposalId: proposal.id, committedAt: now } : block);
        proposal.status = "applied";
        await this.appendEvent({ type: "schedule.change.committed", summary: "Committed one confirmed schedule block update.", entityIds: [String(proposal.id), String(proposal.entityId)], payload: { savedInContinuum: true }, source: { surface } }, now);
        return { data: { proposal, blocks: demoStore.schedule.filter((block) => block.id === proposal.entityId), savedInContinuum: true }, entityIds: [String(proposal.id), String(proposal.entityId)], summary: "Committed the confirmed schedule change in Continuum." };
      }
      const blocks = ((proposal.payload as { changes?: { blocks?: Array<Record<string, unknown>> } }).changes?.blocks ?? []).map((block) => {
        const taskId = String(block.taskId ?? "");
        const start = String(block.start ?? block.startsAt ?? "");
        const end = String(block.end ?? block.endsAt ?? "");
        const startTime = Date.parse(start); const endTime = Date.parse(end);
        if (!demoStore.tasks.some((task) => task.id === taskId) || !Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime >= endTime || endTime - startTime > 8 * 3600_000) throw new Error("Schedule proposal contains an invalid task or time range");
        return { id: typeof block.id === "string" ? block.id : opaqueId("block"), ...block, taskId, start, end, proposalId: proposal.id, committedAt: now, status: "planned" };
      });
      if (!blocks.length) throw new Error("Schedule proposal contains no blocks to commit");
      demoStore.schedule.unshift(...blocks);
      proposal.status = "applied";
      await this.appendEvent({ type: "schedule.change.committed", summary: `Committed ${blocks.length} confirmed schedule block${blocks.length === 1 ? "" : "s"}.`, entityIds: [String(proposal.id), ...blocks.map((block) => String(block.id))], payload: { savedInContinuum: true }, source: { surface } }, now);
      return { data: { proposal, blocks, savedInContinuum: true }, entityIds: [String(proposal.id), ...blocks.map((block) => String(block.id))], summary: "Committed the confirmed schedule change in Continuum." };
    }
    if (name === "record_learning_evidence") {
      const attemptId = String(args.attemptId);
      const mastery = updateMastery(await this.getLearningState(), { id: attemptId, kind: "assessment", correct: Boolean(args.correct), unseen: Boolean(args.unseen), occurredAt: now });
      await this.saveLearningState(mastery);
      await this.appendEvent({ type: "learning.evidence.recorded", summary: Boolean(args.correct) ? "Recorded correct learning evidence." : "Recorded learning evidence; the checkpoint did not pass.", entityIds: [attemptId], payload: { ...args, mastery }, source: { surface }, goalId: args.goalId ? String(args.goalId) : undefined }, now);
      return { data: mastery, entityIds: [attemptId, mastery.conceptId], evidenceIds: [attemptId], summary: "Learning evidence saved; transfer changed only if this was a correct unseen assessment." };
    }
    if (name === "start_resource_activity") {
      const resource = curatedResourceRegistry.find((item) => item.id === args.resourceId);
      if (!resource) throw new Error("Resource is not in the reviewed registry");
      const activity = resourceActivitySchema.parse({ id: opaqueId("activity"), userId: this.userId, resourceId: resource.id, recommendationId: args.recommendationId, goalId: args.goalId, conceptId: args.conceptId, status: "started", startedAt: now, evidenceIds: [] });
      await this.saveResourceActivity(activity, { resource });
      await this.appendEvent({ type: "resource.activity.started", summary: `Started ${resource.title}.`, entityIds: [activity.id, resource.id], payload: { resourceId: resource.id, verification: resource.verification }, source: { surface }, goalId: activity.goalId }, now);
      return { data: activity, entityIds: [activity.id], summary: "Saved the guided resource handoff; progress is still unverified." };
    }
    if (name === "complete_resource_activity") {
      const current = await this.getResourceActivity(String(args.activityId));
      if (!current) throw new Error("Resource activity not found");
      const activity = resourceActivitySchema.parse({ ...current, status: "returned", returnedAt: now, evidenceIds: args.verificationAttemptId ? [String(args.verificationAttemptId)] : [], verificationScore: args.score });
      await this.saveResourceActivity(activity, { ...(current.metadata as Record<string, unknown> ?? {}), returnEvidence: args.evidence });
      await this.appendEvent({ type: "resource.activity.returned", summary: "Returned from an external resource; verification is still required before mastery changes.", entityIds: [activity.id], payload: args, source: { surface }, goalId: activity.goalId }, now);
      return { data: activity, entityIds: [activity.id], summary: "Return saved. Use an unseen learning evidence tool before granting mastery." };
    }
    const result = writeDemoState(name, args, now);
    await this.appendEvent({ type: `mcp.${name.replaceAll("_", ".")}`, summary: result.summary, entityIds: result.entityIds, payload: args, source: { surface } }, now);
    return result;
  }

  async appendEvent(input: AppEventInput, now = new Date().toISOString()) {
    const event = toEvent(this.userId, input, now);
    const stored: DemoEvent = { id: event.id, type: event.type, entityIds: input.entityIds, summary: input.summary, payload: event.payload, occurredAt: event.timestamp };
    demoStore.events.unshift(stored);
    const content = memoryContent(input);
    demoStore.memoryChunks.unshift({ id: opaqueId("memory"), kind: input.type, content, ...(input.projectId ? { projectId: input.projectId } : {}), ...(input.goalId ? { goalId: input.goalId } : {}), occurredAt: now, importance: input.importance ?? 0.6, tokenEstimate: estimateTokens(content), sourceEventIds: [event.id], metadata: { surface: event.source.surface } });
    return stored;
  }

  async getLearningState() { return demoStore.learningState; }
  async saveLearningState(state: MasteryState) { demoStore.learningState = state; }
  async ensureConcept(topic: string) { return `concept_${createHash("sha256").update(`${this.userId}:${topic.toLowerCase().trim()}`).digest("hex").slice(0, 20)}`; }
  async saveQuestionBank(input: QuestionBankWrite) {
    const now = new Date().toISOString();
    const value = { ...input, userId: this.userId, createdAt: now, updatedAt: now, version: 1, deleted: false };
    const index = demoStore.questionBanks.findIndex((item) => item.id === input.id);
    if (index >= 0) demoStore.questionBanks[index] = { ...demoStore.questionBanks[index], ...value, version: Number(demoStore.questionBanks[index]?.version ?? 1) + 1 };
    else demoStore.questionBanks.unshift(value);
    return value;
  }
  async listQuestionBanks() { return demoStore.questionBanks.filter((item) => item.userId === this.userId && item.deleted !== true); }
  async getQuestionBank(questionBankId: string) {
    const bank = demoStore.questionBanks.find((item) => item.id === questionBankId && item.userId === this.userId && item.deleted !== true);
    return bank ? { ...bank, attempts: demoStore.questionBankAttempts.filter((item) => item.questionBankId === questionBankId && item.userId === this.userId) } : undefined;
  }
  async saveQuestionBankAttempt(input: QuestionBankAttemptWrite) {
    const bank = demoStore.questionBanks.find((item) => item.id === input.questionBankId && item.userId === this.userId && item.deleted !== true);
    if (!bank) throw new Error("Question bank not found or not accessible");
    const now = new Date().toISOString();
    const value = { ...input, userId: this.userId, createdAt: now, updatedAt: now, version: 1 };
    const index = demoStore.questionBankAttempts.findIndex((item) => item.id === input.id && item.userId === this.userId);
    if (index >= 0) demoStore.questionBankAttempts[index] = { ...demoStore.questionBankAttempts[index], ...value, version: Number(demoStore.questionBankAttempts[index]?.version ?? 1) + 1 };
    else demoStore.questionBankAttempts.unshift(value);
    Object.assign(bank, { status: input.completedAt ? "completed" : "in_progress", mode: input.mode, updatedAt: now });
    return value;
  }
  async getImageExtractionByHash(contentHash: string) {
    return demoStore.imageExtractions.find((item) => item.userId === this.userId && item.contentHash === contentHash);
  }
  async getImageExtraction(extractionId: string) {
    return demoStore.imageExtractions.find((item) => item.userId === this.userId && item.id === extractionId);
  }
  async saveImageExtraction(input: ImageExtractionWrite) {
    const now = new Date().toISOString();
    const value = { ...input, userId: this.userId, createdAt: now, updatedAt: now };
    const index = demoStore.imageExtractions.findIndex((item) => item.userId === this.userId && item.contentHash === input.contentHash);
    if (index >= 0) demoStore.imageExtractions[index] = { ...demoStore.imageExtractions[index], ...value };
    else demoStore.imageExtractions.unshift(value);
    return value;
  }
  async createAssistantSession(input: { id: string; title: string }) {
    const now = new Date().toISOString();
    const session = { ...input, userId: this.userId, status: "active", summary: null, decisions: [], unresolvedQuestions: [], createdTasks: [], importantFacts: [], linkedEntityIds: [], memoryExcluded: false, pinned: false, archived: false, groupLabel: null, contextSettings: {}, lastMessageAt: now, createdAt: now, updatedAt: now, version: 1, deleted: false };
    demoStore.assistantSessions.unshift(session);
    return session;
  }
  async listAssistantSessions() { return demoStore.assistantSessions.filter((item) => item.userId === this.userId && item.deleted !== true).sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || String(right.lastMessageAt).localeCompare(String(left.lastMessageAt))); }
  async getAssistantSession(sessionId: string) {
    const session = demoStore.assistantSessions.find((item) => item.id === sessionId && item.userId === this.userId && item.deleted !== true);
    return session ? { ...session, messages: demoStore.assistantMessages.filter((item) => item.sessionId === sessionId && item.userId === this.userId) } : undefined;
  }
  async appendAssistantMessage(input: { id: string; sessionId: string; role: "user" | "assistant"; content: string; provider?: string; model?: string; metadata?: Record<string, unknown> }) {
    const session = demoStore.assistantSessions.find((item) => item.id === input.sessionId && item.userId === this.userId && item.deleted !== true);
    if (!session) throw new Error("Assistant session not found or not accessible");
    const now = new Date().toISOString();
    const message = { ...input, userId: this.userId, createdAt: now, updatedAt: now, version: 1 };
    demoStore.assistantMessages.push(message);
    Object.assign(session, {
      lastMessageAt: now,
      updatedAt: now,
      ...(deriveConversationTitle(String(session.title ?? ""), input.role, input.content) ? { title: deriveConversationTitle(String(session.title ?? ""), input.role, input.content)! } : {}),
    });
    return message;
  }
  async updateAssistantSession(sessionId: string, input: { title?: string; pinned?: boolean; archived?: boolean; groupLabel?: string | null; contextSettings?: Record<string, unknown> }) {
    const session = demoStore.assistantSessions.find((item) => item.id === sessionId && item.userId === this.userId && item.deleted !== true);
    if (!session) return undefined;
    Object.assign(session, input, { updatedAt: new Date().toISOString(), version: Number(session.version ?? 1) + 1 });
    return session;
  }
  async updateAssistantSessionMemory(sessionId: string, memory: AssistantSessionMemory) {
    const session = demoStore.assistantSessions.find((item) => item.id === sessionId && item.userId === this.userId && item.deleted !== true);
    if (!session) return undefined;
    Object.assign(session, memory, { updatedAt: new Date().toISOString(), version: Number(session.version ?? 1) + 1 });
    return session;
  }
  async deleteAssistantSession(sessionId: string) {
    const session = demoStore.assistantSessions.find((item) => item.id === sessionId && item.userId === this.userId && item.deleted !== true);
    if (!session) return false;
    Object.assign(session, { deleted: true, memoryExcluded: true, updatedAt: new Date().toISOString() });
    return true;
  }
  async findSourceByHash(hash: string) { const source = demoStore.sources.find((item) => item.contentHash === hash); return source ? { id: source.id, title: source.title } : undefined; }
  async saveSource(source: SourceWrite) {
    demoStore.sources.unshift({ id: source.id, userId: this.userId, ...(source.projectId ? { projectId: source.projectId } : {}), title: source.title, mimeType: source.mimeType, ...(source.storagePath ? { storagePath: source.storagePath } : {}), contentHash: source.contentHash, sourceVersion: source.sourceVersion, parserVersion: source.parserVersion, retention: source.retention ?? "library", createdAt: new Date().toISOString() });
    demoStore.chunks.push(...source.chunks.map((chunk) => ({ id: chunk.id, sourceId: source.id, sourceTitle: source.title, passage: chunk.passage, text: chunk.content, contentHash: chunk.contentHash, sourceVersion: source.sourceVersion, deleted: false, reference: `${source.title} · passage ${chunk.passage}` })));
  }
  async listSources(scope: "library" | "all" = "library") {
    return demoStore.sources
      .filter((item) => scope === "all" || (item.retention ?? "library") === "library")
      .map((item) => {
        const { storagePath, ...metadata } = item;
        void storagePath;
        return metadata;
      });
  }
  async savePaper(paper: PaperWrite) {
    const existing = demoStore.papers.find((item) => item.projectId === paper.projectId && ((paper.doi && String(item.doi ?? "").toLowerCase() === paper.doi.toLowerCase()) || String(item.title ?? "").toLowerCase() === paper.title.toLowerCase()));
    if (existing) return { paper: existing, duplicate: true };
    const saved = { ...paper, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deleted: false, version: 1 };
    demoStore.papers.unshift(saved);
    return { paper: saved, duplicate: false };
  }
  async listPapers(projectId?: string) { return demoStore.papers.filter((paper) => !projectId || paper.projectId === projectId); }
  async listSourceChunks() { return demoStore.chunks; }
  async deleteSource(sourceId: string) { const source = demoStore.sources.find((item) => item.id === sourceId); if (!source) return undefined; demoStore.sources = demoStore.sources.filter((item) => item.id !== sourceId); demoStore.chunks = demoStore.chunks.filter((chunk) => chunk.sourceId !== sourceId); return { id: source.id, title: source.title, ...(source.storagePath ? { storagePath: source.storagePath } : {}) }; }
  async vectorSearch() { return []; }
  async searchMemory(input: { query: string; types?: string[]; goalId?: string; projectId?: string; limit?: number }) {
    const query = input.query.toLowerCase();
    return demoStore.memoryChunks.filter((chunk) => (!input.goalId || chunk.goalId === input.goalId) && (!input.projectId || chunk.projectId === input.projectId) && (!input.types?.length || input.types.includes(chunk.kind)) && chunk.content.toLowerCase().includes(query)).slice(0, input.limit ?? 8);
  }
  /**
   * The local-development mirror of `repo.searchWorkspace` (§8.4). It searches
   * the same nine kinds over the in-memory store so the palette behaves
   * identically without a database — the dual implementation §16.8 requires.
   */
  async searchWorkspace(input: { query: string; kinds?: string[]; limit?: number }) {
    const trimmed = input.query.trim().slice(0, 200);
    if (trimmed.length < 2) return [];
    const needle = trimmed.toLowerCase();
    const bounded = Math.max(1, Math.min(input.limit ?? 20, 50));
    const wanted = (kind: string) => !input.kinds?.length || input.kinds.includes(kind);
    const matches = (...values: Array<unknown>) => values.some((value) => typeof value === "string" && value.toLowerCase().includes(needle));
    const snippet = (value: unknown) => {
      const flat = String(value ?? "").replace(/\s+/g, " ").trim();
      const at = flat.toLowerCase().indexOf(needle);
      if (at < 0) return flat.slice(0, 160);
      const from = Math.max(0, at - 40);
      return `${from > 0 ? "…" : ""}${flat.slice(from, from + 160)}${from + 160 < flat.length ? "…" : ""}`;
    };
    const stamp = (row: Record<string, unknown>) => String(row.updatedAt ?? row.createdAt ?? row.occurredAt ?? new Date(0).toISOString());
    const hits: WorkspaceSearchHit[] = [];
    const goalTitle = (goalId: unknown) => String(demoStore.goals.find((goal) => goal.id === goalId)?.title ?? "Goal");
    const projectTitle = (projectId: unknown) => String(demoStore.projects.find((project) => project.id === projectId)?.title ?? "Research project");
    if (wanted("goal")) for (const goal of demoStore.goals) if (matches(goal.title, goal.outcome)) hits.push({ kind: "goal", id: String(goal.id), title: String(goal.title ?? "Untitled goal"), snippet: snippet(goal.outcome), context: "Goal", updatedAt: stamp(goal) });
    if (wanted("task")) for (const task of demoStore.tasks) if (matches(task.title)) hits.push({ kind: "task", id: String(task.id), title: String(task.title ?? "Untitled task"), snippet: snippet(task.description), context: goalTitle(task.goalId), parentId: task.goalId ? String(task.goalId) : undefined, updatedAt: stamp(task) });
    if (wanted("project")) for (const project of demoStore.projects) if (matches(project.title, project.purpose)) hits.push({ kind: "project", id: String(project.id), title: String(project.title ?? "Untitled project"), snippet: snippet(project.purpose), context: "Research project", parentId: project.goalId ? String(project.goalId) : undefined, updatedAt: stamp(project) });
    if (wanted("source")) for (const source of demoStore.sources) if (matches(source.title)) hits.push({ kind: "source", id: source.id, title: source.title, snippet: "", context: "Source", updatedAt: source.createdAt });
    if (wanted("paper")) for (const paper of demoStore.papers) if (matches(paper.title, paper.doi)) hits.push({ kind: "paper", id: String(paper.id), title: String(paper.title ?? "Untitled paper"), snippet: [Array.isArray(paper.authors) ? paper.authors.slice(0, 3).join(", ") : "", paper.year].filter(Boolean).join(" · "), context: projectTitle(paper.projectId), parentId: paper.projectId ? String(paper.projectId) : undefined, updatedAt: stamp(paper) });
    if (wanted("conversation")) for (const session of demoStore.assistantSessions) if (matches(session.title, session.summary)) hits.push({ kind: "conversation", id: String(session.id), title: String(session.title ?? "Conversation"), snippet: snippet(session.summary), context: "Conversation", updatedAt: String(session.lastMessageAt ?? stamp(session)) });
    if (wanted("note")) for (const note of demoStore.notes) if (matches(note.text)) hits.push({ kind: "note", id: String(note.id), title: snippet(note.text).slice(0, 80), snippet: snippet(note.text), context: projectTitle(note.projectId), parentId: note.projectId ? String(note.projectId) : undefined, updatedAt: stamp(note) });
    if (wanted("memory")) for (const chunk of demoStore.memoryChunks) if (matches(chunk.content)) hits.push({ kind: "memory", id: chunk.id, title: snippet(chunk.content).slice(0, 80), snippet: snippet(chunk.content), context: `Remembered · ${chunk.kind.replaceAll("_", " ")}`, updatedAt: chunk.occurredAt });
    return hits
      .sort((left, right) => {
        const rank = (hit: WorkspaceSearchHit) => (hit.title.toLowerCase().startsWith(needle) ? 0 : hit.title.toLowerCase().includes(needle) ? 1 : 2);
        return rank(left) - rank(right) || right.updatedAt.localeCompare(left.updatedAt);
      })
      .slice(0, bounded);
  }
  async saveReceipt(receipt: OutcomeReceipt) { demoStore.receipts.unshift(receipt as unknown as Record<string, unknown>); }
  async listReceipts(limit = 10) { return demoStore.receipts.slice(0, limit); }
  private memoryMilestones: Array<Record<string, unknown>> = [];
  async createMilestone(input: { id: string; goalId: string; title: string; order: number; dueAt?: string }) { this.memoryMilestones.push({ ...input, status: "upcoming" }); }
  async listMilestones(goalId?: string) { return this.memoryMilestones.filter((milestone) => !goalId || milestone.goalId === goalId).sort((left, right) => Number(left.order) - Number(right.order)); }
  async saveOnboardingIntake() { /* Local development identity does not persist a profile. */ }
  async seedResources() { /* Curated registry is already in the application bundle. */ }
  async recommendResource(args: Record<string, unknown>) { return recommendBestResource({ id: opaqueId("recommendation"), topic: String(args.topic ?? "electric potential"), goalId: args.goalId ? String(args.goalId) : undefined, conceptId: args.conceptId ? String(args.conceptId) : undefined, goalType: (args.goalType as "school" | "exam" | "university" | "research" | "coding" | undefined) ?? "school", need: (args.need as ResourceNeed | undefined) ?? "conceptual_intuition", level: args.level ? String(args.level) : undefined, minutesAvailable: args.minutesAvailable ? Number(args.minutesAvailable) : undefined, costPreference: (args.costPreference as "free_only" | "free_preferred" | "any" | undefined) ?? "free_only", preferredFormats: Array.isArray(args.preferredFormats) ? args.preferredFormats.map(String) : undefined, excludeResourceIds: Array.isArray(args.excludeResourceIds) ? args.excludeResourceIds.map(String) : undefined, rejectionReasons: Array.isArray(args.rejectionReasons) ? args.rejectionReasons.map(String) : undefined, feedback: args.feedback ? String(args.feedback) : undefined }); }
  async saveResourceActivity(activity: ResourceActivity, metadata: Record<string, unknown> = {}) { const index = demoStore.resourceActivities.findIndex((item) => item.id === activity.id); const value = { ...activity, metadata }; if (index >= 0) demoStore.resourceActivities[index] = value; else demoStore.resourceActivities.unshift(value); }
  async getResourceActivity(activityId: string) { return demoStore.resourceActivities.find((item) => item.id === activityId); }
  async scheduleResourceFollowup(input: { goalId: string; activityId: string; title: string; evidence: string; startsAt: string; minutes: number }) {
    const block = { id: opaqueId("block"), taskId: opaqueId("task"), goalId: input.goalId, title: input.title, start: input.startsAt, end: new Date(Date.parse(input.startsAt) + input.minutes * 60_000).toISOString(), status: "planned", completionEvidence: input.evidence, proposalId: `resource_${input.activityId}`, committedAt: new Date().toISOString() };
    demoStore.schedule.unshift(block);
    return block;
  }
  async registerOAuthGrant(input: { jti: string; kind: string; expiresAt: string }) { demoStore.oauthGrants[input.jti] = { kind: input.kind, revoked: false, consumed: false, expiresAt: input.expiresAt }; }
  async oauthGrantUnavailable(jti: string) { const grant = demoStore.oauthGrants[jti]; return !grant || Boolean(grant.revoked || grant.consumed || Date.parse(grant.expiresAt) <= Date.now()); }
  async revokeOAuthGrant(jti: string) { const grant = demoStore.oauthGrants[jti]; if (grant) grant.revoked = true; }
  async consumeOAuthGrant(jti: string, kind: "code" | "refresh" | "consent") { const grant = demoStore.oauthGrants[jti]; if (!grant || grant.kind !== kind || grant.revoked || grant.consumed) throw new Error(`${kind === "code" ? "Authorization code" : kind === "refresh" ? "Refresh token" : "Authorization request"} was already used or was not issued`); grant.consumed = true; }
  async consumeOAuthCode(jti: string) { await this.consumeOAuthGrant(jti, "code"); }
}

class NeonStore implements Store {
  readonly kind = "neon" as const;
  private readonly repo = new NeonRepository();
  private resourceSeed?: Promise<void>;

  constructor(readonly userId: string) {}

  async snapshot() { return this.repo.getStateSnapshot(this.userId); }

  async workspace(view: string) { return this.repo.getWorkspaceSnapshot(this.userId, view); }

  async shellData() { return this.repo.getShellData(this.userId); }
  async homeData() { return this.repo.getHomeData(this.userId); }
  async goalView(goalId: string, view: "overview" | "plan" | "study" | "sources") { return this.repo.getGoalView(goalId, this.userId, view) as Promise<Record<string, unknown> | undefined>; }
  async projectView(projectId: string, view: "overview" | "claims" | "sources" | "decisions") { return this.repo.getProjectView(projectId, this.userId, view) as Promise<Record<string, unknown> | undefined>; }
  async updateGoal(goalId: string, changes: { title?: string; outcome?: string; targetDate?: string; status?: string; deleted?: boolean }) { return this.repo.updateGoal(goalId, this.userId, changes) as Promise<Record<string, unknown> | undefined>; }

  async read(name: string, args: Record<string, unknown>, clientId?: string) {
    if (name === "list_context_packs") return buildContextPacks(await this.repo.getWorkspaceSnapshot(this.userId, "memory")).map((pack) => pack.metadata);
    if (name === "get_context_pack") {
      const pack = getContextPack(await this.repo.getWorkspaceSnapshot(this.userId, "memory"), String(args.packId), Number(args.maxTokens ?? 1800));
      await this.repo.logContextAccess({ id: opaqueId("context"), userId: this.userId, clientId, tool: name, focus: pack.metadata.id, selectedRecordIds: pack.metadata.provenance, tokenEstimate: pack.metadata.estimatedTokens, occurredAt: new Date().toISOString() });
      return pack;
    }
    if (name === "get_context_changes_since") {
      const since = Date.parse(String(args.since));
      const snapshot = await this.repo.getWorkspaceSnapshot(this.userId, "memory");
      const events = (snapshot.events as Array<Record<string, unknown>>).filter((event) => Date.parse(String(event.occurredAt)) > since).slice(0, Number(args.limit ?? 50));
      return compactToBudget({ since: args.since, changes: events, newestAt: events[0]?.occurredAt ?? args.since }, Number(args.maxTokens ?? 1200));
    }
    if (name === "list_projects") return (await this.repo.listProjects(this.userId)).map((project) => ({ id: project.id, title: project.title, phase: project.phase, purpose: project.purpose, updatedAt: project.updatedAt.toISOString() }));
    if (name === "load_project") {
      const project = await this.repo.getProject(String(args.projectId), this.userId);
      if (!project) throw new Error("Project not found");
      const relevantMemories = await this.searchMemory({ query: String(args.focus ?? project.project.title), projectId: project.project.id, limit: Number(args.limit ?? 6) });
      return compactToBudget({ ...project, relevantMemories }, Number(args.maxTokens ?? 1400));
    }
    if (name === "list_goals") return this.repo.listGoals(this.userId);
    if (name === "load_goal" || name === "get_goal_state") {
      const goal = await this.repo.getGoal(String(args.goalId), this.userId);
      if (!goal) throw new Error("Goal not found");
      return goal;
    }
    if (name === "search_memory" || name === "search_academic_memory") return compactToBudget(await this.searchMemory({ query: String(args.query), types: Array.isArray(args.types) ? args.types.map(String) : undefined, goalId: args.goalId ? String(args.goalId) : undefined, projectId: args.projectId ? String(args.projectId) : undefined, limit: Number(args.limit ?? 8) }), Number(args.maxTokens ?? 1200));
    if (name === "load_outcome_receipt") {
      const receipts = await this.listReceipts(Number(args.limit ?? 1));
      return args.receiptId ? receipts.find((receipt) => (receipt as { id?: string }).id === args.receiptId) ?? null : receipts[0] ?? null;
    }
    if (name === "recommend_resource") return this.recommendResource(args);
    if (name === "load_learning_state" || name === "get_learning_state") {
      const mastery = await this.getLearningState(args.conceptId ? String(args.conceptId) : undefined);
      return { subject: String(args.subject ?? "Physics"), concept: mastery.conceptId, status: mastery.status, mastery, evidence: mastery.evidenceIds, explanation: mastery.explanation };
    }
    if (name === "load_schedule" || name === "get_today_plan") {
      const from = args.from ? String(args.from) : undefined;
      const to = args.to ? String(args.to) : undefined;
      return compactToBudget(await this.repo.listSchedule(this.userId, from, to), Number(args.maxTokens ?? 1000));
    }
    if (name === "search_research" || name === "search_research_library") {
      return compactToBudget(await this.repo.searchResearch(this.userId, String(args.query ?? ""), Number(args.limit ?? 10)), Number(args.maxTokens ?? 1600));
    }
    if (name === "get_claim_evidence") return await this.repo.getClaimEvidence(String(args.claimId), this.userId) ?? null;
    if (name === "get_source_passage") {
      const chunk = (await this.listSourceChunks()).find((item) => item.id === args.chunkId && (!args.sourceId || item.sourceId === args.sourceId));
      if (!chunk) throw new Error("Source passage not found or not accessible");
      return chunk;
    }
    if (name === "load_context" || name === "get_current_context") {
      const snapshot = await this.repo.getWorkspaceSnapshot(this.userId, "memory");
      const focus = String(args.focus ?? "active academic work");
      const relevant = await this.searchMemory({ query: focus, goalId: args.goalId ? String(args.goalId) : undefined, projectId: args.projectId ? String(args.projectId) : undefined, limit: 8 });
      const goals = (snapshot.goals as unknown[]).slice(0, 6);
      const projects = (snapshot.projects as unknown[]).slice(0, 6);
      const pack = {
        objective: focus,
        activeGoals: goals,
        activeProjects: projects,
        learningState: (snapshot.learningStates as unknown[]).slice(0, 8),
        currentTasks: (snapshot.tasks as unknown[]).slice(0, 10),
        acceptedDecisions: (snapshot.decisions as Array<{ status: string }>).filter((decision) => decision.status === "accepted").slice(0, 6),
        recentOutcomeReceipts: (snapshot.receipts as unknown[]).slice(0, 3),
        relevantMemories: relevant,
        contextPolicy: "Continuum exposed the whole account through scoped search but packed only current structured state and relevant durable memories.",
      };
      const compact = compactToBudget(pack, Number(args.maxTokens ?? 1400));
      const serialized = JSON.stringify(compact);
      await this.repo.logContextAccess({ id: opaqueId("context"), userId: this.userId, clientId, tool: name, focus, selectedRecordIds: relevant.map((item) => item.id), tokenEstimate: estimateTokens(serialized), occurredAt: new Date().toISOString() });
      return compact;
    }
    throw new Error(`Unsupported persistent read operation: ${name}`);
  }

  async write(name: string, args: Record<string, unknown>, now: string, surface: "mcp" | "standalone_app" = "mcp", clientId?: string) {
    if (name === "record_approved_update") {
      const approval = args.approval as { approvedAt?: unknown; approvedBy?: unknown };
      assertRecentConfirmation(approval?.approvedAt, now);
      const event = await this.appendEvent({ type: `approved.${String(args.kind)}`, summary: String(args.summary), entityIds: [String(args.entityId)], payload: { detail: args.detail, provenance: args.provenance, approvedBy: approval.approvedBy, clientId }, source: { surface }, goalId: args.goalId ? String(args.goalId) : undefined, projectId: args.projectId ? String(args.projectId) : undefined, importance: 0.72 }, now);
      return { data: event, entityIds: [String(args.entityId)], summary: "Recorded the explicitly approved update with provenance." };
    }
    if (name === "sync_session") {
      const sync = sessionSyncSchema.parse(args);
      const checkpointId = opaqueId("checkpoint");
      const event = await this.appendEvent({ type: "session.checkpoint.saved", summary: sync.summary, entityIds: [checkpointId], payload: sync, goalId: sync.goalId, projectId: sync.projectId, source: { surface, sessionId: sync.sessionId }, importance: 0.85 }, now);
      const receipt = outcomeReceiptSchema.parse({ id: opaqueId("receipt"), userId: this.userId, sessionId: sync.sessionId, goalId: sync.goalId, projectId: sync.projectId, summary: sync.summary, completed: sync.completed, decisions: sync.decisions, conceptsLearned: sync.conceptsLearned, misconceptions: sync.misconceptions, unresolvedQuestions: sync.unresolvedQuestions, nextActions: sync.nextActions, evidenceIds: sync.evidenceIds, sourceEventIds: [event.id], createdAt: now });
      await this.saveReceipt(receipt, clientId);
      return { data: receipt, entityIds: [receipt.id], evidenceIds: receipt.evidenceIds, summary: "Saved a token-efficient outcome receipt and indexed its durable meaning for future retrieval." };
    }
    if (name.startsWith("propose_")) {
      const id = opaqueId("proposal");
      const kind = name.replace(/^propose_/, "");
      const summary = String(args.summary ?? `Proposed ${kind.replaceAll("_", " ")}`);
      // An identical pending proposal is refreshed rather than duplicated, so
      // the returned id may be the existing row's.
      const proposalId = await this.repo.createProposal({ id, userId: this.userId, clientId, kind, entityId: args.entityId ? String(args.entityId) : undefined, summary, payload: args, risk: name.includes("schedule") || name.includes("goal") ? "high" : "medium", expiresAt: new Date(Date.parse(now) + 24 * 3600_000).toISOString() });
      await this.appendEvent({ type: "proposal.created", summary, entityIds: [proposalId], payload: { kind, risk: name.includes("schedule") || name.includes("goal") ? "high" : "medium" }, source: { surface } }, now);
      return { data: { id: proposalId, kind, summary, status: "pending", confirmationRequired: true }, entityIds: [proposalId], summary: "Proposal saved without changing current state. Explicit confirmation is required." };
    }
    if (name === "confirm_proposal") {
      assertRecentConfirmation(args.confirmedAt, now);
      const proposal = await this.repo.confirmProposal(String(args.proposalId), this.userId);
      if (!proposal) throw new Error("Pending proposal not found, expired, or already resolved");
      await this.appendEvent({ type: "proposal.confirmed", summary: proposal.summary, entityIds: [proposal.id], payload: { kind: proposal.kind, payload: proposal.payload, confirmedBy: args.confirmedBy }, source: { surface } }, now);
      return { data: proposal, entityIds: [proposal.id], summary: proposal.kind === "schedule_change" ? "Confirmed the schedule proposal; commit_schedule_change is still required before the block changes." : "Confirmed and applied the approved, whitelisted fields to the shared state; the audit history was preserved." };
    }
    if (name === "reject_proposal") {
      const proposal = await this.repo.rejectProposal(String(args.proposalId), this.userId);
      if (!proposal) throw new Error("Pending proposal not found, expired, or already resolved");
      await this.appendEvent({ type: "proposal.rejected", summary: `Rejected: ${proposal.summary}`, entityIds: [proposal.id], payload: { kind: proposal.kind }, source: { surface } }, now);
      return { data: proposal, entityIds: [proposal.id], summary: "Rejected the proposal without changing current state." };
    }
    if (name === "commit_schedule_change") {
      assertScheduleCommitAllowed(args.confirmation as { confirmedBy: string; confirmedAt: string } | undefined);
      assertRecentConfirmation((args.confirmation as { confirmedAt?: unknown } | undefined)?.confirmedAt, now);
      const committed = await this.repo.commitScheduleProposal(String(args.proposalId), this.userId);
      const blockIds = committed.blocks.map((block) => block.id);
      await this.appendEvent({ type: "schedule.change.committed", summary: `Committed ${blockIds.length} confirmed Continuum schedule block${blockIds.length === 1 ? "" : "s"}.`, entityIds: [committed.proposal.id, ...blockIds], payload: { confirmation: args.confirmation, savedInContinuum: true }, source: { surface } }, now);
      return { data: { proposal: committed.proposal, blocks: committed.blocks, savedInContinuum: true }, entityIds: [committed.proposal.id, ...blockIds], summary: "Committed the confirmed schedule change in Continuum." };
    }
    if (name === "record_learning_evidence") {
      const attemptId = String(args.attemptId);
      const conceptId = String(args.conceptId);
      const mastery = updateMastery(await this.getLearningState(conceptId), { id: attemptId, kind: "assessment", correct: Boolean(args.correct), unseen: Boolean(args.unseen), occurredAt: now });
      await this.saveLearningState(mastery);
      await this.appendEvent({ type: "learning.evidence.recorded", summary: Boolean(args.correct) ? "Recorded correct learning evidence." : "Recorded learning evidence; the checkpoint did not pass.", entityIds: [attemptId, conceptId], payload: { ...args, mastery }, source: { surface } }, now);
      return { data: mastery, entityIds: [attemptId, conceptId], evidenceIds: [attemptId], summary: "Learning evidence saved; transfer changed only for a correct unseen assessment." };
    }
    if (name === "start_resource_activity") {
      await this.seedResources();
      const resource = curatedResourceRegistry.find((item) => item.id === args.resourceId);
      if (!resource) throw new Error("Resource is not in the reviewed registry");
      const activity = resourceActivitySchema.parse({ id: opaqueId("activity"), userId: this.userId, resourceId: resource.id, recommendationId: args.recommendationId, goalId: args.goalId, conceptId: args.conceptId, status: "started", startedAt: now, evidenceIds: [] });
      await this.saveResourceActivity(activity, { resource });
      await this.appendEvent({ type: "resource.activity.started", summary: `Started ${resource.title}.`, entityIds: [activity.id, resource.id], payload: { resourceId: resource.id, verification: resource.verification }, source: { surface }, goalId: activity.goalId }, now);
      return { data: activity, entityIds: [activity.id], summary: "Saved the guided handoff; progress remains unverified until the return check." };
    }
    if (name === "complete_resource_activity") {
      const current = await this.getResourceActivity(String(args.activityId));
      if (!current) throw new Error("Resource activity not found");
      const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value;
      const activity = resourceActivitySchema.parse({ ...current, startedAt: iso(current.startedAt), returnedAt: now, status: "returned", evidenceIds: args.verificationAttemptId ? [String(args.verificationAttemptId)] : [], verificationScore: args.score });
      await this.saveResourceActivity(activity, { ...(current.metadata as Record<string, unknown> ?? {}), returnEvidence: args.evidence });
      await this.appendEvent({ type: "resource.activity.returned", summary: "Returned from an external resource; verification is still required before mastery changes.", entityIds: [activity.id], payload: args, source: { surface }, goalId: activity.goalId }, now);
      return { data: activity, entityIds: [activity.id], summary: "Return saved. Record a real unseen assessment before granting mastery." };
    }
    const prefix = name === "create_task" ? "task" : name === "create_goal" ? "goal" : name === "create_project" ? "project" : name === "save_decision" ? "decision" : name === "save_research_note" ? "note" : name === "save_research_claim" ? "claim" : "event";
    const id = opaqueId(prefix);
    if (name === "create_goal") await this.repo.createGoal(args, id, now, this.userId);
    if (name === "create_task") await this.repo.createTask(args, id, now, this.userId);
    if (name === "create_project") await this.repo.createProject(args, id, now, this.userId);
    if (name === "save_decision") await this.repo.saveDecision(args, id, now, this.userId);
    if (name === "save_research_note") await this.repo.saveResearchNote(args, id, now, this.userId);
    if (name === "save_research_claim") await this.repo.saveResearchClaim({ id, userId: this.userId, projectId: String(args.projectId), text: String(args.text), evidence: Array.isArray(args.evidence) ? args.evidence.map((item) => { const evidence = item as Record<string, unknown>; return { id: opaqueId("evidence"), sourceId: String(evidence.sourceId), chunkId: String(evidence.chunkId), status: evidence.status as "indirect_support" | "model_inference" | "user_hypothesis" | "unverified" }; }) : [] });
    if (name === "save_artifact") await this.repo.saveArtifact({ id, projectId: String(args.projectId), userId: this.userId, title: String(args.title), kind: String(args.kind), uri: args.uri ? String(args.uri) : undefined, metadata: args.metadata as Record<string, unknown> | undefined });
    if (name === "record_progress") await this.repo.recordTaskProgress({ taskId: String(args.entityId), userId: this.userId, status: String(args.status), evidence: args.evidence ? String(args.evidence) : undefined });
    const summary = name === "commit_schedule_change" ? `Committed confirmed schedule proposal ${String(args.proposalId)}.` : `${name.replaceAll("_", " ")} recorded in the shared academic ledger.`;
    await this.appendEvent({ type: `mcp.${name.replaceAll("_", ".")}`, summary, entityIds: [id], payload: args, source: { surface } }, now);
    return { data: { id, ...args }, entityIds: [id], evidenceIds: [], summary };
  }

  async appendEvent(input: AppEventInput, now = new Date().toISOString()) {
    const event = toEvent(this.userId, input, now);
    await this.repo.appendMemoryEvent(event, input.summary);
    await this.repo.appendAudit({ id: `audit_${event.id.replace(/^event_/, "")}`, userId: event.userId, actor: event.source.surface, action: event.type, entityIds: input.entityIds, summary: input.summary, metadata: event.payload, occurredAt: now });
    const content = memoryContent(input);
    let embedding: number[] | undefined;
    let embeddingModel: string | undefined;
    const configuration = embeddingConfiguration();
    if (configuration) {
      const writeBudget = Math.max(250, Math.min(Number(process.env.EMBEDDING_WRITE_BUDGET_MS ?? 2_000), 10_000));
      const result = await settleWithin(embedDocuments([content]), writeBudget);
      if (result?.[0]) {
        [embedding] = result;
        embeddingModel = configuration.model;
      }
    }
    await this.repo.saveMemoryChunk({ id: opaqueId("memory"), userId: this.userId, projectId: input.projectId, goalId: input.goalId, kind: input.type, content, contentHash: contentHash(`${event.id}:${content}`), embeddingModel, embedding, tokenEstimate: estimateTokens(content), importance: input.importance ?? 0.6, occurredAt: now, sourceEventIds: [event.id], metadata: { surface: event.source.surface, entityIds: input.entityIds } });
    return { id: event.id, type: event.type, entityIds: input.entityIds, summary: input.summary, payload: event.payload, occurredAt: now };
  }

  async getLearningState(conceptId = "concept_potential") { return (await this.repo.getLearningState(this.userId, conceptId)) ?? { conceptId, exposure: 0, understanding: 0, transfer: 0, retention: 0, confidence: 0, status: "not_started", evidenceIds: [], explanation: "No verified evidence has been recorded for this concept yet." }; }
  async saveLearningState(state: MasteryState) { await this.repo.saveLearningState(state, this.userId); }
  async ensureConcept(topic: string) { const normalized = topic.trim().replace(/\s+/g, " "); const conceptId = `concept_${createHash("sha256").update(`${this.userId}:${normalized.toLowerCase()}`).digest("hex").slice(0, 20)}`; await this.repo.ensureConcept(conceptId, normalized); return conceptId; }
  async saveQuestionBank(input: QuestionBankWrite) { return this.repo.saveQuestionBank({ ...input, userId: this.userId }); }
  async listQuestionBanks() { return this.repo.listQuestionBanks(this.userId); }
  async getQuestionBank(questionBankId: string) { return await this.repo.getQuestionBank(questionBankId, this.userId) as unknown as Record<string, unknown> | undefined; }
  async saveQuestionBankAttempt(input: QuestionBankAttemptWrite) { return this.repo.saveQuestionBankAttempt({ ...input, userId: this.userId }); }
  async getImageExtractionByHash(contentHash: string) {
    return this.repo.getImageExtractionByHash(contentHash, this.userId) as Promise<Record<string, unknown> | undefined>;
  }
  async getImageExtraction(extractionId: string) {
    return this.repo.getImageExtraction(extractionId, this.userId) as Promise<Record<string, unknown> | undefined>;
  }
  async saveImageExtraction(input: ImageExtractionWrite) {
    return this.repo.saveImageExtraction({ ...input, userId: this.userId });
  }
  async createAssistantSession(input: { id: string; title: string }) { return this.repo.createAssistantSession({ ...input, userId: this.userId }); }
  async listAssistantSessions() { return this.repo.listAssistantSessions(this.userId); }
  async getAssistantSession(sessionId: string) { return await this.repo.getAssistantSession(sessionId, this.userId) as unknown as Record<string, unknown> | undefined; }
  async appendAssistantMessage(input: { id: string; sessionId: string; role: "user" | "assistant"; content: string; provider?: string; model?: string; metadata?: Record<string, unknown> }) { return this.repo.appendAssistantMessage({ ...input, userId: this.userId }); }
  async updateAssistantSession(sessionId: string, input: { title?: string; pinned?: boolean; archived?: boolean; groupLabel?: string | null; contextSettings?: Record<string, unknown> }) { return this.repo.updateAssistantSession(sessionId, this.userId, input); }
  async updateAssistantSessionMemory(sessionId: string, memory: AssistantSessionMemory) { return this.repo.updateAssistantSessionMemory(sessionId, this.userId, memory); }
  async deleteAssistantSession(sessionId: string) { return this.repo.deleteAssistantSession(sessionId, this.userId); }
  async findSourceByHash(hash: string) { const source = await this.repo.findSourceByHash(hash, this.userId); return source ? { id: source.id, title: source.title } : undefined; }
  async saveSource(source: SourceWrite) { await this.repo.saveSource({ ...source, userId: this.userId }); }
  async listSources(scope: "library" | "all" = "library") { return this.repo.listSources(this.userId, scope); }
  async savePaper(paper: PaperWrite) { return this.repo.savePaper({ ...paper, userId: this.userId }); }
  async listPapers(projectId?: string) { return this.repo.listPapers(this.userId, projectId); }
  async listSourceChunks() { return this.repo.listSourceChunks(this.userId); }
  async deleteSource(sourceId: string) { const source = await this.repo.softDeleteSource(sourceId, this.userId); return source ? { id: source.id, title: source.title, ...(source.storagePath ? { storagePath: source.storagePath } : {}) } : undefined; }
  async vectorSearch(embedding: number[], limit: number) { return this.repo.vectorSearch(embedding, limit, this.userId); }
  async searchMemory(input: { query: string; types?: string[]; goalId?: string; projectId?: string; limit?: number }) {
    let embedding: number[] | undefined;
    if (embeddingConfiguration()) { try { embedding = await embedQuery(input.query); } catch { /* Hybrid retrieval falls back to lexical/current state. */ } }
    return this.repo.searchMemory({ ...input, embedding }, this.userId);
  }
  async searchWorkspace(input: { query: string; kinds?: string[]; limit?: number }) { return this.repo.searchWorkspace(this.userId, input.query, input.kinds, input.limit); }
  async saveReceipt(receipt: OutcomeReceipt, clientId?: string) { await this.repo.saveSessionReceipt(receipt, clientId); }
  async listReceipts(limit = 10) { return this.repo.listSessionReceipts(this.userId, limit); }
  async createMilestone(input: { id: string; goalId: string; title: string; order: number; dueAt?: string }, now: string) { await this.repo.createMilestone(input, now, this.userId); }
  async listMilestones(goalId?: string) { return this.repo.listMilestones(this.userId, goalId); }
  async saveOnboardingIntake(educationLevel: string, intake: Record<string, unknown>, now: string) { await this.repo.saveOnboardingIntake(this.userId, educationLevel, intake, now); }
  async seedResources() { this.resourceSeed ??= this.repo.seedResources(curatedResourceRegistry); await this.resourceSeed; }
  async recommendResource(args: Record<string, unknown>) { await this.seedResources(); const registry = await this.repo.listResources(); return recommendBestResource({ id: opaqueId("recommendation"), topic: String(args.topic ?? "electric potential"), goalId: args.goalId ? String(args.goalId) : undefined, conceptId: args.conceptId ? String(args.conceptId) : undefined, goalType: (args.goalType as "school" | "exam" | "university" | "research" | "coding" | undefined) ?? "school", need: (args.need as ResourceNeed | undefined) ?? "conceptual_intuition", level: args.level ? String(args.level) : undefined, minutesAvailable: args.minutesAvailable ? Number(args.minutesAvailable) : undefined, costPreference: (args.costPreference as "free_only" | "free_preferred" | "any" | undefined) ?? "free_only", preferredFormats: Array.isArray(args.preferredFormats) ? args.preferredFormats.map(String) : undefined, excludeResourceIds: Array.isArray(args.excludeResourceIds) ? args.excludeResourceIds.map(String) : undefined, rejectionReasons: Array.isArray(args.rejectionReasons) ? args.rejectionReasons.map(String) : undefined, feedback: args.feedback ? String(args.feedback) : undefined }, registry.length ? registry : curatedResourceRegistry); }
  async saveResourceActivity(activity: ResourceActivity, metadata?: Record<string, unknown>) { await this.seedResources(); await this.repo.saveResourceActivity(activity, metadata); }
  async getResourceActivity(activityId: string) { return await this.repo.getResourceActivity(activityId, this.userId) as unknown as Record<string, unknown> | undefined; }
  async scheduleResourceFollowup(input: { goalId: string; activityId: string; title: string; evidence: string; startsAt: string; minutes: number }) {
    return this.repo.createResourceFollowup({ id: opaqueId("task"), blockId: opaqueId("block"), userId: this.userId, goalId: input.goalId, title: input.title, evidence: input.evidence, startsAt: input.startsAt, minutes: input.minutes, sourceActivityId: input.activityId }) as Promise<unknown> as Promise<Record<string, unknown>>;
  }
  async registerOAuthGrant(input: { jti: string; userId: string; clientId: string; kind: string; scopes: string[]; expiresAt: string }) { await this.repo.registerOAuthGrant(input); }
  async oauthGrantUnavailable(jti: string) { return this.repo.oauthGrantUnavailable(jti); }
  async revokeOAuthGrant(jti: string) { await this.repo.revokeOAuthGrant(jti); }
  async consumeOAuthGrant(jti: string, kind: "code" | "refresh" | "consent") { await this.repo.consumeOAuthGrant(jti, kind); }
  async consumeOAuthCode(jti: string) { await this.consumeOAuthGrant(jti, "code"); }
}

const selectedStores = new Map<string, Store>();

export function getStore(userId = DEMO_USER_ID): Store {
  const key = `${process.env.DATABASE_URL ? "neon" : "memory"}:${userId}`;
  let store = selectedStores.get(key);
  if (!store) {
    store = process.env.DATABASE_URL ? new NeonStore(userId) : new MemoryStore(userId);
    selectedStores.set(key, store);
  }
  return store;
}

export function integrationTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
