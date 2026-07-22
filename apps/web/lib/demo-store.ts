import type { MasteryState } from "@continuum/schemas";
import type { StoredSourceChunk } from "@continuum/db";

export interface DemoEvent {
  id: string;
  type: string;
  entityIds: string[];
  summary: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface DemoSource {
  id: string;
  userId: string;
  projectId?: string;
  title: string;
  mimeType: string;
  storagePath?: string;
  contentHash: string;
  sourceVersion: number;
  parserVersion: string;
  createdAt: string;
}

export interface DemoStore {
  events: DemoEvent[];
  tasks: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  claims: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  goals: Array<Record<string, unknown>>;
  sources: DemoSource[];
  papers: Array<Record<string, unknown>>;
  chunks: StoredSourceChunk[];
  memoryChunks: Array<{ id: string; kind: string; content: string; projectId?: string; goalId?: string; occurredAt: string; importance: number; tokenEstimate: number; sourceEventIds: string[]; score?: number; metadata: Record<string, unknown> }>;
  receipts: Array<Record<string, unknown>>;
  resourceActivities: Array<Record<string, unknown>>;
  proposals: Array<Record<string, unknown>>;
  schedule: Array<Record<string, unknown>>;
  learningState: MasteryState;
  oauthGrants: Record<string, { kind: string; revoked: boolean; consumed: boolean; expiresAt: string }>;
}

declare global {
  // eslint-disable-next-line no-var
  var __continuumDemoStore: DemoStore | undefined;
}

export const demoStore: DemoStore = globalThis.__continuumDemoStore ?? {
  events: [],
  tasks: [],
  notes: [],
  decisions: [],
  claims: [],
  projects: [],
  goals: [],
  sources: [],
  papers: [],
  chunks: [],
  memoryChunks: [],
  receipts: [],
  resourceActivities: [],
  proposals: [],
  schedule: [],
  learningState: {
    conceptId: "concept_potential",
    exposure: 0.88,
    understanding: 0.52,
    transfer: 0.28,
    retention: 0.46,
    confidence: 0.74,
    status: "misconception_detected",
    evidenceIds: ["attempt_diagnostic_seed"],
    explanation: "Diagnostic evidence indicates confusion between potential and charge-dependent potential energy.",
  },
  oauthGrants: {},
};

// Hot-reloaded development stores may predate newly added collections.
demoStore.papers ??= [];
demoStore.claims ??= [];

if (process.env.NODE_ENV !== "production") globalThis.__continuumDemoStore = demoStore;

export function readDemoState(name: string, args: Record<string, unknown>) {
  if (name === "get_current_context" || name === "load_context") return {
    activeGoals: demoStore.goals.filter((goal) => goal.status !== "completed").slice(0, 6),
    currentTasks: demoStore.tasks.filter((task) => task.status !== "done").slice(0, 10),
    activeProjects: demoStore.projects.slice(0, 6),
    acceptedDecisions: demoStore.decisions.filter((decision) => decision.status === "accepted" || decision.userApproved === true).slice(0, 6),
    learningState: demoStore.learningState,
    today: demoStore.schedule.slice(0, 8),
    recentOutcomeReceipts: demoStore.receipts.slice(0, 3),
    unresolvedQuestions: demoStore.receipts.flatMap((receipt) => Array.isArray(receipt.unresolvedQuestions) ? receipt.unresolvedQuestions : []).slice(0, 8),
    focus: args.focus,
  };
  if (name === "search_academic_memory" || name === "search_memory") {
    const query = String(args.query ?? "").toLowerCase();
    const dynamic = demoStore.memoryChunks.filter((record) => JSON.stringify(record).toLowerCase().includes(query));
    return dynamic.slice(0, Number(args.limit ?? 6));
  }
  if (name === "list_projects") return demoStore.projects.slice(0, Number(args.limit ?? 30));
  if (name === "load_project") return { project: demoStore.projects.find((project) => project.id === args.projectId) ?? null, decisions: demoStore.decisions.filter((decision) => decision.projectId === args.projectId), claims: demoStore.claims.filter((claim) => claim.projectId === args.projectId), notes: demoStore.notes.filter((note) => note.projectId === args.projectId), sources: demoStore.sources.filter((source) => source.projectId === args.projectId), papers: demoStore.papers.filter((paper) => paper.projectId === args.projectId), recentReceipts: demoStore.receipts.filter((receipt) => receipt.projectId === args.projectId) };
  if (name === "list_goals") return demoStore.goals.slice(0, Number(args.limit ?? 30));
  if (name === "get_goal_state" || name === "load_goal") return demoStore.goals.find((goal) => goal.id === args.goalId) ?? null;
  if (name === "get_learning_state" || name === "load_learning_state") return {
    subject: "Physics",
    concept: "Electric potential",
    status: demoStore.learningState.status,
    mastery: demoStore.learningState,
    evidence: demoStore.learningState.evidenceIds,
    explanation: demoStore.learningState.explanation,
  };
  if (name === "get_today_plan" || name === "load_schedule") return demoStore.schedule;
  if (name === "search_research_library" || name === "search_research") {
    const query = String(args.query ?? "").toLowerCase();
    return [...demoStore.decisions, ...demoStore.notes, ...demoStore.sources].filter((record) => JSON.stringify(record).toLowerCase().includes(query));
  }
  if (name === "get_claim_evidence") return null;
  if (name === "load_outcome_receipt") return args.receiptId ? demoStore.receipts.find((receipt) => receipt.id === args.receiptId) ?? null : demoStore.receipts.at(0) ?? null;
  return null;
}

export function writeDemoState(name: string, args: Record<string, unknown>, now: string) {
  const sequence = demoStore.events.length + 1;
  const entityId = name === "create_task" ? `task_mcp_${sequence}` : name === "create_goal" ? `goal_app_${sequence}` : name === "create_project" ? `project_app_${sequence}` : name === "save_decision" ? `decision_mcp_${sequence}` : name === "save_research_note" ? `note_mcp_${sequence}` : `event_mcp_${sequence}`;
  const summary = name === "commit_schedule_change"
    ? `Committed confirmed schedule proposal ${String(args.proposalId)}.`
    : `${name.replaceAll("_", " ")} recorded in the append-only demo ledger.`;
  const event = { id: `audit_mcp_${sequence}`, type: name, entityIds: [entityId], summary, payload: args, occurredAt: now };
  demoStore.events.push(event);
  if (name === "create_task") demoStore.tasks.push({ id: entityId, ...args, status: "backlog", createdAt: now });
  if (name === "record_progress") demoStore.tasks = demoStore.tasks.map((task) => task.id === args.entityId ? { ...task, status: args.status, ...(args.evidence ? { evidence: args.evidence } : {}), updatedAt: now } : task);
  if (name === "create_goal") demoStore.goals.push({ id: entityId, ...args, targetDate: String(args.targetDate ?? args.date ?? ""), status: "active", progress: 0, createdAt: now });
  if (name === "save_research_note") demoStore.notes.push({ id: entityId, ...args, createdAt: now });
  if (name === "save_decision") demoStore.decisions.push({ id: entityId, ...args, createdAt: now });
  if (name === "create_project") demoStore.projects.push({ id: entityId, ...args, createdAt: now });
  return { data: { id: entityId, ...args, auditId: event.id }, entityIds: [entityId], evidenceIds: [], summary };
}
