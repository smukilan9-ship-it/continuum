import { initialSchedule, memories, physicsGoal, researchClaims, researchProject } from "@/lib/demo-data";

interface DemoEvent {
  id: string;
  type: string;
  entityIds: string[];
  summary: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

interface DemoStore {
  events: DemoEvent[];
  tasks: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
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
};

if (process.env.NODE_ENV !== "production") globalThis.__continuumDemoStore = demoStore;

export function readDemoState(name: string, args: Record<string, unknown>) {
  if (name === "get_current_context") return {
    activeGoal: physicsGoal,
    today: initialSchedule,
    currentBlocker: "Potential vs potential-energy misconception",
    researchDecision: researchProject.decision,
    nextActions: ["Complete the 3-question Physics diagnostic", researchProject.nextTask],
    focus: args.focus,
  };
  if (name === "search_academic_memory") {
    const query = String(args.query ?? "").toLowerCase();
    return memories.filter((record) => JSON.stringify(record).toLowerCase().includes(query)).slice(0, Number(args.limit ?? 6));
  }
  if (name === "get_goal_state") return physicsGoal;
  if (name === "get_learning_state") return {
    subject: "Physics",
    concept: "Electric potential",
    status: "misconception_detected",
    mastery: { exposure: 0.88, understanding: 0.52, transfer: 0.28, retention: 0.46 },
    evidence: ["attempt_diagnostic_21"],
    explanation: "Transfer remains low because reading has not yet been followed by an unseen checkpoint.",
  };
  if (name === "get_today_plan") return initialSchedule;
  if (name === "search_research_library") {
    const query = String(args.query ?? "").toLowerCase();
    return researchClaims.filter((claim) => JSON.stringify(claim).toLowerCase().includes(query));
  }
  if (name === "get_claim_evidence") return researchClaims.find((claim) => claim.id === args.claimId) ?? null;
  if (name === "recommend_resource") return {
    title: "Potential vs energy micro-lesson",
    authority: "Curriculum aligned",
    rationale: "It directly targets the learner's confirmed misconception and fits the available 25-minute block.",
  };
  return { project: researchProject, claimCount: researchClaims.length };
}

export function writeDemoState(name: string, args: Record<string, unknown>, now: string) {
  const sequence = demoStore.events.length + 1;
  const entityId = name === "create_task" ? `task_mcp_${sequence}` : name === "save_decision" ? `decision_mcp_${sequence}` : name === "save_research_note" ? `note_mcp_${sequence}` : `event_mcp_${sequence}`;
  const summary = name === "commit_schedule_change"
    ? `Committed confirmed schedule proposal ${String(args.proposalId)}.`
    : `${name.replaceAll("_", " ")} recorded in the append-only demo ledger.`;
  const event = { id: `audit_mcp_${sequence}`, type: name, entityIds: [entityId], summary, payload: args, occurredAt: now };
  demoStore.events.push(event);
  if (name === "create_task") demoStore.tasks.push({ id: entityId, ...args, createdAt: now });
  if (name === "save_research_note") demoStore.notes.push({ id: entityId, ...args, createdAt: now });
  if (name === "save_decision") demoStore.decisions.push({ id: entityId, ...args, createdAt: now });
  return { data: { id: entityId, ...args, auditId: event.id }, entityIds: [entityId], evidenceIds: [], summary };
}
