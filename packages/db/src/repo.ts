import { and, asc, cosineDistance, desc, eq, gt, ilike, inArray, isNotNull, isNull, like, lt, or, sql } from "drizzle-orm";
import type { MasteryState, MemoryEvent, OutcomeReceipt, ResourceActivity, ResourceRegistryEntry } from "@continuum/schemas";
import { getDatabase } from "./client";
import {
  auditLog,
  aiRequestLeases,
  authIdentities,
  artifacts,
  appSessions,
  calendarConstraints,
  concepts,
  claimEvidence,
  contextAccessLog,
  curricula,
  curriculumNodes,
  entitySummaries,
  goals,
  integrationTokens,
  integrations,
  learningStates,
  memoryChunks,
  memoryEvents,
  memoryProposals,
  memoryRecords,
  milestones,
  modelRoutes,
  modelUsage,
  oauthConnections,
  oauthGrants,
  papers,
  profiles,
  taskDependencies,
  projectDecisions,
  projects,
  rateLimitBuckets,
  resourceActivities,
  resourceRegistry,
  researchNotes,
  researchClaims,
  scheduleBlocks,
  sessionReceipts,
  sourceChunks,
  sources,
  syncedDocuments,
  tasks,
  userCredentials,
  users,
} from "./schema";

export const DEMO_USER_ID = "user_maya";

/**
 * Whether the built-in "Maya" acceptance fixture should be auto-seeded on the
 * first repository call. It is enabled in development (so the local MCP demo
 * token and seeded workspace work) and disabled in production by default, so a
 * real deployment is never polluted with demo goals and a demo user, and real
 * requests never pay for 13 sequential fixture inserts on a cold start.
 * `CONTINUUM_SEED_DEMO=true|false` overrides the default in either direction.
 */
function demoSeedEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.CONTINUUM_SEED_DEMO === "true") return true;
  if (env.CONTINUUM_SEED_DEMO === "false") return false;
  return env.NODE_ENV !== "production";
}

function publicSourceMetadata(source: typeof sources.$inferSelect) {
  const { storagePath, ...metadata } = source;
  void storagePath;
  return metadata;
}

export type SourceChunkWrite = {
  id: string;
  sourceId: string;
  passage: number;
  content: string;
  contentHash: string;
  embedding?: number[];
};

export type SourceWrite = {
  id: string;
  userId: string;
  projectId?: string;
  title: string;
  mimeType: string;
  storagePath?: string;
  contentHash: string;
  sourceVersion: number;
  parserVersion: string;
  chunks: SourceChunkWrite[];
};

export type PaperWrite = {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  authors: string[];
  doi?: string;
  year?: number;
};

export type StoredSourceChunk = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  passage: number;
  text: string;
  contentHash: string;
  sourceVersion: number;
  deleted: boolean;
  score?: number;
  reference: string;
};

export type StoredMemoryChunk = {
  id: string;
  kind: string;
  content: string;
  projectId?: string;
  goalId?: string;
  occurredAt: string;
  importance: number;
  tokenEstimate: number;
  sourceEventIds: string[];
  score?: number;
  metadata: Record<string, unknown>;
};

export type AuthUser = { id: string; email: string; displayName: string; timezone: string; educationLevel?: string };

export class NeonRepository {
  private readonly db = getDatabase();
  private seedPromise?: Promise<void>;

  ensureDemoSeed() {
    if (!demoSeedEnabled()) return (this.seedPromise ??= Promise.resolve());
    this.seedPromise ??= this.seedDemoData();
    return this.seedPromise;
  }

  /** Explicit, environment-independent demo seed used by `pnpm db:seed`. */
  runDemoSeed() {
    this.seedPromise ??= this.seedDemoData();
    return this.seedPromise;
  }

  private async seedDemoData() {
    await this.db.insert(users).values({ id: DEMO_USER_ID, email: "maya@continuum.demo" }).onConflictDoNothing();
    await this.db.insert(profiles).values({
      id: "profile_maya",
      userId: DEMO_USER_ID,
      displayName: "Maya Singh",
      timezone: "Asia/Kolkata",
      educationLevel: "CBSE Class 12",
      preferences: { explanationStyle: "intuition_before_derivation" },
    }).onConflictDoNothing();
    await this.db.insert(goals).values([
      {
        id: "goal_physics",
        userId: DEMO_USER_ID,
        title: "Electrostatic Potential & Capacitance",
        outcome: "Score 85%+ on the chapter assessment",
        targetDate: new Date("2026-07-19T09:00:00+05:30"),
        progress: 0.64,
        uncertainFields: ["assessmentDuration"],
      },
      {
        id: "goal_research",
        userId: DEMO_USER_ID,
        title: "Cross-marker spatial association methods paper",
        outcome: "Validate a defensible method for serial H-DAB tissue sections",
        targetDate: new Date("2026-07-23T17:00:00+05:30"),
        progress: 0.58,
      },
    ]).onConflictDoNothing();
    await this.db.insert(projects).values({
      id: "project_hdab",
      userId: DEMO_USER_ID,
      goalId: "goal_research",
      title: "Cross-marker spatial association",
      purpose: "Quantify cross-marker spatial association across serial sections.",
      phase: "Methods validation",
    }).onConflictDoNothing();
    await this.db.insert(curricula).values({
      id: "curriculum_cbse_physics",
      authority: "CBSE",
      title: "Class 12 Physics",
      sourceVersion: "2026-demo",
      humanReviewed: true,
    }).onConflictDoNothing();
    await this.db.insert(curriculumNodes).values({
      id: "node_electrostatic_potential",
      curriculumId: "curriculum_cbse_physics",
      topic: "Electrostatic Potential and Capacitance",
      outcomes: ["Distinguish electric potential from potential energy", "Apply V = kQ/r"],
      prerequisiteIds: [],
      sourceIds: ["source_physics_seed"],
    }).onConflictDoNothing();
    await this.db.insert(concepts).values({
      id: "concept_potential",
      curriculumNodeId: "node_electrostatic_potential",
      title: "Electric potential",
      description: "Potential is energy per unit charge at a point in an electric field.",
      prerequisiteIds: [],
    }).onConflictDoNothing();
    await this.db.insert(learningStates).values({
      id: "learning_maya_potential",
      userId: DEMO_USER_ID,
      conceptId: "concept_potential",
      exposure: 0.88,
      understanding: 0.52,
      transfer: 0.28,
      retention: 0.46,
      confidence: 0.74,
      status: "misconception_detected",
      evidenceIds: ["attempt_diagnostic_seed"],
      explanation: "Diagnostic evidence indicates confusion between potential and charge-dependent potential energy.",
    }).onConflictDoNothing();
  }

  async appendMemoryEvent(event: MemoryEvent, summary?: string) {
    await this.ensureDemoSeed();
    if (event.goalId) {
      const [ownedGoal] = await this.db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, event.goalId), eq(goals.userId, event.userId), eq(goals.deleted, false))).limit(1);
      if (!ownedGoal) throw new Error("Goal not found or not accessible");
    }
    await this.db.insert(memoryEvents).values({
      id: event.id,
      userId: event.userId,
      type: event.type,
      goalId: event.goalId,
      entityId: event.entityId,
      payload: summary ? { ...event.payload, summary } : event.payload,
      source: event.source,
      occurredAt: new Date(event.timestamp),
    }).onConflictDoNothing();

    const currentFilter = and(
      eq(memoryRecords.userId, event.userId),
      eq(memoryRecords.type, event.type.replace(/\.(deleted|superseded)$/, ".saved")),
      event.entityId ? eq(memoryRecords.entityId, event.entityId) : undefined,
      eq(memoryRecords.superseded, false),
    );
    await this.db.update(memoryRecords).set({ superseded: true, updatedAt: new Date() }).where(currentFilter);
    if (!event.type.endsWith(".deleted") && !event.type.endsWith(".superseded")) {
      await this.db.insert(memoryRecords).values({
        id: `record_${event.id.replace(/^event_/, "")}`,
        userId: event.userId,
        type: event.type,
        entityId: event.entityId,
        value: summary ? { ...event.payload, summary } : event.payload,
        sourceEventId: event.id,
      }).onConflictDoNothing();
    }
    return event;
  }

  async appendAudit(input: { id: string; userId: string; actor: string; action: string; entityIds: string[]; summary: string; metadata?: Record<string, unknown>; occurredAt: string }) {
    await this.ensureDemoSeed();
    await this.db.insert(auditLog).values({
      id: input.id,
      userId: input.userId,
      actor: input.actor,
      action: input.action,
      entityIds: input.entityIds,
      changeSummary: input.summary,
      metadata: input.metadata ?? {},
      occurredAt: new Date(input.occurredAt),
    }).onConflictDoNothing();
  }

  async getStateSnapshot(userId = DEMO_USER_ID) {
    await this.ensureDemoSeed();
    const [eventRows, goalRows, taskRows, projectRows, decisionRows, claimRows, noteRows, sourceRows, paperRows, masteryRows, currentMemory, receiptRows, activityRows, proposalRows, scheduleRows, routeRows] = await Promise.all([
      this.db.select().from(memoryEvents).where(eq(memoryEvents.userId, userId)).orderBy(desc(memoryEvents.occurredAt)).limit(100),
      this.db.select().from(goals).where(and(eq(goals.userId, userId), eq(goals.deleted, false))).orderBy(desc(goals.createdAt)),
      this.db.select({ task: tasks }).from(tasks).innerJoin(goals, eq(tasks.goalId, goals.id)).where(and(eq(goals.userId, userId), eq(tasks.deleted, false))).orderBy(desc(tasks.createdAt)),
      this.db.select().from(projects).where(and(eq(projects.userId, userId), eq(projects.deleted, false))).orderBy(desc(projects.updatedAt)),
      this.db.select({ decision: projectDecisions }).from(projectDecisions).innerJoin(projects, eq(projectDecisions.projectId, projects.id)).where(and(eq(projects.userId, userId), eq(projectDecisions.deleted, false))).orderBy(desc(projectDecisions.createdAt)),
      this.db.select({ claim: researchClaims }).from(researchClaims).innerJoin(projects, eq(researchClaims.projectId, projects.id)).where(and(eq(projects.userId, userId), eq(researchClaims.deleted, false))).orderBy(desc(researchClaims.createdAt)),
      this.db.select({ note: researchNotes }).from(researchNotes).innerJoin(projects, eq(researchNotes.projectId, projects.id)).where(and(eq(projects.userId, userId), eq(researchNotes.deleted, false))).orderBy(desc(researchNotes.createdAt)),
      this.db.select().from(sources).where(and(eq(sources.userId, userId), eq(sources.deleted, false))).orderBy(desc(sources.createdAt)),
      this.db.select({ paper: papers }).from(papers).innerJoin(projects, eq(papers.projectId, projects.id)).where(and(eq(projects.userId, userId), eq(papers.deleted, false))).orderBy(desc(papers.updatedAt)),
      this.db.select().from(learningStates).where(and(eq(learningStates.userId, userId), eq(learningStates.deleted, false))),
      this.db.select().from(memoryRecords).where(and(eq(memoryRecords.userId, userId), eq(memoryRecords.deleted, false), eq(memoryRecords.superseded, false))).orderBy(desc(memoryRecords.updatedAt)),
      this.db.select().from(sessionReceipts).where(eq(sessionReceipts.userId, userId)).orderBy(desc(sessionReceipts.createdAt)).limit(20),
      this.db.select().from(resourceActivities).where(eq(resourceActivities.userId, userId)).orderBy(desc(resourceActivities.startedAt)).limit(20),
      this.db.select().from(memoryProposals).where(and(eq(memoryProposals.userId, userId), or(eq(memoryProposals.status, "pending"), eq(memoryProposals.status, "confirmed")), gt(memoryProposals.expiresAt, new Date()))).orderBy(desc(memoryProposals.createdAt)),
      this.listSchedule(userId),
      this.db.select({ id: modelRoutes.id, taskClass: modelRoutes.taskClass, reason: modelRoutes.reason, verificationStatus: modelRoutes.verificationStatus, fallbackUsed: modelRoutes.fallbackUsed, createdAt: modelRoutes.createdAt }).from(modelRoutes).where(eq(modelRoutes.userId, userId)).orderBy(desc(modelRoutes.createdAt)).limit(30),
    ]);
    return {
      events: eventRows.map((event) => ({
        id: event.id,
        type: event.type,
        entityIds: event.entityId ? [event.entityId] : [],
        summary: typeof event.payload.summary === "string" ? event.payload.summary : event.type.replaceAll(".", " "),
        occurredAt: event.occurredAt.toISOString(),
      })),
      goals: goalRows,
      tasks: taskRows.map((row) => row.task),
      projects: projectRows,
      decisions: decisionRows.map((row) => row.decision),
      claims: claimRows.map((row) => row.claim),
      notes: noteRows.map((row) => row.note),
      sources: sourceRows.map(publicSourceMetadata),
      papers: paperRows.map((row) => row.paper),
      learningStates: masteryRows,
      memoryRecords: currentMemory,
      receipts: receiptRows,
      resourceActivities: activityRows,
      proposals: proposalRows,
      schedule: scheduleRows,
      modelRoutes: routeRows,
    };
  }

  async getWorkspaceSnapshot(userId: string, view: string) {
    await this.ensureDemoSeed();
    const empty = {
      events: [], goals: [], tasks: [], milestones: [], projects: [], decisions: [], claims: [], notes: [], sources: [], papers: [],
      learningStates: [], memoryRecords: [], receipts: [], resourceActivities: [], proposals: [],
      schedule: [], calendarConstraints: [], modelRoutes: [],
    };
    const userMilestones = () => this.db.select({ milestone: milestones }).from(milestones).innerJoin(goals, eq(milestones.goalId, goals.id)).where(and(eq(goals.userId, userId), eq(goals.deleted, false), eq(milestones.deleted, false))).orderBy(asc(milestones.order));
    const userGoals = () => this.db.select().from(goals).where(and(eq(goals.userId, userId), eq(goals.deleted, false))).orderBy(desc(goals.createdAt));
    const userTasks = () => this.db.select({ task: tasks }).from(tasks).innerJoin(goals, eq(tasks.goalId, goals.id)).where(and(eq(goals.userId, userId), eq(goals.deleted, false), eq(tasks.deleted, false))).orderBy(desc(tasks.createdAt));
    const userProjects = () => this.db.select().from(projects).where(and(eq(projects.userId, userId), eq(projects.deleted, false))).orderBy(desc(projects.updatedAt));
    const userReceipts = (limit = 10) => this.db.select().from(sessionReceipts).where(eq(sessionReceipts.userId, userId)).orderBy(desc(sessionReceipts.createdAt)).limit(limit);
    const userEvents = (limit = 40) => this.db.select().from(memoryEvents).where(eq(memoryEvents.userId, userId)).orderBy(desc(memoryEvents.occurredAt)).limit(limit);
    const eventView = (rows: Array<typeof memoryEvents.$inferSelect>) => rows.map((event) => ({
      id: event.id,
      type: event.type,
      entityIds: event.entityId ? [event.entityId] : [],
      summary: typeof event.payload.summary === "string" ? event.payload.summary : event.type.replaceAll(".", " "),
      occurredAt: event.occurredAt.toISOString(),
    }));

    if (view === "integrations") return empty;
    if (view === "today") {
      const [goalRows, taskRows, milestoneRows, projectRows, receiptRows, activityRows, scheduleRows, constraintRows] = await Promise.all([
        userGoals(), userTasks(), userMilestones(), userProjects(), userReceipts(4),
        this.db.select().from(resourceActivities).where(eq(resourceActivities.userId, userId)).orderBy(desc(resourceActivities.startedAt)).limit(8),
        this.listSchedule(userId),
        this.db.select().from(calendarConstraints).where(and(eq(calendarConstraints.userId, userId), eq(calendarConstraints.deleted, false), gt(calendarConstraints.endsAt, new Date(Date.now() - 24 * 3600_000)))).orderBy(asc(calendarConstraints.startsAt)).limit(100),
      ]);
      return { ...empty, goals: goalRows, tasks: taskRows.map(({ task }) => task), milestones: milestoneRows.map(({ milestone }) => milestone), projects: projectRows, receipts: receiptRows, resourceActivities: activityRows, schedule: scheduleRows, calendarConstraints: constraintRows };
    }
    if (view === "goals") {
      const [goalRows, taskRows, milestoneRows, scheduleRows, constraintRows] = await Promise.all([
        userGoals(), userTasks(), userMilestones(), this.listSchedule(userId),
        this.db.select().from(calendarConstraints).where(and(eq(calendarConstraints.userId, userId), eq(calendarConstraints.deleted, false), gt(calendarConstraints.endsAt, new Date(Date.now() - 24 * 3600_000)))).orderBy(asc(calendarConstraints.startsAt)).limit(100),
      ]);
      return { ...empty, goals: goalRows, tasks: taskRows.map(({ task }) => task), milestones: milestoneRows.map(({ milestone }) => milestone), schedule: scheduleRows, calendarConstraints: constraintRows };
    }
    if (view === "learn") {
      const [goalRows, taskRows, masteryRows, activityRows, receiptRows] = await Promise.all([
        userGoals(), userTasks(),
        this.db.select().from(learningStates).where(and(eq(learningStates.userId, userId), eq(learningStates.deleted, false))),
        this.db.select().from(resourceActivities).where(eq(resourceActivities.userId, userId)).orderBy(desc(resourceActivities.startedAt)).limit(20),
        userReceipts(5),
      ]);
      return { ...empty, goals: goalRows, tasks: taskRows.map(({ task }) => task), learningStates: masteryRows, resourceActivities: activityRows, receipts: receiptRows };
    }
    if (view === "research") {
      const [goalRows, taskRows, projectRows, decisionRows, claimRows, noteRows, sourceRows, paperRows] = await Promise.all([
        userGoals(), userTasks(), userProjects(),
        this.db.select({ decision: projectDecisions }).from(projectDecisions).innerJoin(projects, eq(projectDecisions.projectId, projects.id)).where(and(eq(projects.userId, userId), eq(projectDecisions.deleted, false))).orderBy(desc(projectDecisions.createdAt)),
        this.db.select({ claim: researchClaims }).from(researchClaims).innerJoin(projects, eq(researchClaims.projectId, projects.id)).where(and(eq(projects.userId, userId), eq(researchClaims.deleted, false))).orderBy(desc(researchClaims.createdAt)),
        this.db.select({ note: researchNotes }).from(researchNotes).innerJoin(projects, eq(researchNotes.projectId, projects.id)).where(and(eq(projects.userId, userId), eq(researchNotes.deleted, false))).orderBy(desc(researchNotes.createdAt)),
        this.db.select().from(sources).where(and(eq(sources.userId, userId), eq(sources.deleted, false))).orderBy(desc(sources.createdAt)),
        this.db.select({ paper: papers }).from(papers).innerJoin(projects, eq(papers.projectId, projects.id)).where(and(eq(projects.userId, userId), eq(papers.deleted, false))).orderBy(desc(papers.updatedAt)),
      ]);
      return { ...empty, goals: goalRows, tasks: taskRows.map(({ task }) => task), projects: projectRows, decisions: decisionRows.map(({ decision }) => decision), claims: claimRows.map(({ claim }) => claim), notes: noteRows.map(({ note }) => note), sources: sourceRows.map(publicSourceMetadata), papers: paperRows.map(({ paper }) => paper) };
    }
    if (view === "memory") {
      const [goalRows, taskRows, projectRows, decisionRows, claimRows, noteRows, masteryRows, memoryRows, receiptRows, eventRows, sourceRows, paperRows, scheduleRows] = await Promise.all([
        userGoals(), userTasks(), userProjects(),
        this.db.select({ decision: projectDecisions }).from(projectDecisions).innerJoin(projects, eq(projectDecisions.projectId, projects.id)).where(and(eq(projects.userId, userId), eq(projectDecisions.deleted, false))).orderBy(desc(projectDecisions.createdAt)),
        this.db.select({ claim: researchClaims }).from(researchClaims).innerJoin(projects, eq(researchClaims.projectId, projects.id)).where(and(eq(projects.userId, userId), eq(researchClaims.deleted, false))).orderBy(desc(researchClaims.createdAt)),
        this.db.select({ note: researchNotes }).from(researchNotes).innerJoin(projects, eq(researchNotes.projectId, projects.id)).where(and(eq(projects.userId, userId), eq(researchNotes.deleted, false))).orderBy(desc(researchNotes.createdAt)),
        this.db.select().from(learningStates).where(and(eq(learningStates.userId, userId), eq(learningStates.deleted, false))),
        this.db.select().from(memoryRecords).where(and(eq(memoryRecords.userId, userId), eq(memoryRecords.deleted, false), eq(memoryRecords.superseded, false))).orderBy(desc(memoryRecords.updatedAt)).limit(100),
        userReceipts(20), userEvents(30),
        this.db.select().from(sources).where(and(eq(sources.userId, userId), eq(sources.deleted, false))).orderBy(desc(sources.createdAt)).limit(100),
        this.db.select({ paper: papers }).from(papers).innerJoin(projects, eq(papers.projectId, projects.id)).where(and(eq(projects.userId, userId), eq(papers.deleted, false))).orderBy(desc(papers.updatedAt)),
        this.listSchedule(userId),
      ]);
      return { ...empty, goals: goalRows, tasks: taskRows.map(({ task }) => task), projects: projectRows, decisions: decisionRows.map(({ decision }) => decision), claims: claimRows.map(({ claim }) => claim), notes: noteRows.map(({ note }) => note), learningStates: masteryRows, memoryRecords: memoryRows, receipts: receiptRows, events: eventView(eventRows), sources: sourceRows.map(publicSourceMetadata), papers: paperRows.map(({ paper }) => paper), schedule: scheduleRows };
    }
    if (view === "activity") {
      const [proposalRows, routeRows, eventRows] = await Promise.all([
        this.db.select().from(memoryProposals).where(and(eq(memoryProposals.userId, userId), or(eq(memoryProposals.status, "pending"), eq(memoryProposals.status, "confirmed")), gt(memoryProposals.expiresAt, new Date()))).orderBy(desc(memoryProposals.createdAt)),
        this.db.select({ id: modelRoutes.id, taskClass: modelRoutes.taskClass, reason: modelRoutes.reason, verificationStatus: modelRoutes.verificationStatus, fallbackUsed: modelRoutes.fallbackUsed, createdAt: modelRoutes.createdAt }).from(modelRoutes).where(eq(modelRoutes.userId, userId)).orderBy(desc(modelRoutes.createdAt)).limit(30),
        userEvents(50),
      ]);
      return { ...empty, proposals: proposalRows, modelRoutes: routeRows, events: eventView(eventRows) };
    }
    if (view === "code") {
      const [goalRows, taskRows, projectRows, masteryRows, receiptRows] = await Promise.all([
        userGoals(), userTasks(), userProjects(),
        this.db.select().from(learningStates).where(and(eq(learningStates.userId, userId), eq(learningStates.deleted, false))),
        userReceipts(5),
      ]);
      return { ...empty, goals: goalRows, tasks: taskRows.map(({ task }) => task), projects: projectRows, learningStates: masteryRows, receipts: receiptRows };
    }
    return empty;
  }

  async listSchedule(userId = DEMO_USER_ID, from?: string, to?: string) {
    const lowerBound = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 3600_000);
    const upperBound = to ? new Date(to) : new Date(Date.now() + 180 * 24 * 3600_000);
    if (Number.isNaN(lowerBound.valueOf()) || Number.isNaN(upperBound.valueOf()) || lowerBound >= upperBound) throw new Error("Invalid schedule range");
    const rows = await this.db.select({ block: scheduleBlocks, task: tasks, goal: goals })
      .from(scheduleBlocks)
      .innerJoin(tasks, eq(scheduleBlocks.taskId, tasks.id))
      .innerJoin(goals, eq(tasks.goalId, goals.id))
      .where(and(
        eq(goals.userId, userId),
        eq(goals.deleted, false),
        eq(tasks.deleted, false),
        eq(scheduleBlocks.deleted, false),
        gt(scheduleBlocks.endsAt, lowerBound),
        lt(scheduleBlocks.startsAt, upperBound),
      ))
      .orderBy(asc(scheduleBlocks.startsAt))
      .limit(250);
    return rows.map(({ block, task, goal }) => ({
      id: block.id,
      taskId: task.id,
      goalId: goal.id,
      goalTitle: goal.title,
      title: task.title,
      description: task.description,
      start: block.startsAt.toISOString(),
      end: block.endsAt.toISOString(),
      status: block.status,
      priority: task.priority,
      completionEvidence: task.completionEvidence,
      proposalId: block.proposalId,
      committedAt: block.committedAt?.toISOString(),
      updatedAt: block.updatedAt.toISOString(),
    }));
  }

  async createTask(input: Record<string, unknown>, id: string, now: string, userId = DEMO_USER_ID) {
    await this.ensureDemoSeed();
    const [ownedGoal] = await this.db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, String(input.goalId)), eq(goals.userId, userId), eq(goals.deleted, false))).limit(1);
    if (!ownedGoal) throw new Error("Goal not found for this user");
    const estimatedMinutes = Number(input.estimatedMinutes);
    const priority = Number(input.priority ?? 3);
    if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 5 || estimatedMinutes > 1440) throw new Error("Estimated minutes must be an integer between 5 and 1440");
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) throw new Error("Priority must be an integer between 1 and 5");
    const deadline = input.deadline ? new Date(String(input.deadline)) : undefined;
    if (deadline && Number.isNaN(deadline.valueOf())) throw new Error("Task deadline is invalid");
    const energyRequired = ["low", "medium", "high"].includes(String(input.energyRequired)) ? String(input.energyRequired) : "medium";
    const dependsOn = Array.isArray(input.dependsOn) ? input.dependsOn.map(String).filter(Boolean) : [];
    await this.db.insert(tasks).values({
      id,
      goalId: String(input.goalId),
      title: String(input.title),
      description: input.description ? String(input.description) : undefined,
      status: "backlog",
      estimatedMinutes,
      deadline,
      priority,
      energyRequired,
      completionEvidence: input.completionEvidence ? String(input.completionEvidence) : undefined,
      generatedBy: input.generatedBy ? String(input.generatedBy) : "mcp",
      promptVersion: "mcp-v1",
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
    if (dependsOn.length) {
      // Only persist dependencies on tasks that belong to the same owned goal.
      const owned = await this.db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.goalId, String(input.goalId)), inArray(tasks.id, dependsOn)));
      const validIds = new Set(owned.map((row) => row.id));
      const rows = dependsOn.filter((dependencyId) => validIds.has(dependencyId)).map((dependencyId) => ({ id: `dep_${id.replace(/^task_/, "")}_${dependencyId.replace(/^task_/, "").slice(0, 8)}`, taskId: id, dependsOnTaskId: dependencyId, createdAt: new Date(now), updatedAt: new Date(now) }));
      if (rows.length) await this.db.insert(taskDependencies).values(rows);
    }
  }

  async createMilestone(input: { id: string; goalId: string; title: string; order: number; dueAt?: string }, now: string, userId = DEMO_USER_ID) {
    const [ownedGoal] = await this.db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, input.goalId), eq(goals.userId, userId), eq(goals.deleted, false))).limit(1);
    if (!ownedGoal) throw new Error("Goal not found for this user");
    await this.db.insert(milestones).values({
      id: input.id,
      goalId: input.goalId,
      title: input.title,
      order: input.order,
      status: "upcoming",
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  }

  async listMilestones(userId: string, goalId?: string) {
    const conditions = [eq(goals.userId, userId), eq(milestones.deleted, false), eq(goals.deleted, false)];
    if (goalId) conditions.push(eq(milestones.goalId, goalId));
    return this.db.select({ milestone: milestones }).from(milestones).innerJoin(goals, eq(milestones.goalId, goals.id)).where(and(...conditions)).orderBy(asc(milestones.order)).then((rows) => rows.map(({ milestone }) => milestone));
  }

  async listTaskDependencies(userId: string) {
    return this.db.select({ taskId: taskDependencies.taskId, dependsOnTaskId: taskDependencies.dependsOnTaskId }).from(taskDependencies).innerJoin(tasks, eq(taskDependencies.taskId, tasks.id)).innerJoin(goals, eq(tasks.goalId, goals.id)).where(and(eq(goals.userId, userId), eq(taskDependencies.deleted, false)));
  }

  async saveOnboardingIntake(userId: string, educationLevel: string, intake: Record<string, unknown>, now: string) {
    const [profile] = await this.db.select({ id: profiles.id, preferences: profiles.preferences }).from(profiles).where(and(eq(profiles.userId, userId), eq(profiles.deleted, false))).limit(1);
    if (!profile) throw new Error("Profile not found for this user");
    await this.db.update(profiles).set({ educationLevel, preferences: { ...(profile.preferences ?? {}), onboarding: intake }, updatedAt: new Date(now) }).where(eq(profiles.id, profile.id));
  }

  async createGoal(input: Record<string, unknown>, id: string, now: string, userId = DEMO_USER_ID) {
    await this.ensureDemoSeed();
    const target = String(input.date ?? input.targetDate ?? "");
    const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(target) ? new Date(`${target}T23:59:00Z`) : new Date(target);
    if (Number.isNaN(targetDate.valueOf())) throw new Error("A valid target date is required");
    await this.db.insert(goals).values({
      id,
      userId,
      title: String(input.title),
      outcome: String(input.outcome),
      targetDate,
      progress: 0,
      uncertainFields: ["milestones", "initialTaskEstimates"],
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  }

  async createResourceFollowup(input: { id: string; blockId: string; userId: string; goalId: string; title: string; evidence: string; startsAt: string; minutes: number; sourceActivityId: string }) {
    const startsAt = new Date(input.startsAt);
    const minutes = Math.max(5, Math.min(240, Math.round(input.minutes)));
    if (Number.isNaN(startsAt.valueOf())) throw new Error("A valid follow-up time is required");
    return this.db.transaction(async (tx) => {
      const [ownedGoal] = await tx.select({ id: goals.id }).from(goals).where(and(eq(goals.id, input.goalId), eq(goals.userId, input.userId), eq(goals.deleted, false))).limit(1);
      if (!ownedGoal) throw new Error("Goal not found or not accessible");
      const [task] = await tx.insert(tasks).values({
        id: input.id,
        goalId: input.goalId,
        title: input.title,
        description: `Spaced follow-up generated after verified resource activity ${input.sourceActivityId}.`,
        status: "planned",
        estimatedMinutes: minutes,
        deadline: startsAt,
        priority: 4,
        energyRequired: "medium",
        completionEvidence: input.evidence,
        generatedBy: "resource_verification",
        promptVersion: "resource-followup-v1",
      }).returning();
      const [block] = await tx.insert(scheduleBlocks).values({
        id: input.blockId,
        taskId: input.id,
        startsAt,
        endsAt: new Date(startsAt.valueOf() + minutes * 60_000),
        status: "planned",
        proposalId: `resource_${input.sourceActivityId}`,
        committedAt: new Date(),
      }).returning();
      return { task, block };
    });
  }

  async createProject(input: Record<string, unknown>, id: string, now: string, userId = DEMO_USER_ID) {
    await this.ensureDemoSeed();
    const goalId = input.goalId ? String(input.goalId) : undefined;
    if (goalId) {
      const [ownedGoal] = await this.db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, goalId), eq(goals.userId, userId), eq(goals.deleted, false))).limit(1);
      if (!ownedGoal) throw new Error("Goal not found for this user");
    }
    await this.db.insert(projects).values({
      id,
      userId,
      goalId,
      title: String(input.title),
      purpose: String(input.purpose),
      phase: String(input.phase ?? "Discovery"),
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  }

  async saveDecision(input: Record<string, unknown>, id: string, now: string, userId = DEMO_USER_ID) {
    await this.ensureDemoSeed();
    const [ownedProject] = await this.db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, String(input.projectId)), eq(projects.userId, userId), eq(projects.deleted, false))).limit(1);
    if (!ownedProject) throw new Error("Project not found for this user");
    const sourceIds = Array.isArray(input.sourceIds) ? input.sourceIds.map(String) : [];
    for (const sourceId of sourceIds) {
      const [ownedSource] = await this.db.select({ id: sources.id }).from(sources).where(and(eq(sources.id, sourceId), eq(sources.userId, userId), eq(sources.deleted, false), or(eq(sources.projectId, ownedProject.id), isNull(sources.projectId)))).limit(1);
      if (!ownedSource) throw new Error(`Source ${sourceId} was not found or is not accessible from this project`);
    }
    const supersedesId = input.supersedesId ? String(input.supersedesId) : undefined;
    if (supersedesId) {
      const rows = await this.db.update(projectDecisions).set({ status: "superseded", updatedAt: new Date(now) }).where(and(eq(projectDecisions.id, supersedesId), eq(projectDecisions.projectId, ownedProject.id), eq(projectDecisions.deleted, false))).returning({ id: projectDecisions.id });
      if (!rows.length) throw new Error("Superseded decision was not found in this project");
    }
    await this.db.insert(projectDecisions).values({
      id,
      projectId: String(input.projectId),
      text: String(input.text),
      reasoning: String(input.reasoning),
      status: "accepted",
      sourceIds,
      supersedesId,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  }

  async saveResearchNote(input: Record<string, unknown>, id: string, now: string, userId = DEMO_USER_ID) {
    await this.ensureDemoSeed();
    const [ownedProject] = await this.db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, String(input.projectId)), eq(projects.userId, userId), eq(projects.deleted, false))).limit(1);
    if (!ownedProject) throw new Error("Project not found for this user");
    const sourceId = input.sourceId ? String(input.sourceId) : undefined;
    const chunkId = input.chunkId ? String(input.chunkId) : undefined;
    if (sourceId) {
      const [ownedSource] = await this.db.select({ id: sources.id }).from(sources).where(and(eq(sources.id, sourceId), eq(sources.userId, userId), eq(sources.deleted, false), or(eq(sources.projectId, ownedProject.id), isNull(sources.projectId)))).limit(1);
      if (!ownedSource) throw new Error("Source not found or not accessible from this project");
    }
    if (chunkId) {
      const [ownedChunk] = await this.db.select({ id: sourceChunks.id, sourceId: sourceChunks.sourceId }).from(sourceChunks).innerJoin(sources, eq(sourceChunks.sourceId, sources.id)).where(and(eq(sourceChunks.id, chunkId), eq(sources.userId, userId), eq(sources.deleted, false), eq(sourceChunks.deleted, false))).limit(1);
      if (!ownedChunk || (sourceId && ownedChunk.sourceId !== sourceId)) throw new Error("Passage not found or not accessible");
    }
    await this.db.insert(researchNotes).values({
      id,
      projectId: String(input.projectId),
      sourceId,
      chunkId,
      text: String(input.text),
      createdBy: "mcp",
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  }

  async saveResearchClaim(input: { id: string; userId: string; projectId: string; text: string; evidence: Array<{ id: string; sourceId: string; chunkId: string; status: "indirect_support" | "model_inference" | "user_hypothesis" | "unverified" }> }) {
    await this.db.transaction(async (tx) => {
      const [ownedProject] = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.userId, input.userId), eq(projects.deleted, false))).limit(1);
      if (!ownedProject) throw new Error("Project not found or not accessible");
      for (const item of input.evidence) {
        const [ownedPassage] = await tx.select({ sourceId: sourceChunks.sourceId }).from(sourceChunks).innerJoin(sources, eq(sourceChunks.sourceId, sources.id)).where(and(eq(sourceChunks.id, item.chunkId), eq(sourceChunks.sourceId, item.sourceId), eq(sources.userId, input.userId), eq(sources.deleted, false), eq(sourceChunks.deleted, false), or(eq(sources.projectId, input.projectId), isNull(sources.projectId)))).limit(1);
        if (!ownedPassage) throw new Error(`Evidence passage ${item.chunkId} was not found or is not accessible from this project`);
      }
      await tx.insert(researchClaims).values({ id: input.id, projectId: input.projectId, text: input.text, status: "unverified", createdBy: "assistant", verificationModel: null });
      if (input.evidence.length) await tx.insert(claimEvidence).values(input.evidence.map((item) => ({ id: item.id, claimId: input.id, sourceId: item.sourceId, chunkId: item.chunkId, status: item.status })));
    });
  }

  async getLearningState(userId = DEMO_USER_ID, conceptId = "concept_potential"): Promise<MasteryState | undefined> {
    await this.ensureDemoSeed();
    const [row] = await this.db.select().from(learningStates).where(and(eq(learningStates.userId, userId), eq(learningStates.conceptId, conceptId), eq(learningStates.deleted, false))).limit(1);
    if (!row) return undefined;
    return {
      conceptId: row.conceptId,
      exposure: row.exposure,
      understanding: row.understanding,
      transfer: row.transfer,
      retention: row.retention,
      confidence: row.confidence,
      status: row.status as MasteryState["status"],
      evidenceIds: row.evidenceIds,
      explanation: row.explanation,
      ...(row.lastPracticedAt ? { lastPracticedAt: row.lastPracticedAt.toISOString() } : {}),
    };
  }

  async saveLearningState(state: MasteryState, userId = DEMO_USER_ID) {
    await this.ensureDemoSeed();
    const values = {
      id: `learning_${userId.replace(/^user_/, "")}_${state.conceptId.replace(/^concept_/, "")}`,
      userId,
      conceptId: state.conceptId,
      exposure: state.exposure,
      understanding: state.understanding,
      transfer: state.transfer,
      retention: state.retention,
      confidence: state.confidence,
      status: state.status,
      evidenceIds: state.evidenceIds,
      explanation: state.explanation,
      lastPracticedAt: state.lastPracticedAt ? new Date(state.lastPracticedAt) : null,
      updatedAt: new Date(),
      deleted: false,
    };
    await this.db.insert(learningStates).values(values).onConflictDoUpdate({
      target: [learningStates.userId, learningStates.conceptId],
      set: values,
    });
  }

  async ensureConcept(id: string, title: string) {
    await this.db.insert(concepts).values({ id, title, description: `User-scoped learning concept for ${title}.`, prerequisiteIds: [] }).onConflictDoNothing();
    return id;
  }

  async findSourceByHash(contentHash: string, userId = DEMO_USER_ID) {
    await this.ensureDemoSeed();
    const [row] = await this.db.select().from(sources).where(and(eq(sources.userId, userId), eq(sources.contentHash, contentHash), eq(sources.deleted, false))).limit(1);
    return row;
  }

  async saveSource(input: SourceWrite) {
    await this.ensureDemoSeed();
    if (input.projectId) {
      const [ownedProject] = await this.db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.userId, input.userId), eq(projects.deleted, false))).limit(1);
      if (!ownedProject) throw new Error("Project not found or not accessible");
    }
    const sourceValues = {
      id: input.id,
      userId: input.userId,
      projectId: input.projectId,
      title: input.title,
      mimeType: input.mimeType,
      storagePath: input.storagePath,
      contentHash: input.contentHash,
      sourceVersion: input.sourceVersion,
      parserVersion: input.parserVersion,
      deleted: false,
      updatedAt: new Date(),
    };
    await this.db.insert(sources).values(sourceValues).onConflictDoUpdate({ target: sources.id, set: sourceValues });
    if (input.chunks.length) {
      for (const chunk of input.chunks) {
        const chunkValues = {
          id: chunk.id,
        sourceId: chunk.sourceId,
        passage: chunk.passage,
        content: chunk.content,
        contentHash: chunk.contentHash,
          embedding: chunk.embedding,
          deleted: false,
          updatedAt: new Date(),
        };
        await this.db.insert(sourceChunks).values(chunkValues).onConflictDoUpdate({ target: sourceChunks.id, set: chunkValues });
      }
    }
  }

  async listSources(userId = DEMO_USER_ID) {
    await this.ensureDemoSeed();
    const rows = await this.db.select().from(sources).where(and(eq(sources.userId, userId), eq(sources.deleted, false))).orderBy(desc(sources.createdAt));
    return rows.map(publicSourceMetadata);
  }

  async softDeleteSource(sourceId: string, userId = DEMO_USER_ID) {
    await this.ensureDemoSeed();
    const [source] = await this.db.select().from(sources).where(and(eq(sources.id, sourceId), eq(sources.userId, userId), eq(sources.deleted, false))).limit(1);
    if (!source) return undefined;
    await this.db.update(sources).set({ deleted: true, updatedAt: new Date() }).where(eq(sources.id, sourceId));
    await this.db.update(sourceChunks).set({ deleted: true, updatedAt: new Date() }).where(eq(sourceChunks.sourceId, sourceId));
    return source;
  }

  async listSourceChunks(userId = DEMO_USER_ID): Promise<StoredSourceChunk[]> {
    await this.ensureDemoSeed();
    const rows = await this.db.select({ chunk: sourceChunks, source: sources }).from(sourceChunks).innerJoin(sources, eq(sourceChunks.sourceId, sources.id)).where(and(eq(sources.userId, userId), eq(sources.deleted, false), eq(sourceChunks.deleted, false))).orderBy(asc(sourceChunks.sourceId), asc(sourceChunks.passage));
    return rows.map(({ chunk, source }) => ({
      id: chunk.id,
      sourceId: source.id,
      sourceTitle: source.title,
      passage: chunk.passage,
      text: chunk.content,
      contentHash: chunk.contentHash,
      sourceVersion: source.sourceVersion,
      deleted: false,
      reference: `${source.title} · passage ${chunk.passage}`,
    }));
  }

  async vectorSearch(embedding: number[], limit = 4, userId = DEMO_USER_ID): Promise<StoredSourceChunk[]> {
    await this.ensureDemoSeed();
    const distance = cosineDistance(sourceChunks.embedding, embedding);
    const rows = await this.db.select({ chunk: sourceChunks, source: sources, distance }).from(sourceChunks).innerJoin(sources, eq(sourceChunks.sourceId, sources.id)).where(and(eq(sources.userId, userId), eq(sources.deleted, false), eq(sourceChunks.deleted, false), isNotNull(sourceChunks.embedding))).orderBy(asc(distance)).limit(Math.max(1, Math.min(limit, 10)));
    return rows.map(({ chunk, source, distance: value }) => ({
      id: chunk.id,
      sourceId: source.id,
      sourceTitle: source.title,
      passage: chunk.passage,
      text: chunk.content,
      contentHash: chunk.contentHash,
      sourceVersion: source.sourceVersion,
      deleted: false,
      score: 1 - Number(value),
      reference: `${source.title} · passage ${chunk.passage}`,
    }));
  }

  async listProjects(userId = DEMO_USER_ID) {
    await this.ensureDemoSeed();
    return this.db.select().from(projects).where(and(eq(projects.userId, userId), eq(projects.deleted, false))).orderBy(desc(projects.updatedAt));
  }

  async getProject(projectId: string, userId = DEMO_USER_ID) {
    await this.ensureDemoSeed();
    const [project] = await this.db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId), eq(projects.deleted, false))).limit(1);
    if (!project) return undefined;
    const [decisionRows, noteRows, taskRows, sourceRows, receiptRows] = await Promise.all([
      this.db.select().from(projectDecisions).where(and(eq(projectDecisions.projectId, projectId), eq(projectDecisions.deleted, false))).orderBy(desc(projectDecisions.updatedAt)),
      this.db.select().from(researchNotes).where(and(eq(researchNotes.projectId, projectId), eq(researchNotes.deleted, false))).orderBy(desc(researchNotes.updatedAt)).limit(30),
      project.goalId ? this.db.select().from(tasks).where(and(eq(tasks.goalId, project.goalId), eq(tasks.deleted, false))).orderBy(desc(tasks.priority), asc(tasks.deadline)) : Promise.resolve([]),
      this.db.select().from(sources).where(and(eq(sources.userId, userId), eq(sources.projectId, projectId), eq(sources.deleted, false))).orderBy(desc(sources.updatedAt)),
      this.db.select().from(sessionReceipts).where(and(eq(sessionReceipts.userId, userId), eq(sessionReceipts.projectId, projectId))).orderBy(desc(sessionReceipts.createdAt)).limit(5),
    ]);
    return { project, decisions: decisionRows, notes: noteRows, tasks: taskRows, sources: sourceRows.map(publicSourceMetadata), recentReceipts: receiptRows };
  }

  async listGoals(userId = DEMO_USER_ID) {
    await this.ensureDemoSeed();
    return this.db.select().from(goals).where(and(eq(goals.userId, userId), eq(goals.deleted, false))).orderBy(asc(goals.targetDate));
  }

  async getGoal(goalId: string, userId = DEMO_USER_ID) {
    await this.ensureDemoSeed();
    const [goal] = await this.db.select().from(goals).where(and(eq(goals.id, goalId), eq(goals.userId, userId), eq(goals.deleted, false))).limit(1);
    if (!goal) return undefined;
    const [taskRows, projectRows] = await Promise.all([
      this.db.select().from(tasks).where(and(eq(tasks.goalId, goalId), eq(tasks.deleted, false))).orderBy(desc(tasks.priority), asc(tasks.deadline)),
      this.db.select().from(projects).where(and(eq(projects.userId, userId), eq(projects.goalId, goalId), eq(projects.deleted, false))),
    ]);
    return { goal, tasks: taskRows, projects: projectRows };
  }

  async searchResearch(userId: string, query: string, limit = 10) {
    const bounded = Math.max(1, Math.min(limit, 20));
    const pattern = `%${query.trim().slice(0, 500)}%`;
    const [decisionRows, noteRows, claimRows, passageRows] = await Promise.all([
      this.db.select({ decision: projectDecisions, projectTitle: projects.title }).from(projectDecisions).innerJoin(projects, eq(projectDecisions.projectId, projects.id)).where(and(eq(projects.userId, userId), eq(projects.deleted, false), eq(projectDecisions.deleted, false), or(ilike(projectDecisions.text, pattern), ilike(projectDecisions.reasoning, pattern)))).orderBy(desc(projectDecisions.updatedAt)).limit(bounded),
      this.db.select({ note: researchNotes, projectTitle: projects.title }).from(researchNotes).innerJoin(projects, eq(researchNotes.projectId, projects.id)).where(and(eq(projects.userId, userId), eq(projects.deleted, false), eq(researchNotes.deleted, false), ilike(researchNotes.text, pattern))).orderBy(desc(researchNotes.updatedAt)).limit(bounded),
      this.db.select({ claim: researchClaims, projectTitle: projects.title }).from(researchClaims).innerJoin(projects, eq(researchClaims.projectId, projects.id)).where(and(eq(projects.userId, userId), eq(projects.deleted, false), eq(researchClaims.deleted, false), ilike(researchClaims.text, pattern))).orderBy(desc(researchClaims.updatedAt)).limit(bounded),
      this.db.select({ chunk: sourceChunks, source: sources }).from(sourceChunks).innerJoin(sources, eq(sourceChunks.sourceId, sources.id)).where(and(eq(sources.userId, userId), eq(sources.deleted, false), eq(sourceChunks.deleted, false), ilike(sourceChunks.content, pattern))).orderBy(desc(sourceChunks.updatedAt)).limit(bounded),
    ]);
    return [
      ...claimRows.map(({ claim, projectTitle }) => ({ kind: "claim", id: claim.id, projectId: claim.projectId, projectTitle, text: claim.text, status: claim.status, createdBy: claim.createdBy, verificationModel: claim.verificationModel, updatedAt: claim.updatedAt.toISOString() })),
      ...decisionRows.map(({ decision, projectTitle }) => ({ kind: "decision", id: decision.id, projectId: decision.projectId, projectTitle, text: decision.text, reasoning: decision.reasoning, status: decision.status, sourceIds: decision.sourceIds, updatedAt: decision.updatedAt.toISOString() })),
      ...noteRows.map(({ note, projectTitle }) => ({ kind: "note", id: note.id, projectId: note.projectId, projectTitle, text: note.text, sourceId: note.sourceId, chunkId: note.chunkId, updatedAt: note.updatedAt.toISOString() })),
      ...passageRows.map(({ chunk, source }) => ({ kind: "source_passage", id: chunk.id, sourceId: source.id, projectId: source.projectId, sourceTitle: source.title, passage: chunk.passage, text: chunk.content.slice(0, 4000), contentHash: chunk.contentHash, sourceVersion: source.sourceVersion, updatedAt: chunk.updatedAt.toISOString() })),
    ].slice(0, bounded);
  }

  async getClaimEvidence(claimId: string, userId: string) {
    const [ownedClaim] = await this.db.select({ claim: researchClaims, projectTitle: projects.title }).from(researchClaims).innerJoin(projects, eq(researchClaims.projectId, projects.id)).where(and(eq(researchClaims.id, claimId), eq(projects.userId, userId), eq(projects.deleted, false), eq(researchClaims.deleted, false))).limit(1);
    if (!ownedClaim) return undefined;
    const evidence = await this.db.select({ link: claimEvidence, source: sources, chunk: sourceChunks }).from(claimEvidence).innerJoin(sources, eq(claimEvidence.sourceId, sources.id)).innerJoin(sourceChunks, eq(claimEvidence.chunkId, sourceChunks.id)).where(and(eq(claimEvidence.claimId, claimId), eq(sources.userId, userId), eq(sources.deleted, false), eq(sourceChunks.deleted, false), eq(claimEvidence.deleted, false))).orderBy(desc(claimEvidence.updatedAt));
    return {
      claim: { id: ownedClaim.claim.id, projectId: ownedClaim.claim.projectId, projectTitle: ownedClaim.projectTitle, text: ownedClaim.claim.text, status: ownedClaim.claim.status, verificationModel: ownedClaim.claim.verificationModel, updatedAt: ownedClaim.claim.updatedAt.toISOString() },
      evidence: evidence.map(({ link, source, chunk }) => ({ id: link.id, status: link.status, source: { id: source.id, title: source.title, version: source.sourceVersion, contentHash: source.contentHash }, passage: { id: chunk.id, number: chunk.passage, text: chunk.content, contentHash: chunk.contentHash, updatedAt: chunk.updatedAt.toISOString() }, verifierRouteId: link.verifierRouteId, updatedAt: link.updatedAt.toISOString() })),
      provenance: { retrievedAt: new Date().toISOString(), userScoped: true },
    };
  }

  async saveMemoryChunk(input: {
    id: string;
    userId: string;
    recordId?: string;
    projectId?: string;
    goalId?: string;
    kind: string;
    content: string;
    contentHash: string;
    embeddingModel?: string;
    embedding?: number[];
    tokenEstimate: number;
    importance: number;
    occurredAt: string;
    sourceEventIds: string[];
    metadata?: Record<string, unknown>;
  }) {
    await this.ensureDemoSeed();
    if (input.goalId) {
      const [ownedGoal] = await this.db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, input.goalId), eq(goals.userId, input.userId), eq(goals.deleted, false))).limit(1);
      if (!ownedGoal) throw new Error("Memory goal not found or not accessible");
    }
    if (input.projectId) {
      const [ownedProject] = await this.db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.userId, input.userId), eq(projects.deleted, false))).limit(1);
      if (!ownedProject) throw new Error("Memory project not found or not accessible");
    }
    const values = {
      id: input.id,
      userId: input.userId,
      recordId: input.recordId,
      projectId: input.projectId,
      goalId: input.goalId,
      kind: input.kind,
      content: input.content,
      contentHash: input.contentHash,
      embeddingModel: input.embeddingModel,
      embedding: input.embedding,
      tokenEstimate: input.tokenEstimate,
      importance: input.importance,
      occurredAt: new Date(input.occurredAt),
      sourceEventIds: input.sourceEventIds,
      metadata: input.metadata ?? {},
      superseded: false,
      deleted: false,
      updatedAt: new Date(),
    };
    await this.db.insert(memoryChunks).values(values).onConflictDoUpdate({
      target: [memoryChunks.userId, memoryChunks.contentHash],
      set: values,
    });
  }

  async searchMemory(input: { query: string; embedding?: number[]; types?: string[]; goalId?: string; projectId?: string; limit?: number }, userId = DEMO_USER_ID): Promise<StoredMemoryChunk[]> {
    await this.ensureDemoSeed();
    const limit = Math.max(1, Math.min(input.limit ?? 8, 20));
    const filters = [eq(memoryChunks.userId, userId), eq(memoryChunks.deleted, false), eq(memoryChunks.superseded, false)];
    if (input.goalId) filters.push(eq(memoryChunks.goalId, input.goalId));
    if (input.projectId) filters.push(eq(memoryChunks.projectId, input.projectId));
    if (input.types?.length) filters.push(or(...input.types.map((type) => eq(memoryChunks.kind, type)))!);
    const query = sql`websearch_to_tsquery('simple', ${input.query})`;
    const rank = sql<number>`ts_rank_cd(to_tsvector('simple', ${memoryChunks.content}), ${query})`;
    const lexical = await this.db.select({ chunk: memoryChunks, rank }).from(memoryChunks).where(and(...filters, sql`to_tsvector('simple', ${memoryChunks.content}) @@ ${query}`)).orderBy(desc(rank), desc(memoryChunks.importance), desc(memoryChunks.occurredAt)).limit(limit * 2);
    const scored = new Map<string, StoredMemoryChunk>();
    const toStored = (row: typeof memoryChunks.$inferSelect, score?: number): StoredMemoryChunk => ({
      id: row.id,
      kind: row.kind,
      content: row.content,
      ...(row.projectId ? { projectId: row.projectId } : {}),
      ...(row.goalId ? { goalId: row.goalId } : {}),
      occurredAt: row.occurredAt.toISOString(),
      importance: row.importance,
      tokenEstimate: row.tokenEstimate,
      sourceEventIds: row.sourceEventIds,
      ...(score === undefined ? {} : { score }),
      metadata: row.metadata,
    });
    for (const row of lexical) scored.set(row.chunk.id, toStored(row.chunk, Math.min(0.82, 0.48 + Number(row.rank) * 0.25 + row.chunk.importance * 0.15)));
    if (input.embedding?.length) {
      const distance = cosineDistance(memoryChunks.embedding, input.embedding);
      const vectorRows = await this.db.select({ chunk: memoryChunks, distance }).from(memoryChunks).where(and(...filters, isNotNull(memoryChunks.embedding))).orderBy(asc(distance)).limit(limit * 2);
      for (const { chunk, distance: value } of vectorRows) {
        const semantic = 1 - Number(value);
        const recencyDays = Math.max(0, (Date.now() - chunk.occurredAt.getTime()) / 86_400_000);
        const recency = Math.exp(-recencyDays / 120);
        const combined = semantic * 0.72 + chunk.importance * 0.18 + recency * 0.1;
        const existing = scored.get(chunk.id);
        if (!existing || combined > (existing.score ?? 0)) scored.set(chunk.id, toStored(chunk, combined));
      }
    }
    return [...scored.values()].sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || right.occurredAt.localeCompare(left.occurredAt)).slice(0, limit);
  }

  async upsertEntitySummary(input: { id: string; userId: string; entityType: string; entityId: string; summary: string; tokenEstimate: number; sourceEventIds: string[]; eventWatermark: string }) {
    const values = { ...input, eventWatermark: new Date(input.eventWatermark), updatedAt: new Date(), deleted: false };
    await this.db.insert(entitySummaries).values(values).onConflictDoUpdate({ target: [entitySummaries.userId, entitySummaries.entityType, entitySummaries.entityId], set: values });
  }

  async listEntitySummaries(userId = DEMO_USER_ID) {
    return this.db.select().from(entitySummaries).where(and(eq(entitySummaries.userId, userId), eq(entitySummaries.deleted, false))).orderBy(desc(entitySummaries.updatedAt));
  }

  async saveSessionReceipt(receipt: OutcomeReceipt, clientId?: string) {
    if (receipt.goalId) {
      const [ownedGoal] = await this.db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, receipt.goalId), eq(goals.userId, receipt.userId), eq(goals.deleted, false))).limit(1);
      if (!ownedGoal) throw new Error("Receipt goal not found or not accessible");
    }
    if (receipt.projectId) {
      const [ownedProject] = await this.db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, receipt.projectId), eq(projects.userId, receipt.userId), eq(projects.deleted, false))).limit(1);
      if (!ownedProject) throw new Error("Receipt project not found or not accessible");
    }
    await this.db.insert(sessionReceipts).values({
      id: receipt.id,
      userId: receipt.userId,
      sessionId: receipt.sessionId,
      goalId: receipt.goalId,
      projectId: receipt.projectId,
      summary: receipt.summary,
      completed: receipt.completed,
      decisions: receipt.decisions,
      conceptsLearned: receipt.conceptsLearned,
      misconceptions: receipt.misconceptions,
      unresolvedQuestions: receipt.unresolvedQuestions,
      nextActions: receipt.nextActions,
      evidenceIds: receipt.evidenceIds,
      sourceEventIds: receipt.sourceEventIds,
      createdByClientId: clientId,
      createdAt: new Date(receipt.createdAt),
      updatedAt: new Date(receipt.createdAt),
    }).onConflictDoNothing();
  }

  async listSessionReceipts(userId = DEMO_USER_ID, limit = 10) {
    return this.db.select().from(sessionReceipts).where(eq(sessionReceipts.userId, userId)).orderBy(desc(sessionReceipts.createdAt)).limit(Math.max(1, Math.min(limit, 50)));
  }

  async createProposal(input: { id: string; userId: string; clientId?: string; kind: string; entityId?: string; summary: string; payload: Record<string, unknown>; risk: string; expiresAt: string }) {
    await this.db.insert(memoryProposals).values({ ...input, status: "pending", expiresAt: new Date(input.expiresAt) });
    return input.id;
  }

  async confirmProposal(proposalId: string, userId = DEMO_USER_ID) {
    return this.db.transaction(async (tx) => {
      const rows = await tx.update(memoryProposals).set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() }).where(and(eq(memoryProposals.id, proposalId), eq(memoryProposals.userId, userId), eq(memoryProposals.status, "pending"), gt(memoryProposals.expiresAt, new Date()))).returning();
      const proposal = rows[0];
      if (!proposal) return undefined;
      const payload = proposal.payload as { changes?: Record<string, unknown> };
      const changes = payload.changes ?? {};
      let appliedEntityId = proposal.entityId;
      if (proposal.kind === "goal_change" && !proposal.entityId) {
        if (typeof changes.title !== "string" || typeof changes.outcome !== "string" || typeof changes.targetDate !== "string") throw new Error("A new goal requires title, outcome, and targetDate");
        const targetDate = new Date(changes.targetDate);
        if (Number.isNaN(targetDate.valueOf())) throw new Error("A new goal requires a valid targetDate");
        appliedEntityId = `goal_${proposal.id.replace(/^proposal_/, "")}`;
        await tx.insert(goals).values({ id: appliedEntityId, userId, title: changes.title, outcome: changes.outcome, targetDate, uncertainFields: ["milestones", "initialTaskEstimates"] });
        await tx.update(memoryProposals).set({ entityId: appliedEntityId }).where(eq(memoryProposals.id, proposal.id));
      }
      if (proposal.kind === "goal_change" && proposal.entityId) {
        const targetDate = typeof changes.targetDate === "string" ? new Date(changes.targetDate) : undefined;
        const changed = await tx.update(goals).set({
          ...(typeof changes.title === "string" ? { title: changes.title } : {}),
          ...(typeof changes.outcome === "string" ? { outcome: changes.outcome } : {}),
          ...(targetDate && !Number.isNaN(targetDate.valueOf()) ? { targetDate } : {}),
          ...(typeof changes.status === "string" ? { status: changes.status } : {}),
          ...(typeof changes.progress === "number" ? { progress: Math.max(0, Math.min(1, changes.progress)) } : {}),
          updatedAt: new Date(), version: sql`${goals.version} + 1`,
        }).where(and(eq(goals.id, proposal.entityId), eq(goals.userId, userId), eq(goals.deleted, false))).returning({ id: goals.id });
        if (!changed.length) throw new Error("Goal not found or not accessible");
      }
      if (proposal.kind === "project_change" && proposal.entityId) {
        const changed = await tx.update(projects).set({
          ...(typeof changes.title === "string" ? { title: changes.title } : {}),
          ...(typeof changes.purpose === "string" ? { purpose: changes.purpose } : {}),
          ...(typeof changes.phase === "string" ? { phase: changes.phase } : {}),
          updatedAt: new Date(), version: sql`${projects.version} + 1`,
        }).where(and(eq(projects.id, proposal.entityId), eq(projects.userId, userId), eq(projects.deleted, false))).returning({ id: projects.id });
        if (!changed.length) throw new Error("Project not found or not accessible");
      }
      if (proposal.kind === "project_change" && !proposal.entityId) {
        if (typeof changes.title !== "string" || typeof changes.purpose !== "string") throw new Error("A new project requires title and purpose");
        const goalId = typeof changes.goalId === "string" ? changes.goalId : undefined;
        if (goalId) {
          const [ownedGoal] = await tx.select({ id: goals.id }).from(goals).where(and(eq(goals.id, goalId), eq(goals.userId, userId), eq(goals.deleted, false))).limit(1);
          if (!ownedGoal) throw new Error("Project goal is not accessible");
        }
        appliedEntityId = `project_${proposal.id.replace(/^proposal_/, "")}`;
        await tx.insert(projects).values({ id: appliedEntityId, userId, goalId, title: changes.title, purpose: changes.purpose, phase: typeof changes.phase === "string" ? changes.phase : "planning" });
        await tx.update(memoryProposals).set({ entityId: appliedEntityId }).where(eq(memoryProposals.id, proposal.id));
      }
      if (proposal.kind === "task_change" && proposal.entityId) {
        const deadline = typeof changes.deadline === "string" ? new Date(changes.deadline) : undefined;
        const ownedTask = tx.select({ id: tasks.id }).from(tasks).innerJoin(goals, eq(tasks.goalId, goals.id)).where(and(eq(tasks.id, proposal.entityId), eq(goals.userId, userId), eq(tasks.deleted, false)));
        const changed = await tx.update(tasks).set({
          ...(typeof changes.title === "string" ? { title: changes.title } : {}),
          ...(typeof changes.description === "string" ? { description: changes.description } : {}),
          ...(["backlog", "planned", "in_progress", "blocked", "done"].includes(String(changes.status)) ? { status: changes.status as "backlog" | "planned" | "in_progress" | "blocked" | "done" } : {}),
          ...(typeof changes.estimatedMinutes === "number" ? { estimatedMinutes: Math.max(1, Math.round(changes.estimatedMinutes)) } : {}),
          ...(deadline && !Number.isNaN(deadline.valueOf()) ? { deadline } : {}),
          ...(typeof changes.priority === "number" ? { priority: Math.max(1, Math.min(5, Math.round(changes.priority))) } : {}),
          ...(typeof changes.energyRequired === "string" ? { energyRequired: changes.energyRequired } : {}),
          ...(typeof changes.completionEvidence === "string" ? { completionEvidence: changes.completionEvidence } : {}),
          updatedAt: new Date(), version: sql`${tasks.version} + 1`,
        }).where(and(eq(tasks.id, proposal.entityId), sql`${tasks.id} in ${ownedTask}`)).returning({ id: tasks.id });
        if (!changed.length) throw new Error("Task not found or not accessible");
      }
      if (proposal.kind === "task_change" && !proposal.entityId) {
        if (typeof changes.goalId !== "string" || typeof changes.title !== "string" || typeof changes.estimatedMinutes !== "number") throw new Error("A new task requires goalId, title, and estimatedMinutes");
        const [ownedGoal] = await tx.select({ id: goals.id }).from(goals).where(and(eq(goals.id, changes.goalId), eq(goals.userId, userId), eq(goals.deleted, false))).limit(1);
        if (!ownedGoal) throw new Error("Task goal is not accessible");
        appliedEntityId = `task_${proposal.id.replace(/^proposal_/, "")}`;
        const deadline = typeof changes.deadline === "string" ? new Date(changes.deadline) : undefined;
        if (deadline && Number.isNaN(deadline.valueOf())) throw new Error("Task deadline is invalid");
        await tx.insert(tasks).values({ id: appliedEntityId, goalId: changes.goalId, title: changes.title, description: typeof changes.description === "string" ? changes.description : undefined, estimatedMinutes: Math.max(5, Math.min(1440, Math.round(changes.estimatedMinutes))), deadline, priority: typeof changes.priority === "number" ? Math.max(1, Math.min(5, Math.round(changes.priority))) : 3, energyRequired: typeof changes.energyRequired === "string" ? changes.energyRequired : "medium", completionEvidence: typeof changes.completionEvidence === "string" ? changes.completionEvidence : undefined, generatedBy: "mcp_confirmed", promptVersion: "mcp-v1" });
        await tx.update(memoryProposals).set({ entityId: appliedEntityId }).where(eq(memoryProposals.id, proposal.id));
      }
      if (proposal.kind !== "schedule_change") await tx.update(memoryProposals).set({ status: "applied", updatedAt: new Date() }).where(eq(memoryProposals.id, proposal.id));
      return { ...proposal, entityId: appliedEntityId, status: proposal.kind === "schedule_change" ? "confirmed" : "applied" };
    });
  }

  async rejectProposal(proposalId: string, userId = DEMO_USER_ID) {
    const rows = await this.db.update(memoryProposals).set({ status: "rejected", updatedAt: new Date() }).where(and(eq(memoryProposals.id, proposalId), eq(memoryProposals.userId, userId), eq(memoryProposals.status, "pending"), gt(memoryProposals.expiresAt, new Date()))).returning();
    return rows[0];
  }

  async commitScheduleProposal(proposalId: string, userId = DEMO_USER_ID) {
    return this.db.transaction(async (tx) => {
      const [proposal] = await tx.select().from(memoryProposals).where(and(eq(memoryProposals.id, proposalId), eq(memoryProposals.userId, userId), eq(memoryProposals.kind, "schedule_change"), eq(memoryProposals.status, "confirmed"), gt(memoryProposals.expiresAt, new Date()))).limit(1);
      if (!proposal) throw new Error("Confirmed schedule proposal not found");
      const changes = ((proposal.payload as { changes?: Record<string, unknown> }).changes ?? {});
      if (!proposal.entityId && Array.isArray(changes.blocks)) {
        const planned: Array<typeof scheduleBlocks.$inferInsert> = [];
        for (const [index, rawBlock] of changes.blocks.entries()) {
          if (!rawBlock || typeof rawBlock !== "object") throw new Error("Schedule proposal contains an invalid block");
          const block = rawBlock as Record<string, unknown>;
          const taskId = String(block.taskId ?? "");
          const startsAt = new Date(String(block.start ?? block.startsAt ?? ""));
          const endsAt = new Date(String(block.end ?? block.endsAt ?? ""));
          if (!taskId || Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf()) || startsAt >= endsAt || endsAt.valueOf() - startsAt.valueOf() > 8 * 3600_000) throw new Error("Schedule proposal contains invalid task or time bounds");
          const [ownedTask] = await tx.select({ id: tasks.id }).from(tasks).innerJoin(goals, eq(tasks.goalId, goals.id)).where(and(eq(tasks.id, taskId), eq(goals.userId, userId), eq(tasks.deleted, false), eq(goals.deleted, false))).limit(1);
          if (!ownedTask) throw new Error(`Task ${taskId} was not found or is not accessible`);
          planned.push({ id: `block_${proposal.id.replace(/^proposal_/, "")}_${index + 1}`, taskId, startsAt, endsAt, status: "planned", flexible: block.flexible !== false, proposalId: proposal.id, committedAt: new Date() });
        }
        if (!planned.length) throw new Error("Schedule proposal contains no blocks to commit");
        const created = await tx.insert(scheduleBlocks).values(planned).returning();
        for (const block of planned) await tx.update(tasks).set({ status: "planned", updatedAt: new Date(), version: sql`${tasks.version} + 1` }).where(eq(tasks.id, block.taskId));
        await tx.update(memoryProposals).set({ status: "applied", updatedAt: new Date() }).where(eq(memoryProposals.id, proposal.id));
        return { proposal: { ...proposal, status: "applied" }, blocks: created };
      }
      if (!proposal.entityId) throw new Error("Confirmed schedule proposal is missing a target block");
      const startsAt = typeof changes.startsAt === "string" ? new Date(changes.startsAt) : undefined;
      const endsAt = typeof changes.endsAt === "string" ? new Date(changes.endsAt) : undefined;
      if (startsAt && endsAt && startsAt >= endsAt) throw new Error("Schedule block end must be after its start");
      const ownedBlock = tx.select({ id: scheduleBlocks.id }).from(scheduleBlocks).innerJoin(tasks, eq(scheduleBlocks.taskId, tasks.id)).innerJoin(goals, eq(tasks.goalId, goals.id)).where(and(eq(scheduleBlocks.id, proposal.entityId), eq(goals.userId, userId), eq(scheduleBlocks.deleted, false)));
      const rows = await tx.update(scheduleBlocks).set({
        ...(startsAt && !Number.isNaN(startsAt.valueOf()) ? { startsAt } : {}),
        ...(endsAt && !Number.isNaN(endsAt.valueOf()) ? { endsAt } : {}),
        ...(typeof changes.status === "string" ? { status: changes.status } : {}),
        committedAt: new Date(), updatedAt: new Date(), version: sql`${scheduleBlocks.version} + 1`,
      }).where(and(eq(scheduleBlocks.id, proposal.entityId), sql`${scheduleBlocks.id} in ${ownedBlock}`)).returning();
      if (!rows[0]) throw new Error("Schedule block not found or not accessible");
      await tx.update(memoryProposals).set({ status: "applied", updatedAt: new Date() }).where(eq(memoryProposals.id, proposal.id));
      return { proposal: { ...proposal, status: "applied" }, blocks: rows };
    });
  }

  async saveArtifact(input: { id: string; projectId: string; userId: string; title: string; kind: string; uri?: string; metadata?: Record<string, unknown> }) {
    const [project] = await this.db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.userId, input.userId), eq(projects.deleted, false))).limit(1);
    if (!project) throw new Error("Project not found or not accessible");
    await this.db.insert(artifacts).values({ id: input.id, projectId: input.projectId, title: input.title, kind: input.kind, storagePath: input.uri, metadata: input.metadata ?? {} });
  }

  async recordTaskProgress(input: { taskId: string; userId: string; status: string; evidence?: string }) {
    if (!["backlog", "planned", "in_progress", "blocked", "done"].includes(input.status)) throw new Error("Unsupported task status");
    const ownedTask = this.db.select({ id: tasks.id }).from(tasks).innerJoin(goals, eq(tasks.goalId, goals.id)).where(and(eq(tasks.id, input.taskId), eq(goals.userId, input.userId), eq(tasks.deleted, false)));
    const rows = await this.db.update(tasks).set({ status: input.status as "backlog" | "planned" | "in_progress" | "blocked" | "done", ...(input.evidence ? { completionEvidence: input.evidence } : {}), updatedAt: new Date(), version: sql`${tasks.version} + 1` }).where(and(eq(tasks.id, input.taskId), sql`${tasks.id} in ${ownedTask}`)).returning({ id: tasks.id });
    if (!rows.length) throw new Error("Task not found or not accessible");
  }

  async seedResources(entries: ResourceRegistryEntry[]) {
    for (const entry of entries) {
      await this.db.insert(resourceRegistry).values({
        id: entry.id,
        title: entry.title,
        provider: entry.provider,
        authority: entry.authority,
        cost: entry.cost,
        url: entry.url,
        metadata: entry,
        qualityScore: entry.qualityScore,
        lastReviewedAt: new Date(entry.lastReviewedAt),
        active: entry.active,
      }).onConflictDoUpdate({ target: resourceRegistry.id, set: { title: entry.title, provider: entry.provider, authority: entry.authority, cost: entry.cost, url: entry.url, metadata: entry, qualityScore: entry.qualityScore, lastReviewedAt: new Date(entry.lastReviewedAt), active: entry.active, updatedAt: new Date() } });
    }
  }

  async listResources(): Promise<ResourceRegistryEntry[]> {
    const rows = await this.db.select().from(resourceRegistry).where(eq(resourceRegistry.active, true)).orderBy(desc(resourceRegistry.qualityScore));
    return rows.map((row) => row.metadata as ResourceRegistryEntry);
  }

  async saveResourceActivity(activity: ResourceActivity, metadata: Record<string, unknown> = {}) {
    if (activity.goalId) {
      const [ownedGoal] = await this.db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, activity.goalId), eq(goals.userId, activity.userId), eq(goals.deleted, false))).limit(1);
      if (!ownedGoal) throw new Error("Goal not found or not accessible");
    }
    const values = {
      id: activity.id,
      userId: activity.userId,
      resourceId: activity.resourceId,
      recommendationId: activity.recommendationId,
      goalId: activity.goalId,
      conceptId: activity.conceptId,
      status: activity.status,
      startedAt: new Date(activity.startedAt),
      returnedAt: activity.returnedAt ? new Date(activity.returnedAt) : null,
      verifiedAt: activity.verifiedAt ? new Date(activity.verifiedAt) : null,
      evidenceIds: activity.evidenceIds,
      verificationScore: activity.verificationScore,
      metadata,
      updatedAt: new Date(),
    };
    await this.db.insert(resourceActivities).values(values).onConflictDoUpdate({ target: resourceActivities.id, set: values });
  }

  async savePaper(input: PaperWrite) {
    const [ownedProject] = await this.db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.userId, input.userId), eq(projects.deleted, false))).limit(1);
    if (!ownedProject) throw new Error("Project not found or not accessible");
    const normalizedDoi = input.doi?.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "");
    const existing = normalizedDoi
      ? await this.db.select().from(papers).where(and(eq(papers.projectId, input.projectId), eq(papers.doi, normalizedDoi), eq(papers.deleted, false))).limit(1)
      : await this.db.select().from(papers).where(and(eq(papers.projectId, input.projectId), ilike(papers.title, input.title.trim()), eq(papers.deleted, false))).limit(1);
    if (existing[0]) return { paper: existing[0], duplicate: true };
    const [paper] = await this.db.insert(papers).values({ id: input.id, projectId: input.projectId, title: input.title.trim(), authors: input.authors, doi: normalizedDoi, year: input.year }).returning();
    if (!paper) throw new Error("Paper could not be saved");
    return { paper, duplicate: false };
  }

  async listPapers(userId: string, projectId?: string) {
    return this.db.select({ paper: papers }).from(papers).innerJoin(projects, eq(papers.projectId, projects.id)).where(and(eq(projects.userId, userId), projectId ? eq(projects.id, projectId) : undefined, eq(projects.deleted, false), eq(papers.deleted, false))).orderBy(desc(papers.updatedAt)).then((rows) => rows.map((row) => row.paper));
  }

  async getResourceActivity(activityId: string, userId = DEMO_USER_ID) {
    const [row] = await this.db.select().from(resourceActivities).where(and(eq(resourceActivities.id, activityId), eq(resourceActivities.userId, userId))).limit(1);
    return row;
  }

  async logContextAccess(input: { id: string; userId: string; clientId?: string; tool: string; focus?: string; selectedRecordIds: string[]; tokenEstimate: number; occurredAt: string }) {
    await this.db.insert(contextAccessLog).values({ ...input, occurredAt: new Date(input.occurredAt) });
  }

  async logModelRoute(input: { id: string; userId: string; feature: string; taskClass: string; provider: string; model: string; reason: string; verificationStatus: string; fallbackUsed: boolean; inputTokens: number; outputTokens: number; costClass: string; estimatedCostUsd: number; occurredAt: string }) {
    await this.db.transaction(async (tx) => {
      await tx.insert(modelRoutes).values({ id: input.id, userId: input.userId, taskClass: input.taskClass, provider: input.provider, model: input.model, reason: input.reason, verificationStatus: input.verificationStatus, fallbackUsed: input.fallbackUsed });
      await tx.insert(modelUsage).values({ id: `usage_${input.id.replace(/^route_/, "")}`, routeId: input.id, userId: input.userId, feature: input.feature, inputTokens: input.inputTokens, outputTokens: input.outputTokens, costClass: input.costClass, estimatedCostUsd: input.estimatedCostUsd, occurredAt: new Date(input.occurredAt) });
    });
  }

  async getDailyModelUsage(userId: string, dayStart: string, dayEnd: string) {
    const [row] = await this.db.select({ total: sql<number>`coalesce(sum(${modelUsage.inputTokens} + ${modelUsage.outputTokens}), 0)` }).from(modelUsage).where(and(eq(modelUsage.userId, userId), gt(modelUsage.occurredAt, new Date(dayStart)), lt(modelUsage.occurredAt, new Date(dayEnd))));
    return Number(row?.total ?? 0);
  }

  async getGlobalModelUsage(start: string, end: string) {
    const [row] = await this.db.select({
      tokens: sql<number>`coalesce(sum(${modelUsage.inputTokens} + ${modelUsage.outputTokens}), 0)`,
      estimatedCostUsd: sql<number>`coalesce(sum(${modelUsage.estimatedCostUsd}), 0)`,
      requests: sql<number>`count(*)`,
    }).from(modelUsage).where(and(gt(modelUsage.occurredAt, new Date(start)), lt(modelUsage.occurredAt, new Date(end))));
    return {
      tokens: Number(row?.tokens ?? 0),
      estimatedCostUsd: Number(row?.estimatedCostUsd ?? 0),
      requests: Number(row?.requests ?? 0),
    };
  }

  async acquireAiRequestLease(input: { id: string; userId: string; feature: string; expiresAt: string; limit: number }) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(773492104)`);
      await tx.delete(aiRequestLeases).where(lt(aiRequestLeases.expiresAt, new Date()));
      const [row] = await tx.select({ total: sql<number>`count(*)` }).from(aiRequestLeases);
      if (Number(row?.total ?? 0) >= input.limit) return false;
      await tx.insert(aiRequestLeases).values({ id: input.id, userId: input.userId, feature: input.feature, expiresAt: new Date(input.expiresAt) });
      return true;
    });
  }

  async releaseAiRequestLease(id: string) {
    await this.db.delete(aiRequestLeases).where(eq(aiRequestLeases.id, id));
  }

  async createUser(input: { id: string; email: string; displayName: string; timezone: string; educationLevel?: string; passwordHash: string; passwordSalt: string }) {
    await this.db.transaction(async (tx) => {
      await tx.insert(users).values({ id: input.id, email: input.email.toLowerCase() });
      await tx.insert(profiles).values({ id: `profile_${input.id.replace(/^user_/, "")}`, userId: input.id, displayName: input.displayName, timezone: input.timezone, educationLevel: input.educationLevel, preferences: { explanationStyle: "intuition_before_derivation", memoryWrites: true } });
      await tx.insert(userCredentials).values({ userId: input.id, passwordHash: input.passwordHash, passwordSalt: input.passwordSalt });
    });
    return { id: input.id, email: input.email.toLowerCase(), displayName: input.displayName, timezone: input.timezone, ...(input.educationLevel ? { educationLevel: input.educationLevel } : {}) } satisfies AuthUser;
  }

  async resolveOrCreateOAuthUser(input: { id: string; identityId: string; provider: string; subject: string; email: string; displayName: string; timezone: string }) {
    return this.db.transaction(async (tx) => {
      const existingIdentity = await tx.select({ user: users, profile: profiles }).from(authIdentities).innerJoin(users, eq(authIdentities.userId, users.id)).innerJoin(profiles, eq(profiles.userId, users.id)).where(and(eq(authIdentities.provider, input.provider), eq(authIdentities.subject, input.subject), eq(users.deleted, false), eq(profiles.deleted, false))).limit(1);
      if (existingIdentity[0]) return { id: existingIdentity[0].user.id, email: existingIdentity[0].user.email, displayName: existingIdentity[0].profile.displayName, timezone: existingIdentity[0].profile.timezone, ...(existingIdentity[0].profile.educationLevel ? { educationLevel: existingIdentity[0].profile.educationLevel } : {}) } satisfies AuthUser;

      const normalizedEmail = input.email.toLowerCase();
      const inserted = await tx.insert(users).values({ id: input.id, email: normalizedEmail }).onConflictDoNothing({ target: users.email }).returning({ id: users.id });
      if (inserted[0]) await tx.insert(profiles).values({ id: `profile_${input.id.replace(/^user_/, "")}`, userId: input.id, displayName: input.displayName, timezone: input.timezone, preferences: { explanationStyle: "intuition_before_derivation", memoryWrites: true } });
      const [account] = await tx.select({ user: users, profile: profiles }).from(users).innerJoin(profiles, eq(profiles.userId, users.id)).where(and(eq(users.email, normalizedEmail), eq(users.deleted, false), eq(profiles.deleted, false))).limit(1);
      if (!account) throw new Error("Verified account could not be created");
      await tx.insert(authIdentities).values({ id: input.identityId, userId: account.user.id, provider: input.provider, subject: input.subject, email: normalizedEmail }).onConflictDoNothing();
      const [resolved] = await tx.select({ user: users, profile: profiles }).from(authIdentities).innerJoin(users, eq(authIdentities.userId, users.id)).innerJoin(profiles, eq(profiles.userId, users.id)).where(and(eq(authIdentities.provider, input.provider), eq(authIdentities.subject, input.subject), eq(users.deleted, false), eq(profiles.deleted, false))).limit(1);
      if (!resolved) throw new Error("Verified identity could not be linked");
      return { id: resolved.user.id, email: resolved.user.email, displayName: resolved.profile.displayName, timezone: resolved.profile.timezone, ...(resolved.profile.educationLevel ? { educationLevel: resolved.profile.educationLevel } : {}) } satisfies AuthUser;
    });
  }

  async findUserForLogin(email: string) {
    const [row] = await this.db.select({ user: users, profile: profiles, credential: userCredentials }).from(users).innerJoin(profiles, eq(profiles.userId, users.id)).innerJoin(userCredentials, eq(userCredentials.userId, users.id)).where(and(eq(users.email, email.toLowerCase()), eq(users.deleted, false), eq(profiles.deleted, false))).limit(1);
    return row;
  }

  async getUser(userId: string): Promise<AuthUser | undefined> {
    const [row] = await this.db.select({ user: users, profile: profiles }).from(users).innerJoin(profiles, eq(profiles.userId, users.id)).where(and(eq(users.id, userId), eq(users.deleted, false), eq(profiles.deleted, false))).limit(1);
    if (!row) return undefined;
    return { id: row.user.id, email: row.user.email, displayName: row.profile.displayName, timezone: row.profile.timezone, ...(row.profile.educationLevel ? { educationLevel: row.profile.educationLevel } : {}) };
  }

  async updateLoginFailure(userId: string, succeeded: boolean) {
    if (succeeded) {
      await this.db.update(userCredentials).set({ failedAttempts: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(userCredentials.userId, userId));
      return;
    }
    const [row] = await this.db.update(userCredentials).set({ failedAttempts: sql`${userCredentials.failedAttempts} + 1`, updatedAt: new Date() }).where(eq(userCredentials.userId, userId)).returning({ attempts: userCredentials.failedAttempts });
    if ((row?.attempts ?? 0) >= 5) await this.db.update(userCredentials).set({ lockedUntil: new Date(Date.now() + 15 * 60_000) }).where(eq(userCredentials.userId, userId));
  }

  async createSession(input: { id: string; userId: string; tokenHash: string; expiresAt: string; userAgentHash?: string; ipHash?: string }) {
    await this.db.insert(appSessions).values({ ...input, expiresAt: new Date(input.expiresAt) });
  }

  async getSession(tokenHash: string) {
    const [row] = await this.db.select({ session: appSessions, user: users, profile: profiles }).from(appSessions).innerJoin(users, eq(appSessions.userId, users.id)).innerJoin(profiles, eq(profiles.userId, users.id)).where(and(eq(appSessions.tokenHash, tokenHash), isNull(appSessions.revokedAt), gt(appSessions.expiresAt, new Date()), eq(users.deleted, false), eq(profiles.deleted, false))).limit(1);
    if (!row) return undefined;
    return { id: row.user.id, email: row.user.email, displayName: row.profile.displayName, timezone: row.profile.timezone, ...(row.profile.educationLevel ? { educationLevel: row.profile.educationLevel } : {}) } satisfies AuthUser;
  }

  async revokeSession(tokenHash: string) {
    await this.db.update(appSessions).set({ revokedAt: new Date() }).where(eq(appSessions.tokenHash, tokenHash));
  }

  async consumeRateLimit(key: string, limit: number, windowMs: number) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - windowMs);
    const [row] = await this.db.insert(rateLimitBuckets).values({ key, windowStartedAt: now, count: 1, updatedAt: now }).onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        windowStartedAt: sql`case when ${rateLimitBuckets.windowStartedAt} < ${cutoff} then ${now} else ${rateLimitBuckets.windowStartedAt} end`,
        count: sql`case when ${rateLimitBuckets.windowStartedAt} < ${cutoff} then 1 else ${rateLimitBuckets.count} + 1 end`,
        updatedAt: now,
      },
    }).returning({ count: rateLimitBuckets.count, windowStartedAt: rateLimitBuckets.windowStartedAt });
    return { allowed: (row?.count ?? limit + 1) <= limit, count: row?.count ?? limit + 1, resetAt: new Date((row?.windowStartedAt ?? now).getTime() + windowMs).toISOString() };
  }

  async createIntegrationToken(input: { id: string; userId: string; provider: string; name: string; tokenHash: string; scopes: string[]; expiresAt?: string }) {
    await this.db.insert(integrationTokens).values({ ...input, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null });
  }

  async resolveIntegrationToken(tokenHash: string, provider: string) {
    const [row] = await this.db.select().from(integrationTokens).where(and(eq(integrationTokens.tokenHash, tokenHash), eq(integrationTokens.provider, provider), isNull(integrationTokens.revokedAt), or(isNull(integrationTokens.expiresAt), gt(integrationTokens.expiresAt, new Date())))).limit(1);
    if (row) await this.db.update(integrationTokens).set({ lastUsedAt: new Date(), updatedAt: new Date() }).where(eq(integrationTokens.id, row.id));
    return row;
  }

  async listIntegrationTokens(userId: string) {
    return this.db.select({ id: integrationTokens.id, provider: integrationTokens.provider, name: integrationTokens.name, scopes: integrationTokens.scopes, lastUsedAt: integrationTokens.lastUsedAt, expiresAt: integrationTokens.expiresAt, revokedAt: integrationTokens.revokedAt, createdAt: integrationTokens.createdAt }).from(integrationTokens).where(eq(integrationTokens.userId, userId)).orderBy(desc(integrationTokens.createdAt));
  }

  async getIntegration(userId: string, provider: string) {
    const [row] = await this.db.select().from(integrations).where(and(eq(integrations.userId, userId), eq(integrations.provider, provider), isNull(integrations.revokedAt), eq(integrations.deleted, false))).limit(1);
    return row;
  }

  async listIntegrations(userId: string) {
    return this.db.select({ id: integrations.id, provider: integrations.provider, scopes: integrations.scopes, createdAt: integrations.createdAt, updatedAt: integrations.updatedAt }).from(integrations).where(and(eq(integrations.userId, userId), isNull(integrations.revokedAt), eq(integrations.deleted, false))).orderBy(asc(integrations.provider));
  }

  async upsertIntegration(input: { id: string; userId: string; provider: string; encryptedCredentials: string; scopes: string[] }) {
    const now = new Date();
    const [row] = await this.db.insert(integrations).values({ ...input, revokedAt: null, deleted: false, updatedAt: now }).onConflictDoUpdate({
      target: [integrations.userId, integrations.provider],
      set: { encryptedCredentials: input.encryptedCredentials, scopes: input.scopes, revokedAt: null, deleted: false, updatedAt: now, version: sql`${integrations.version} + 1` },
    }).returning({ id: integrations.id, provider: integrations.provider, scopes: integrations.scopes, updatedAt: integrations.updatedAt });
    return row;
  }

  async revokeIntegration(userId: string, provider: string) {
    const rows = await this.db.update(integrations).set({ revokedAt: new Date(), updatedAt: new Date(), version: sql`${integrations.version} + 1` }).where(and(eq(integrations.userId, userId), eq(integrations.provider, provider), isNull(integrations.revokedAt))).returning({ id: integrations.id });
    return Boolean(rows.length);
  }

  async listMcpClientActivity(userId: string) {
    return this.db.select({ clientId: contextAccessLog.clientId, lastUsedAt: sql<Date>`max(${contextAccessLog.occurredAt})`, calls: sql<number>`count(*)` }).from(contextAccessLog).where(and(eq(contextAccessLog.userId, userId), isNotNull(contextAccessLog.clientId))).groupBy(contextAccessLog.clientId);
  }

  async replaceCalendarConstraints(userId: string, provider: string, entries: Array<{ id: string; title: string; startsAt: string; endsAt: string }>) {
    const prefix = `${provider}_`;
    await this.db.transaction(async (tx) => {
      await tx.update(calendarConstraints).set({ deleted: true, updatedAt: new Date() }).where(and(eq(calendarConstraints.userId, userId), like(calendarConstraints.id, `${prefix}%`)));
      for (const entry of entries) {
        const values = { id: entry.id, userId, title: entry.title, startsAt: new Date(entry.startsAt), endsAt: new Date(entry.endsAt), hard: true, deleted: false, updatedAt: new Date() };
        await tx.insert(calendarConstraints).values(values).onConflictDoUpdate({ target: calendarConstraints.id, set: values });
      }
    });
    return entries.length;
  }

  async revokeIntegrationToken(tokenId: string, userId: string) {
    const rows = await this.db.update(integrationTokens).set({ revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(integrationTokens.id, tokenId), eq(integrationTokens.userId, userId))).returning({ id: integrationTokens.id });
    return Boolean(rows.length);
  }

  async upsertSyncedDocument(input: { id: string; userId: string; provider: string; externalId: string; path: string; mimeType: string; contentHash: string; sourceId?: string; remoteUpdatedAt: string; metadata?: Record<string, unknown> }) {
    const values = { ...input, remoteUpdatedAt: new Date(input.remoteUpdatedAt), lastSyncedAt: new Date(), metadata: input.metadata ?? {}, deleted: false, updatedAt: new Date() };
    await this.db.insert(syncedDocuments).values(values).onConflictDoUpdate({ target: [syncedDocuments.userId, syncedDocuments.provider, syncedDocuments.externalId], set: { path: values.path, mimeType: values.mimeType, contentHash: values.contentHash, sourceId: values.sourceId, remoteUpdatedAt: values.remoteUpdatedAt, lastSyncedAt: values.lastSyncedAt, syncVersion: sql`${syncedDocuments.syncVersion} + 1`, metadata: values.metadata, deleted: false, updatedAt: values.updatedAt } });
  }

  async listSyncedDocuments(userId: string, provider = "obsidian") {
    return this.db.select().from(syncedDocuments).where(and(eq(syncedDocuments.userId, userId), eq(syncedDocuments.provider, provider), eq(syncedDocuments.deleted, false))).orderBy(asc(syncedDocuments.path));
  }

  async listOAuthConnections(userId: string) {
    return this.db.select().from(oauthConnections)
      .where(and(eq(oauthConnections.userId, userId), isNull(oauthConnections.revokedAt)))
      .orderBy(desc(oauthConnections.lastAuthorizedAt));
  }

  async upsertOAuthConnection(input: { id: string; userId: string; clientId: string; clientName: string; scopes: string[] }) {
    const now = new Date();
    await this.db.insert(oauthConnections).values({
      ...input,
      connectedAt: now,
      lastAuthorizedAt: now,
      revokedAt: null,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [oauthConnections.userId, oauthConnections.clientId],
      set: {
        clientName: input.clientName,
        scopes: input.scopes,
        lastAuthorizedAt: now,
        revokedAt: null,
        updatedAt: now,
        version: sql`${oauthConnections.version} + 1`,
      },
    });
  }

  async revokeOAuthClient(userId: string, clientId: string) {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const rows = await tx.update(oauthGrants).set({ revokedAt: now }).where(and(eq(oauthGrants.userId, userId), eq(oauthGrants.clientId, clientId), isNull(oauthGrants.revokedAt))).returning({ id: oauthGrants.id });
      const connections = await tx.update(oauthConnections).set({ revokedAt: now, updatedAt: now, version: sql`${oauthConnections.version} + 1` }).where(and(eq(oauthConnections.userId, userId), eq(oauthConnections.clientId, clientId), isNull(oauthConnections.revokedAt))).returning({ id: oauthConnections.id });
      return rows.length + connections.length;
    });
  }

  async registerOAuthGrant(input: { jti: string; userId: string; clientId: string; kind: string; scopes: string[]; expiresAt: string }) {
    await this.ensureDemoSeed();
    await this.db.insert(oauthGrants).values({ id: input.jti, userId: input.userId, clientId: input.clientId, kind: input.kind, scopes: input.scopes, expiresAt: new Date(input.expiresAt) }).onConflictDoNothing();
  }

  async oauthGrantUnavailable(jti: string) {
    await this.ensureDemoSeed();
    const [grant] = await this.db.select().from(oauthGrants).where(eq(oauthGrants.id, jti)).limit(1);
    return !grant || Boolean(grant.revokedAt || grant.consumedAt || grant.expiresAt <= new Date());
  }

  async revokeOAuthGrant(jti: string) {
    await this.ensureDemoSeed();
    await this.db.update(oauthGrants).set({ revokedAt: new Date() }).where(eq(oauthGrants.id, jti));
  }

  async consumeOAuthGrant(jti: string, kind: "code" | "refresh" | "consent") {
    await this.ensureDemoSeed();
    const rows = await this.db.update(oauthGrants).set({ consumedAt: new Date() }).where(and(eq(oauthGrants.id, jti), eq(oauthGrants.kind, kind), isNull(oauthGrants.consumedAt), isNull(oauthGrants.revokedAt), gt(oauthGrants.expiresAt, new Date()))).returning({ id: oauthGrants.id });
    if (!rows.length) throw new Error(`${kind === "code" ? "Authorization code" : kind === "refresh" ? "Refresh token" : "Authorization request"} was already used, expired, or was not issued`);
  }

  async consumeOAuthCode(jti: string) {
    await this.consumeOAuthGrant(jti, "code");
  }
}
