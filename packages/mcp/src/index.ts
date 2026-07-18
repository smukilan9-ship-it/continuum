import { assertScheduleCommitAllowed, requireScope, type Scope } from "@continuum/domain";
import { toolResultSchema, type ToolResult } from "@continuum/schemas";
import { z } from "zod";

export type ToolClass = "read" | "write" | "propose";
export interface ContinuumTool {
  name: string;
  title: string;
  description: string;
  requiredScope: Scope;
  class: ToolClass;
  inputSchema: z.ZodType;
  inputJsonSchema: Record<string, unknown>;
}

const focusInput = z.object({ focus: z.string().optional(), maxTokens: z.number().int().min(100).max(4000).optional() });
const idInput = z.object({ id: z.string().min(3) });
const projectInput = z.object({ projectId: z.string().min(3) });

export const continuumTools: ContinuumTool[] = [
  { name: "get_current_context", title: "Get current academic context", description: "Returns active goals, deadlines, today's plan, blockers, decisions, learning state, and next actions.", requiredScope: "memory:read", class: "read", inputSchema: focusInput, inputJsonSchema: { type: "object", properties: { focus: { type: "string" }, maxTokens: { type: "integer", minimum: 100, maximum: 4000 } } } },
  { name: "search_academic_memory", title: "Search academic memory", description: "Searches compact, relevant academic memories without exposing unrelated projects.", requiredScope: "memory:read", class: "read", inputSchema: z.object({ query: z.string().min(1), types: z.array(z.string()).optional(), goalId: z.string().optional(), projectId: z.string().optional(), limit: z.number().int().min(1).max(20).optional() }), inputJsonSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, types: { type: "array", items: { type: "string" } }, goalId: { type: "string" }, projectId: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 20 } } } },
  { name: "get_goal_state", title: "Get goal state", description: "Returns a goal, milestone graph, risk, blockers, and next actions.", requiredScope: "goals:read", class: "read", inputSchema: z.object({ goalId: z.string().min(3) }), inputJsonSchema: { type: "object", required: ["goalId"], properties: { goalId: { type: "string" } } } },
  { name: "get_learning_state", title: "Get learning state", description: "Returns multidimensional mastery evidence and misconceptions for a topic.", requiredScope: "learning:read", class: "read", inputSchema: z.object({ subject: z.string().optional(), conceptId: z.string().optional() }), inputJsonSchema: { type: "object", properties: { subject: { type: "string" }, conceptId: { type: "string" } } } },
  { name: "get_today_plan", title: "Get today's plan", description: "Returns planned blocks, deadlines, flexibility, and remaining capacity.", requiredScope: "schedule:read", class: "read", inputSchema: z.object({ date: z.string().optional() }), inputJsonSchema: { type: "object", properties: { date: { type: "string" } } } },
  { name: "search_research_library", title: "Search research library", description: "Searches papers, notes, claims, and exact evidence passages.", requiredScope: "research:read", class: "read", inputSchema: z.object({ query: z.string().min(1), projectId: z.string().optional(), limit: z.number().int().min(1).max(20).optional() }), inputJsonSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, projectId: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 20 } } } },
  { name: "get_claim_evidence", title: "Get claim evidence", description: "Returns exact supporting or contradicting passages for one claim.", requiredScope: "research:read", class: "read", inputSchema: z.object({ claimId: z.string().min(3) }), inputJsonSchema: { type: "object", required: ["claimId"], properties: { claimId: { type: "string" } } } },
  { name: "recommend_resource", title: "Recommend a learning resource", description: "Ranks resources by goal, authority, level, cost, accessibility, and learning need.", requiredScope: "resources:read", class: "read", inputSchema: z.object({ topic: z.string().min(1), format: z.string().optional(), minutesAvailable: z.number().int().positive().optional() }), inputJsonSchema: { type: "object", required: ["topic"], properties: { topic: { type: "string" }, format: { type: "string" }, minutesAvailable: { type: "integer", minimum: 1 } } } },
  { name: "record_progress", title: "Record progress", description: "Appends a structured progress checkpoint to academic memory.", requiredScope: "memory:write", class: "write", inputSchema: z.object({ entityId: z.string().min(3), status: z.string().min(1), evidence: z.string().optional() }), inputJsonSchema: { type: "object", required: ["entityId", "status"], properties: { entityId: { type: "string" }, status: { type: "string" }, evidence: { type: "string" } } } },
  { name: "save_decision", title: "Save a research decision", description: "Stores a decision with reasoning, sources, and optional supersession.", requiredScope: "research:write", class: "write", inputSchema: z.object({ projectId: z.string(), text: z.string().min(1), reasoning: z.string().min(1), sourceIds: z.array(z.string()).default([]), supersedesId: z.string().optional() }), inputJsonSchema: { type: "object", required: ["projectId", "text", "reasoning"], properties: { projectId: { type: "string" }, text: { type: "string" }, reasoning: { type: "string" }, sourceIds: { type: "array", items: { type: "string" } }, supersedesId: { type: "string" } } } },
  { name: "save_research_note", title: "Save a research note", description: "Creates a note connected to a project and optional source passage.", requiredScope: "research:write", class: "write", inputSchema: z.object({ projectId: z.string(), text: z.string().min(1), sourceId: z.string().optional(), chunkId: z.string().optional() }), inputJsonSchema: { type: "object", required: ["projectId", "text"], properties: { projectId: { type: "string" }, text: { type: "string" }, sourceId: { type: "string" }, chunkId: { type: "string" } } } },
  { name: "create_task", title: "Create an academic task", description: "Creates a structured task connected to a goal.", requiredScope: "goals:write", class: "write", inputSchema: z.object({ goalId: z.string(), title: z.string().min(1), estimatedMinutes: z.number().int().positive(), deadline: z.string().optional(), priority: z.number().int().min(1).max(5).default(3) }), inputJsonSchema: { type: "object", required: ["goalId", "title", "estimatedMinutes"], properties: { goalId: { type: "string" }, title: { type: "string" }, estimatedMinutes: { type: "integer", minimum: 1 }, deadline: { type: "string" }, priority: { type: "integer", minimum: 1, maximum: 5 } } } },
  { name: "propose_schedule_change", title: "Propose a schedule change", description: "Returns a deterministic schedule proposal without committing any external write.", requiredScope: "schedule:propose", class: "propose", inputSchema: z.object({ missedBlockId: z.string().optional(), reason: z.string().min(1) }), inputJsonSchema: { type: "object", required: ["reason"], properties: { missedBlockId: { type: "string" }, reason: { type: "string" } } } },
  { name: "commit_schedule_change", title: "Commit a confirmed schedule change", description: "Commits an approved proposal only when explicit confirmation metadata is present.", requiredScope: "schedule:commit", class: "write", inputSchema: z.object({ proposalId: z.string(), confirmation: z.object({ confirmedBy: z.string().min(1), confirmedAt: z.string().datetime({ offset: true }) }) }), inputJsonSchema: { type: "object", required: ["proposalId", "confirmation"], properties: { proposalId: { type: "string" }, confirmation: { type: "object", required: ["confirmedBy", "confirmedAt"], properties: { confirmedBy: { type: "string" }, confirmedAt: { type: "string" } } } } } },
  { name: "update_learning_checkpoint", title: "Update a learning checkpoint", description: "Stores assessment evidence and derives a mastery update.", requiredScope: "learning:write", class: "write", inputSchema: z.object({ conceptId: z.string(), attemptId: z.string(), correct: z.boolean(), unseen: z.boolean() }), inputJsonSchema: { type: "object", required: ["conceptId", "attemptId", "correct", "unseen"], properties: { conceptId: { type: "string" }, attemptId: { type: "string" }, correct: { type: "boolean" }, unseen: { type: "boolean" } } } },
  { name: "route_specialist_task", title: "Route a specialist task", description: "Invokes a specialist only when the host needs modality, evidence verification, or domain-specific reasoning.", requiredScope: "routing:invoke", class: "propose", inputSchema: z.object({ task: z.string().min(1), taskClass: z.string(), evidenceRequired: z.boolean().default(false), budgetClass: z.enum(["low", "medium", "high"]).default("low"), verificationRequired: z.boolean().default(false) }), inputJsonSchema: { type: "object", required: ["task", "taskClass"], properties: { task: { type: "string" }, taskClass: { type: "string" }, evidenceRequired: { type: "boolean" }, budgetClass: { type: "string", enum: ["low", "medium", "high"] }, verificationRequired: { type: "boolean" } } } },
];

export const continuumResources = [
  "continuum://profile",
  "continuum://goals/active",
  "continuum://goal/goal_physics",
  "continuum://schedule/today",
  "continuum://project/project_hdab/state",
  "continuum://project/project_hdab/claims",
  "continuum://learning/physics",
  "continuum://memory/recent",
];

export interface ToolContext {
  scopes: string[];
  now: string;
  read(name: string, args: Record<string, unknown>): unknown;
  write(name: string, args: Record<string, unknown>): { data: unknown; entityIds: string[]; evidenceIds?: string[]; summary: string };
}

export function executeTool(name: string, rawArgs: unknown, context: ToolContext): ToolResult {
  const tool = continuumTools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Unknown or disallowed tool: ${name}`);
  requireScope(context.scopes, tool.requiredScope);
  const args = tool.inputSchema.parse(rawArgs) as Record<string, unknown>;
  if (name === "commit_schedule_change") {
    assertScheduleCommitAllowed(args.confirmation as { confirmedBy: string; confirmedAt: string } | undefined);
  }
  const result = tool.class === "read"
    ? { data: context.read(name, args), entityIds: [] as string[], summary: `${tool.title} completed.` }
    : context.write(name, args);

  return toolResultSchema.parse({
    summary: result.summary,
    data: result.data,
    entityIds: result.entityIds,
    freshness: context.now,
    evidenceIds: "evidenceIds" in result ? result.evidenceIds ?? [] : [],
    permission: {
      requiredScope: tool.requiredScope,
      allowed: true,
      confirmationRequired: name === "commit_schedule_change",
    },
    nextTool: name === "get_current_context" ? "get_today_plan" : undefined,
  });
}

export const unusedSchemasForDocumentation = { idInput, projectInput };
