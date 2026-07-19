import { assertScheduleCommitAllowed, requireScope, type Scope } from "@continuum/domain";
import { sessionSyncSchema, toolResultSchema, type ToolResult } from "@continuum/schemas";
import { z } from "zod";

export type ToolClass = "read" | "write" | "propose" | "invoke";
export interface ContinuumTool {
  name: string;
  title: string;
  description: string;
  requiredScope: Scope;
  class: ToolClass;
  inputSchema: z.ZodType;
  inputJsonSchema: Record<string, unknown>;
  confirmationRequired?: boolean;
  remoteAccessible?: boolean;
}

function tool(input: ContinuumTool) { return input; }

const focusInput = z.object({ focus: z.string().max(1000).optional(), goalId: z.string().optional(), projectId: z.string().optional(), since: z.string().datetime({ offset: true }).optional(), maxTokens: z.number().int().min(200).max(4000).default(1400) });
const focusJson = { type: "object", properties: { focus: { type: "string" }, goalId: { type: "string" }, projectId: { type: "string" }, since: { type: "string", format: "date-time" }, maxTokens: { type: "integer", minimum: 200, maximum: 4000, default: 1400 } } };
const projectInput = z.object({ projectId: z.string().min(3), focus: z.string().max(1000).optional(), maxTokens: z.number().int().min(200).max(4000).default(1400) });
const projectJson = { type: "object", required: ["projectId"], properties: { projectId: { type: "string" }, focus: { type: "string" }, maxTokens: { type: "integer", minimum: 200, maximum: 4000 } } };

export const continuumTools: ContinuumTool[] = [
  tool({ name: "load_context", title: "Load relevant academic context", description: "Returns a token-budgeted pack of current goals, projects, deadlines, mastery, decisions, schedule, receipts, and semantically relevant memories. It never dumps full history.", requiredScope: "memory:read", class: "read", inputSchema: focusInput, inputJsonSchema: focusJson }),
  tool({ name: "list_projects", title: "List projects", description: "Lists accessible projects as compact IDs, titles, phases, purposes, and freshness so the user or host can choose one before loading it.", requiredScope: "research:read", class: "read", inputSchema: z.object({ status: z.string().optional(), limit: z.number().int().min(1).max(50).default(20) }), inputJsonSchema: { type: "object", properties: { status: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } } } }),
  tool({ name: "load_project", title: "Load one project", description: "Loads one user-owned project with current decisions, unresolved questions, tasks, sources, recent outcome receipts, and only relevant memory.", requiredScope: "research:read", class: "read", inputSchema: projectInput, inputJsonSchema: projectJson }),
  tool({ name: "list_goals", title: "List goals", description: "Lists active goals, deadlines, progress, and risk in compact form.", requiredScope: "goals:read", class: "read", inputSchema: z.object({ status: z.string().optional(), limit: z.number().int().min(1).max(50).default(20) }), inputJsonSchema: { type: "object", properties: { status: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } } } }),
  tool({ name: "load_goal", title: "Load one goal", description: "Returns a goal with tasks, dependencies, projects, progress, blockers, and next actions.", requiredScope: "goals:read", class: "read", inputSchema: z.object({ goalId: z.string().min(3) }), inputJsonSchema: { type: "object", required: ["goalId"], properties: { goalId: { type: "string" } } } }),
  tool({ name: "load_learning_state", title: "Load learning state", description: "Returns multidimensional mastery, evidence, misconception state, and recommended intervention for a concept or subject.", requiredScope: "learning:read", class: "read", inputSchema: z.object({ subject: z.string().optional(), conceptId: z.string().optional() }), inputJsonSchema: { type: "object", properties: { subject: { type: "string" }, conceptId: { type: "string" } } } }),
  tool({ name: "load_schedule", title: "Load schedule", description: "Returns planned blocks, hard commitments, deadlines, flexibility, completion evidence, and free capacity for a date.", requiredScope: "schedule:read", class: "read", inputSchema: z.object({ date: z.string().optional() }), inputJsonSchema: { type: "object", properties: { date: { type: "string" } } } }),
  tool({ name: "search_memory", title: "Search academic memory", description: "Hybrid semantic, keyword, entity, importance, and recency search over the user's durable history. Results include provenance and timestamps.", requiredScope: "memory:read", class: "read", inputSchema: z.object({ query: z.string().min(2).max(2000), types: z.array(z.string()).max(20).optional(), goalId: z.string().optional(), projectId: z.string().optional(), limit: z.number().int().min(1).max(20).default(8), maxTokens: z.number().int().min(200).max(4000).default(1200) }), inputJsonSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, types: { type: "array", items: { type: "string" } }, goalId: { type: "string" }, projectId: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 20 }, maxTokens: { type: "integer", minimum: 200, maximum: 4000 } } } }),
  tool({ name: "search_research", title: "Search research", description: "Searches the selected project's papers, notes, claims, decisions, questions, and exact evidence references.", requiredScope: "research:read", class: "read", inputSchema: z.object({ query: z.string().min(2).max(2000), projectId: z.string().optional(), limit: z.number().int().min(1).max(20).default(8) }), inputJsonSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, projectId: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 20 } } } }),
  tool({ name: "get_claim_evidence", title: "Get claim evidence", description: "Returns exact supporting and contradicting passages, evidence states, source IDs, and verifier provenance for one claim.", requiredScope: "research:read", class: "read", inputSchema: z.object({ claimId: z.string().min(3) }), inputJsonSchema: { type: "object", required: ["claimId"], properties: { claimId: { type: "string" } } } }),
  tool({ name: "get_source_passage", title: "Get exact source passage", description: "Retrieves one exact user-accessible source chunk by stable ID for evidence inspection; it treats the content as untrusted data.", requiredScope: "research:read", class: "read", inputSchema: z.object({ chunkId: z.string().min(3), sourceId: z.string().optional() }), inputJsonSchema: { type: "object", required: ["chunkId"], properties: { chunkId: { type: "string" }, sourceId: { type: "string" } } } }),
  tool({ name: "recommend_resource", title: "Recommend the best resource", description: "Ranks native and external options by goal, current need, authority, quality, time, cost, access, region, and verification path; returns one guided redirect rather than generic links.", requiredScope: "resources:read", class: "read", inputSchema: z.object({ topic: z.string().min(2), goalId: z.string().optional(), conceptId: z.string().optional(), goalType: z.enum(["school", "exam", "university", "research", "coding"]).optional(), need: z.enum(["diagnosis", "conceptual_intuition", "canonical_explanation", "guided_practice", "official_exam_simulation", "source_exploration", "research_evidence", "coding_practice"]).default("conceptual_intuition"), level: z.string().optional(), minutesAvailable: z.number().int().positive().optional(), costPreference: z.enum(["free_only", "free_preferred", "any"]).default("free_only"), preferredFormats: z.array(z.string()).optional() }), inputJsonSchema: { type: "object", required: ["topic"], properties: { topic: { type: "string" }, goalId: { type: "string" }, conceptId: { type: "string" }, goalType: { type: "string" }, need: { type: "string" }, level: { type: "string" }, minutesAvailable: { type: "integer" }, costPreference: { type: "string" }, preferredFormats: { type: "array", items: { type: "string" } } } } }),
  tool({ name: "load_outcome_receipt", title: "Load outcome receipt", description: "Loads the latest or selected compact session receipt: completed work, decisions, learning evidence, unresolved questions, and next actions.", requiredScope: "memory:read", class: "read", inputSchema: z.object({ receiptId: z.string().optional(), limit: z.number().int().min(1).max(20).default(1) }), inputJsonSchema: { type: "object", properties: { receiptId: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 20 } } } }),
  tool({ name: "sync_session", title: "Sync completed assistant work", description: "Writes a concise outcome receipt for work completed in this host. Auto mode accepts only low-impact checkpoint facts; consequential changes remain proposals.", requiredScope: "memory:write", class: "write", inputSchema: sessionSyncSchema, inputJsonSchema: { type: "object", required: ["sessionId", "summary"], properties: { sessionId: { type: "string" }, goalId: { type: "string" }, projectId: { type: "string" }, summary: { type: "string" }, completed: { type: "array", items: { type: "string" } }, decisions: { type: "array", items: { type: "string" } }, conceptsLearned: { type: "array", items: { type: "string" } }, misconceptions: { type: "array", items: { type: "string" } }, unresolvedQuestions: { type: "array", items: { type: "string" } }, nextActions: { type: "array", items: { type: "string" } }, evidenceIds: { type: "array", items: { type: "string" } }, mode: { type: "string", enum: ["propose", "auto_low_impact"] } } } }),
  tool({ name: "record_progress", title: "Record progress", description: "Appends a low-impact progress checkpoint with optional evidence. MCP clients cannot mark a task done; completion is a reviewed proposal or a user action in Continuum.", requiredScope: "memory:write", class: "write", inputSchema: z.object({ entityId: z.string().min(3), status: z.enum(["backlog", "planned", "in_progress", "blocked"]), evidence: z.string().max(5000).optional(), goalId: z.string().optional(), projectId: z.string().optional() }), inputJsonSchema: { type: "object", required: ["entityId", "status"], properties: { entityId: { type: "string" }, status: { type: "string", enum: ["backlog", "planned", "in_progress", "blocked"] }, evidence: { type: "string", maxLength: 5000 }, goalId: { type: "string" }, projectId: { type: "string" } } } }),
  tool({ name: "save_artifact", title: "Save artifact metadata", description: "Records an artifact produced by the user or assistant and links it to a project; generated work remains labeled by origin.", requiredScope: "research:write", class: "write", inputSchema: z.object({ projectId: z.string().min(3), title: z.string().min(1), kind: z.string().min(1), uri: z.string().optional(), metadata: z.record(z.string(), z.unknown()).default({}) }), inputJsonSchema: { type: "object", required: ["projectId", "title", "kind"], properties: { projectId: { type: "string" }, title: { type: "string" }, kind: { type: "string" }, uri: { type: "string" }, metadata: { type: "object" } } } }),
  tool({ name: "save_research_note", title: "Save research note", description: "Creates a project note linked to an optional exact source passage and labels its creator.", requiredScope: "research:write", class: "write", inputSchema: z.object({ projectId: z.string().min(3), text: z.string().min(1).max(20_000), sourceId: z.string().optional(), chunkId: z.string().optional() }), inputJsonSchema: { type: "object", required: ["projectId", "text"], properties: { projectId: { type: "string" }, text: { type: "string" }, sourceId: { type: "string" }, chunkId: { type: "string" } } } }),
  tool({
    name: "save_research_claim",
    title: "Save evidence-linked research claim",
    description: "Saves an assistant-authored claim as unverified and links exact user-owned source passages. It cannot label evidence as direct support without a separate review workflow.",
    requiredScope: "research:write",
    class: "write",
    inputSchema: z.object({
      projectId: z.string().min(3),
      text: z.string().min(1).max(20_000),
      evidence: z.array(z.object({
        sourceId: z.string().min(3),
        chunkId: z.string().min(3),
        status: z.enum(["indirect_support", "model_inference", "user_hypothesis", "unverified"]),
      })).max(30).default([]),
    }),
    inputJsonSchema: {
      type: "object",
      required: ["projectId", "text"],
      properties: {
        projectId: { type: "string" },
        text: { type: "string" },
        evidence: {
          type: "array",
          maxItems: 30,
          items: {
            type: "object",
            required: ["sourceId", "chunkId", "status"],
            properties: {
              sourceId: { type: "string" },
              chunkId: { type: "string" },
              status: { type: "string", enum: ["indirect_support", "model_inference", "user_hypothesis", "unverified"] },
            },
          },
        },
      },
    },
  }),
  tool({ name: "save_decision", title: "Save accepted research decision", description: "Standalone-only action for a decision the signed-in user explicitly accepted. Remote assistants use a project proposal instead.", requiredScope: "research:write", class: "write", inputSchema: z.object({ projectId: z.string().min(3), text: z.string().min(1), reasoning: z.string().min(1), sourceIds: z.array(z.string()).default([]), supersedesId: z.string().optional(), userApproved: z.literal(true) }), inputJsonSchema: { type: "object", required: ["projectId", "text", "reasoning", "userApproved"], properties: { projectId: { type: "string" }, text: { type: "string" }, reasoning: { type: "string" }, sourceIds: { type: "array", items: { type: "string" } }, supersedesId: { type: "string" }, userApproved: { type: "boolean", const: true } } }, remoteAccessible: false }),
  tool({ name: "record_learning_evidence", title: "Record learning evidence", description: "Stores a real assessment attempt. Transfer can change only for an unseen assessment, never because content was merely read.", requiredScope: "learning:write", class: "write", inputSchema: z.object({ conceptId: z.string().min(3), attemptId: z.string().min(3), correct: z.boolean(), unseen: z.boolean(), answer: z.string().optional(), sourceActivityId: z.string().optional() }), inputJsonSchema: { type: "object", required: ["conceptId", "attemptId", "correct", "unseen"], properties: { conceptId: { type: "string" }, attemptId: { type: "string" }, correct: { type: "boolean" }, unseen: { type: "boolean" }, answer: { type: "string" }, sourceActivityId: { type: "string" } } } }),
  tool({ name: "propose_goal_change", title: "Propose goal creation or change", description: "Creates an expiring proposal to create a goal or change an existing goal without applying it. Omit entityId only for creation.", requiredScope: "goals:write", class: "propose", inputSchema: z.object({ entityId: z.string().min(3).optional(), summary: z.string().min(3), changes: z.record(z.string(), z.unknown()) }), inputJsonSchema: { type: "object", required: ["summary", "changes"], properties: { entityId: { type: "string" }, summary: { type: "string" }, changes: { type: "object" } } }, confirmationRequired: true }),
  tool({ name: "propose_project_change", title: "Propose project creation or change", description: "Creates an expiring proposal to create a project or change its phase, blocker, or status without applying it. Omit entityId only for creation.", requiredScope: "research:write", class: "propose", inputSchema: z.object({ entityId: z.string().min(3).optional(), summary: z.string().min(3), changes: z.record(z.string(), z.unknown()) }), inputJsonSchema: { type: "object", required: ["summary", "changes"], properties: { entityId: { type: "string" }, summary: { type: "string" }, changes: { type: "object" } } }, confirmationRequired: true }),
  tool({ name: "propose_task_change", title: "Propose task change", description: "Creates an expiring proposal to create, complete, delete, or materially change a task.", requiredScope: "goals:write", class: "propose", inputSchema: z.object({ entityId: z.string().optional(), summary: z.string().min(3), changes: z.record(z.string(), z.unknown()) }), inputJsonSchema: { type: "object", required: ["summary", "changes"], properties: { entityId: { type: "string" }, summary: { type: "string" }, changes: { type: "object" } } }, confirmationRequired: true }),
  tool({ name: "propose_schedule_change", title: "Propose schedule change", description: "Runs or records a deterministic schedule proposal; it never commits an external calendar write.", requiredScope: "schedule:propose", class: "propose", inputSchema: z.object({ entityId: z.string().optional(), summary: z.string().min(3), missedBlockId: z.string().optional(), reason: z.string().min(1), changes: z.record(z.string(), z.unknown()).default({}) }), inputJsonSchema: { type: "object", required: ["summary", "reason"], properties: { entityId: { type: "string" }, summary: { type: "string" }, missedBlockId: { type: "string" }, reason: { type: "string" }, changes: { type: "object" } } }, confirmationRequired: true }),
  tool({ name: "confirm_proposal", title: "Confirm a pending proposal", description: "Standalone-only confirmation after the signed-in user reviews a proposal. It is intentionally not registered for remote assistants.", requiredScope: "memory:write", class: "write", inputSchema: z.object({ proposalId: z.string().min(3), confirmedBy: z.string().min(1), confirmedAt: z.string().datetime({ offset: true }) }), inputJsonSchema: { type: "object", required: ["proposalId", "confirmedBy", "confirmedAt"], properties: { proposalId: { type: "string" }, confirmedBy: { type: "string" }, confirmedAt: { type: "string", format: "date-time" } } }, confirmationRequired: true, remoteAccessible: false }),
  tool({ name: "commit_schedule_change", title: "Commit confirmed internal schedule change", description: "Commits a reviewed Continuum schedule proposal only with schedule:commit and explicit confirmation metadata. It does not claim an external calendar write unless a calendar adapter is connected.", requiredScope: "schedule:commit", class: "write", inputSchema: z.object({ proposalId: z.string().min(3), confirmation: z.object({ confirmedBy: z.string().min(1), confirmedAt: z.string().datetime({ offset: true }) }) }), inputJsonSchema: { type: "object", required: ["proposalId", "confirmation"], properties: { proposalId: { type: "string" }, confirmation: { type: "object", required: ["confirmedBy", "confirmedAt"], properties: { confirmedBy: { type: "string" }, confirmedAt: { type: "string", format: "date-time" } } } } }, confirmationRequired: true }),
  tool({ name: "start_resource_activity", title: "Start guided external activity", description: "Records the selected recommendation and exact guided task before the user leaves Continuum.", requiredScope: "memory:write", class: "write", inputSchema: z.object({ recommendationId: z.string().min(3), resourceId: z.string().min(3), goalId: z.string().optional(), conceptId: z.string().optional() }), inputJsonSchema: { type: "object", required: ["recommendationId", "resourceId"], properties: { recommendationId: { type: "string" }, resourceId: { type: "string" }, goalId: { type: "string" }, conceptId: { type: "string" } } } }),
  tool({ name: "complete_resource_activity", title: "Record return from external activity", description: "Marks that the user returned and attaches evidence or a score; it does not grant mastery until verification passes.", requiredScope: "memory:write", class: "write", inputSchema: z.object({ activityId: z.string().min(3), evidence: z.string().optional(), score: z.number().min(0).max(1).optional(), verificationAttemptId: z.string().optional() }), inputJsonSchema: { type: "object", required: ["activityId"], properties: { activityId: { type: "string" }, evidence: { type: "string" }, score: { type: "number" }, verificationAttemptId: { type: "string" } } } }),
  tool({ name: "route_specialist_task", title: "Route specialist task", description: "Uses the configured specialist provider policy only when the host needs bounded generation or independent verification; normal host reasoning should not be duplicated.", requiredScope: "routing:invoke", class: "invoke", inputSchema: z.object({ task: z.string().min(1).max(20_000), taskClass: z.enum(["classification", "extraction", "summarization", "lesson_generation", "quiz_generation", "misconception_diagnosis", "mathematical_reasoning", "code_reasoning", "research_synthesis", "citation_entailment", "image_understanding", "document_understanding", "plan_explanation", "conversational_support"]), evidenceRequired: z.boolean().default(false), budgetClass: z.enum(["low", "medium", "high"]).default("low"), verificationRequired: z.boolean().default(false) }), inputJsonSchema: { type: "object", required: ["task", "taskClass"], properties: { task: { type: "string" }, taskClass: { type: "string" }, evidenceRequired: { type: "boolean" }, budgetClass: { type: "string", enum: ["low", "medium", "high"] }, verificationRequired: { type: "boolean" } } } }),
];

export const continuumResources = [
  "continuum://profile",
  "continuum://goals/active",
  "continuum://projects",
  "continuum://schedule/today",
  "continuum://learning/current",
  "continuum://memory/recent",
  "continuum://receipts/latest",
];

export interface ToolContext {
  scopes: string[];
  now: string;
  read(name: string, args: Record<string, unknown>): unknown | Promise<unknown>;
  write(name: string, args: Record<string, unknown>): StoreWrite | Promise<StoreWrite>;
}

type StoreWrite = { data: unknown; entityIds: string[]; evidenceIds?: string[]; summary: string };

export async function executeTool(name: string, rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
  const selected = continuumTools.find((candidate) => candidate.name === name);
  if (!selected) throw new Error(`Unknown or disallowed tool: ${name}`);
  requireScope(context.scopes, selected.requiredScope);
  const args = selected.inputSchema.parse(rawArgs) as Record<string, unknown>;
  if (name === "commit_schedule_change") assertScheduleCommitAllowed(args.confirmation as { confirmedBy: string; confirmedAt: string } | undefined);
  const result = selected.class === "read" || selected.class === "invoke"
    ? { data: await context.read(name, args), entityIds: [] as string[], summary: `${selected.title} completed.` }
    : await context.write(name, args);
  return toolResultSchema.parse({
    summary: result.summary,
    data: result.data,
    entityIds: result.entityIds,
    freshness: context.now,
    evidenceIds: "evidenceIds" in result ? result.evidenceIds ?? [] : [],
    permission: { requiredScope: selected.requiredScope, allowed: true, confirmationRequired: Boolean(selected.confirmationRequired) },
    nextTool: name === "load_context" ? "load_project" : name === "start_resource_activity" ? "complete_resource_activity" : undefined,
  });
}
