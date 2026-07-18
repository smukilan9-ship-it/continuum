import { z } from "zod";

export const idSchema = z.string().min(3).regex(/^[a-z]+_[a-zA-Z0-9_-]+$/);
export const isoDateSchema = z.string().datetime({ offset: true });

export const evidenceStateSchema = z.enum([
  "direct_support",
  "indirect_support",
  "model_inference",
  "user_hypothesis",
  "contradicted",
  "unverified",
]);

export const curriculumNodeSchema = z.object({
  id: idSchema,
  authority: z.string().min(1),
  boardOrInstitution: z.string().min(1),
  level: z.string().min(1),
  subject: z.string().min(1),
  unit: z.string().optional(),
  topic: z.string().min(1),
  outcomes: z.array(z.string().min(1)).min(1),
  prerequisites: z.array(idSchema),
  assessmentForms: z.array(z.string().min(1)),
  sourceIds: z.array(idSchema),
  version: z.string().min(1),
  humanReviewRequired: z.boolean().default(false),
});

export const academicTaskSchema = z.object({
  id: idSchema,
  goalId: idSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["backlog", "planned", "in_progress", "blocked", "done"]),
  estimatedMinutes: z.number().int().positive(),
  uncertaintyMinutes: z.number().int().nonnegative().optional(),
  deadline: isoDateSchema.optional(),
  priority: z.number().int().min(1).max(5),
  energyRequired: z.enum(["low", "medium", "high"]),
  dependencies: z.array(idSchema),
  minimumBlockMinutes: z.number().int().positive(),
  maximumBlockMinutes: z.number().int().positive(),
  splittable: z.boolean(),
  completionEvidence: z.string().optional(),
  resourceIds: z.array(idSchema),
  reviewOfConceptId: idSchema.optional(),
}).refine((task) => task.maximumBlockMinutes >= task.minimumBlockMinutes, {
  message: "maximumBlockMinutes must be at least minimumBlockMinutes",
});

export const researchClaimSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  text: z.string().min(1),
  status: z.enum([
    "directly_supported",
    "indirectly_supported",
    "contradicted",
    "unverified",
    "user_hypothesis",
  ]),
  evidenceIds: z.array(idSchema),
  sourceIds: z.array(idSchema),
  createdBy: z.enum(["user", "assistant", "import"]),
  verificationModel: z.string().optional(),
  supersedesId: idSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const learningResourceSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  provider: z.string().min(1),
  authority: z.enum([
    "official",
    "institutional",
    "peer_reviewed",
    "expert_curated",
    "community",
    "generated",
  ]),
  cost: z.enum(["free", "paid", "subscription"]),
  level: z.array(z.string()),
  curriculumTags: z.array(z.string()),
  topicTags: z.array(z.string()),
  formats: z.array(z.string()),
  url: z.string().url(),
  embedAllowed: z.boolean(),
  deepLinkAllowed: z.boolean(),
  accessibility: z.array(z.string()).optional(),
  qualityScore: z.number().min(0).max(1),
  lastReviewedAt: isoDateSchema,
});

export const memoryEventSchema = z.object({
  id: idSchema,
  userId: idSchema,
  type: z.string().regex(/^[a-z]+(\.[a-z]+)+$/),
  goalId: idSchema.optional(),
  entityId: idSchema.optional(),
  timestamp: isoDateSchema,
  payload: z.record(z.string(), z.unknown()),
  source: z.object({
    surface: z.enum(["standalone_app", "mcp", "import", "system"]),
    model: z.string().optional(),
    sessionId: z.string().optional(),
  }),
});

export const misconceptionRecordSchema = z.object({
  id: idSchema,
  conceptId: idSchema,
  label: z.string().min(1),
  description: z.string().min(1),
  evidenceAttemptId: idSchema,
  confidence: z.number().min(0).max(1),
  status: z.enum(["suspected", "confirmed", "resolved"]),
  detectedAt: isoDateSchema,
});

export const diagnosticResultSchema = z.object({
  id: idSchema,
  assessmentId: idSchema,
  score: z.number().min(0).max(1),
  answers: z.array(z.object({
    itemId: idSchema,
    answer: z.string(),
    correct: z.boolean(),
    confidence: z.number().min(0).max(1).optional(),
  })),
  missingPrerequisites: z.array(idSchema),
  misconception: misconceptionRecordSchema.optional(),
  recommendedIntervention: z.string().min(1),
  rationale: z.string().min(1),
  createdAt: isoDateSchema,
});

export const lessonOutputSchema = z.object({
  id: idSchema,
  conceptId: idSchema,
  title: z.string().min(1),
  explanation: z.string().min(1),
  checksForUnderstanding: z.array(z.string()).min(1),
  sourceChunkIds: z.array(idSchema),
  evidenceState: evidenceStateSchema,
  promptVersion: z.string(),
  model: z.string(),
});

export const assessmentItemSchema = z.object({
  id: idSchema,
  conceptId: idSchema,
  prompt: z.string().min(1),
  answerType: z.enum(["single_choice", "number", "short_text"]),
  choices: z.array(z.string()).optional(),
  correctAnswer: z.string(),
  explanation: z.string(),
  unseen: z.boolean(),
  difficulty: z.number().min(0).max(1),
  sourceIds: z.array(idSchema),
});

export const masteryStateSchema = z.object({
  conceptId: idSchema,
  exposure: z.number().min(0).max(1),
  understanding: z.number().min(0).max(1),
  transfer: z.number().min(0).max(1),
  retention: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  status: z.enum([
    "not_started",
    "exposed",
    "understood",
    "practicing",
    "mastered",
    "decaying",
    "misconception_detected",
  ]),
  evidenceIds: z.array(idSchema),
  explanation: z.string().min(1),
  lastPracticedAt: isoDateSchema.optional(),
});

export const scheduleBlockSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  title: z.string().min(1),
  start: isoDateSchema,
  end: isoDateSchema,
  status: z.enum(["planned", "active", "missed", "done"]),
  flexible: z.boolean(),
  completionEvidenceRequired: z.boolean(),
});

export const scheduleProposalSchema = z.object({
  id: idSchema,
  timezone: z.string().min(1),
  blocks: z.array(scheduleBlockSchema),
  unscheduledTaskIds: z.array(idSchema),
  preservedBlockIds: z.array(idSchema),
  explanation: z.array(z.string()),
  requiresConfirmation: z.boolean(),
  generatedAt: isoDateSchema,
});

export const routeDecisionSchema = z.object({
  id: idSchema,
  taskClass: z.enum([
    "classification",
    "extraction",
    "summarization",
    "lesson_generation",
    "quiz_generation",
    "misconception_diagnosis",
    "mathematical_reasoning",
    "code_reasoning",
    "research_synthesis",
    "citation_entailment",
    "image_understanding",
    "document_understanding",
    "plan_explanation",
    "conversational_support",
    "schedule_optimization",
  ]),
  route: z.enum(["deterministic", "groq", "featherless", "gemini", "ai_gateway"]),
  model: z.string(),
  reason: z.string().min(1),
  sourceMode: z.enum(["none", "retrieval", "source_locked"]),
  verification: z.enum(["not_required", "pending", "independent_passed", "independent_failed"]),
  costClass: z.enum(["none", "low", "medium", "high"]),
  fallbackUsed: z.boolean(),
  createdAt: isoDateSchema,
});

export const toolResultSchema = z.object({
  summary: z.string().min(1),
  data: z.unknown(),
  entityIds: z.array(idSchema),
  freshness: isoDateSchema,
  evidenceIds: z.array(idSchema),
  permission: z.object({
    requiredScope: z.string(),
    allowed: z.boolean(),
    confirmationRequired: z.boolean(),
  }),
  nextTool: z.string().optional(),
});

export const goalInputSchema = z.object({
  title: z.string().min(3).max(120),
  targetDate: z.string().date(),
  outcome: z.string().min(3).max(500),
  currentLevel: z.string().min(1),
  weeklyHours: z.number().min(1).max(80),
  fixedCommitments: z.array(z.string()),
  preferredHelp: z.enum(["diagnostic", "tutor", "practice", "research"]),
});

export type CurriculumNode = z.infer<typeof curriculumNodeSchema>;
export type AcademicTask = z.infer<typeof academicTaskSchema>;
export type ResearchClaim = z.infer<typeof researchClaimSchema>;
export type LearningResource = z.infer<typeof learningResourceSchema>;
export type MemoryEvent = z.infer<typeof memoryEventSchema>;
export type DiagnosticResult = z.infer<typeof diagnosticResultSchema>;
export type MisconceptionRecord = z.infer<typeof misconceptionRecordSchema>;
export type LessonOutput = z.infer<typeof lessonOutputSchema>;
export type AssessmentItem = z.infer<typeof assessmentItemSchema>;
export type MasteryState = z.infer<typeof masteryStateSchema>;
export type ScheduleBlock = z.infer<typeof scheduleBlockSchema>;
export type ScheduleProposal = z.infer<typeof scheduleProposalSchema>;
export type RouteDecision = z.infer<typeof routeDecisionSchema>;
export type ToolResult = z.infer<typeof toolResultSchema>;
export type GoalInput = z.infer<typeof goalInputSchema>;

export const aiOutputSchemas = {
  diagnostic: diagnosticResultSchema,
  lesson: lessonOutputSchema,
  assessmentItem: assessmentItemSchema,
  schedule: scheduleProposalSchema,
  route: routeDecisionSchema,
  toolResult: toolResultSchema,
} as const;
