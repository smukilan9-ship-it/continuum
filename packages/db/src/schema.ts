import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  version: integer("version").default(1).notNull(),
};
const editable = { ...timestamps, deleted: boolean("deleted").default(false).notNull() };

export const taskStatus = pgEnum("task_status", ["backlog", "planned", "in_progress", "blocked", "done"]);
export const evidenceStatus = pgEnum("evidence_status", ["direct_support", "indirect_support", "model_inference", "user_hypothesis", "contradicted", "unverified"]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
  ...editable,
}, (table) => [uniqueIndex("users_email_idx").on(table.email)]);
export const userCredentials = pgTable("user_credentials", { userId: text("user_id").primaryKey().references(() => users.id), passwordHash: text("password_hash").notNull(), passwordSalt: text("password_salt").notNull(), passwordVersion: integer("password_version").default(1).notNull(), failedAttempts: integer("failed_attempts").default(0).notNull(), lockedUntil: timestamp("locked_until", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull() });
export const appSessions = pgTable("app_sessions", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), tokenHash: text("token_hash").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(), authenticatedAt: timestamp("authenticated_at", { withTimezone: true }).defaultNow().notNull(), revokedAt: timestamp("revoked_at", { withTimezone: true }), userAgent: text("user_agent"), userAgentHash: text("user_agent_hash"), ipHash: text("ip_hash"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, (table) => [uniqueIndex("app_sessions_token_idx").on(table.tokenHash), index("app_sessions_user_idx").on(table.userId)]);
export const authTokens = pgTable("auth_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  purpose: text("purpose").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("auth_tokens_hash_idx").on(table.tokenHash),
  index("auth_tokens_user_purpose_idx").on(table.userId, table.purpose),
  index("auth_tokens_expiry_idx").on(table.expiresAt),
]);
export const passwordHistory = pgTable("password_history", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("password_history_user_time_idx").on(table.userId, table.createdAt)]);
export const rateLimitBuckets = pgTable("rate_limit_buckets", { key: text("key").primaryKey(), windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(), count: integer("count").default(0).notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull() });
export const profiles = pgTable("profiles", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), displayName: text("display_name").notNull(), timezone: text("timezone").notNull(), educationLevel: text("education_level"), preferences: jsonb("preferences").$type<Record<string, unknown>>().default({}).notNull(), ...editable });
export const integrations = pgTable("integrations", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), provider: text("provider").notNull(), encryptedCredentials: text("encrypted_credentials"), scopes: text("scopes").array().default([]).notNull(), revokedAt: timestamp("revoked_at", { withTimezone: true }), ...editable }, (table) => [uniqueIndex("integrations_user_provider_idx").on(table.userId, table.provider)]);
export const goals = pgTable("goals", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), title: text("title").notNull(), outcome: text("outcome").notNull(), targetDate: timestamp("target_date", { withTimezone: true }).notNull(), status: text("status").default("active").notNull(), progress: real("progress").default(0).notNull(), uncertainFields: text("uncertain_fields").array().default([]).notNull(), ...editable });
export const milestones = pgTable("milestones", { id: text("id").primaryKey(), goalId: text("goal_id").references(() => goals.id).notNull(), title: text("title").notNull(), status: text("status").default("upcoming").notNull(), dueAt: timestamp("due_at", { withTimezone: true }), order: integer("order").notNull(), ...editable });
export const tasks = pgTable("tasks", { id: text("id").primaryKey(), goalId: text("goal_id").references(() => goals.id).notNull(), title: text("title").notNull(), description: text("description"), status: taskStatus("status").default("backlog").notNull(), estimatedMinutes: integer("estimated_minutes").notNull(), deadline: timestamp("deadline", { withTimezone: true }), priority: integer("priority").notNull(), energyRequired: text("energy_required").notNull(), completionEvidence: text("completion_evidence"), generatedBy: text("generated_by"), promptVersion: text("prompt_version"), ...editable });
export const taskDependencies = pgTable("task_dependencies", { id: text("id").primaryKey(), taskId: text("task_id").references(() => tasks.id).notNull(), dependsOnTaskId: text("depends_on_task_id").references(() => tasks.id).notNull(), ...editable });
export const calendarConstraints = pgTable("calendar_constraints", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), title: text("title").notNull(), startsAt: timestamp("starts_at", { withTimezone: true }).notNull(), endsAt: timestamp("ends_at", { withTimezone: true }).notNull(), hard: boolean("hard").default(true).notNull(), ...editable });
export const scheduleBlocks = pgTable("schedule_blocks", { id: text("id").primaryKey(), taskId: text("task_id").references(() => tasks.id).notNull(), startsAt: timestamp("starts_at", { withTimezone: true }).notNull(), endsAt: timestamp("ends_at", { withTimezone: true }).notNull(), status: text("status").default("planned").notNull(), flexible: boolean("flexible").default(true).notNull(), proposalId: text("proposal_id").notNull(), committedAt: timestamp("committed_at", { withTimezone: true }), ...editable });
export const curricula = pgTable("curricula", { id: text("id").primaryKey(), authority: text("authority").notNull(), title: text("title").notNull(), sourceVersion: text("source_version").notNull(), humanReviewed: boolean("human_reviewed").default(false).notNull(), ...editable });
export const curriculumNodes = pgTable("curriculum_nodes", { id: text("id").primaryKey(), curriculumId: text("curriculum_id").references(() => curricula.id).notNull(), topic: text("topic").notNull(), outcomes: text("outcomes").array().default([]).notNull(), prerequisiteIds: text("prerequisite_ids").array().default([]).notNull(), sourceIds: text("source_ids").array().default([]).notNull(), ...editable });
export const concepts = pgTable("concepts", { id: text("id").primaryKey(), curriculumNodeId: text("curriculum_node_id").references(() => curriculumNodes.id), title: text("title").notNull(), description: text("description").notNull(), prerequisiteIds: text("prerequisite_ids").array().default([]).notNull(), ...editable });
export const learningStates = pgTable("learning_states", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), conceptId: text("concept_id").references(() => concepts.id).notNull(), exposure: real("exposure").default(0).notNull(), understanding: real("understanding").default(0).notNull(), transfer: real("transfer").default(0).notNull(), retention: real("retention").default(0).notNull(), confidence: real("confidence").default(0).notNull(), status: text("status").notNull(), evidenceIds: text("evidence_ids").array().default([]).notNull(), explanation: text("explanation").notNull(), lastPracticedAt: timestamp("last_practiced_at", { withTimezone: true }), ...editable }, (table) => [uniqueIndex("learning_states_user_concept_idx").on(table.userId, table.conceptId)]);
export const assessments = pgTable("assessments", { id: text("id").primaryKey(), conceptId: text("concept_id").references(() => concepts.id).notNull(), kind: text("kind").notNull(), items: jsonb("items").$type<unknown[]>().notNull(), model: text("model"), promptVersion: text("prompt_version"), ...editable });
export const assessmentAttempts = pgTable("assessment_attempts", { id: text("id").primaryKey(), assessmentId: text("assessment_id").references(() => assessments.id).notNull(), userId: text("user_id").references(() => users.id).notNull(), answers: jsonb("answers").$type<unknown[]>().notNull(), score: real("score").notNull(), unseen: boolean("unseen").default(false).notNull(), ...timestamps });
export const misconceptions = pgTable("misconceptions", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), conceptId: text("concept_id").references(() => concepts.id).notNull(), attemptId: text("attempt_id").references(() => assessmentAttempts.id).notNull(), label: text("label").notNull(), status: text("status").notNull(), confidence: real("confidence").notNull(), ...editable });
export const projects = pgTable("projects", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), goalId: text("goal_id").references(() => goals.id), title: text("title").notNull(), purpose: text("purpose").notNull(), phase: text("phase").notNull(), ...editable });
export const projectDecisions = pgTable("project_decisions", { id: text("id").primaryKey(), projectId: text("project_id").references(() => projects.id).notNull(), text: text("text").notNull(), reasoning: text("reasoning").notNull(), status: text("status").notNull(), sourceIds: text("source_ids").array().default([]).notNull(), supersedesId: text("supersedes_id"), ...editable });
/**
 * `processingState` (pending | processing | ready | failed), `processingError`,
 * and `retention` (library | session) back the source lifecycle the Library
 * renders (redesign.md §13.3). All three default, so rows written before
 * migration 0009 read back as a ready, retained library source — which is what
 * they are, since a row only ever existed after ingestion finished.
 */
export const sources = pgTable("sources", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), projectId: text("project_id").references(() => projects.id), title: text("title").notNull(), mimeType: text("mime_type").notNull(), storagePath: text("storage_path"), contentHash: text("content_hash").notNull(), sourceVersion: integer("source_version").default(1).notNull(), parserVersion: text("parser_version").notNull(), processingState: text("processing_state").default("ready").notNull(), processingError: text("processing_error"), retention: text("retention").default("library").notNull(), ...editable }, (table) => [index("sources_hash_idx").on(table.contentHash), index("sources_user_state_idx").on(table.userId, table.processingState)]);
export const questionBanks = pgTable("question_banks", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  sourceId: text("source_id").references(() => sources.id).notNull(),
  conceptId: text("concept_id").references(() => concepts.id),
  title: text("title").notNull(),
  status: text("status").default("ready").notNull(),
  mode: text("mode").default("mixed_review").notNull(),
  questions: jsonb("questions").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  injectionDetected: boolean("injection_detected").default(false).notNull(),
  ...editable,
}, (table) => [
  index("question_banks_user_time_idx").on(table.userId, table.updatedAt),
  index("question_banks_source_idx").on(table.sourceId),
]);
export const questionBankAttempts = pgTable("question_bank_attempts", {
  id: text("id").primaryKey(),
  questionBankId: text("question_bank_id").references(() => questionBanks.id).notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  mode: text("mode").notNull(),
  answers: jsonb("answers").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  evaluations: jsonb("evaluations").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  score: real("score").default(0).notNull(),
  currentIndex: integer("current_index").default(0).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("question_bank_attempts_user_time_idx").on(table.userId, table.updatedAt),
  index("question_bank_attempts_bank_idx").on(table.questionBankId),
]);
export const sourceChunks = pgTable("source_chunks", { id: text("id").primaryKey(), sourceId: text("source_id").references(() => sources.id).notNull(), passage: integer("passage").notNull(), content: text("content").notNull(), contentHash: text("content_hash").notNull(), embedding: vector("embedding", { dimensions: 1536 }), ...editable }, (table) => [
  index("source_chunks_source_idx").on(table.sourceId),
  index("source_chunks_embedding_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
]);
export const papers = pgTable("papers", { id: text("id").primaryKey(), projectId: text("project_id").references(() => projects.id).notNull(), sourceId: text("source_id").references(() => sources.id), title: text("title").notNull(), authors: text("authors").array().default([]).notNull(), doi: text("doi"), year: integer("year"), ...editable });
export const researchNotes = pgTable("research_notes", { id: text("id").primaryKey(), projectId: text("project_id").references(() => projects.id).notNull(), sourceId: text("source_id").references(() => sources.id), chunkId: text("chunk_id").references(() => sourceChunks.id), text: text("text").notNull(), createdBy: text("created_by").notNull(), ...editable });
export const researchClaims = pgTable("research_claims", { id: text("id").primaryKey(), projectId: text("project_id").references(() => projects.id).notNull(), text: text("text").notNull(), status: text("status").notNull(), createdBy: text("created_by").notNull(), verificationModel: text("verification_model"), supersedesId: text("supersedes_id"), ...editable });
export const claimEvidence = pgTable("claim_evidence", { id: text("id").primaryKey(), claimId: text("claim_id").references(() => researchClaims.id).notNull(), sourceId: text("source_id").references(() => sources.id).notNull(), chunkId: text("chunk_id").references(() => sourceChunks.id).notNull(), status: evidenceStatus("status").notNull(), verifierRouteId: text("verifier_route_id"), ...editable });
export const artifacts = pgTable("artifacts", { id: text("id").primaryKey(), projectId: text("project_id").references(() => projects.id).notNull(), title: text("title").notNull(), kind: text("kind").notNull(), storagePath: text("storage_path"), metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(), ...editable });
export const memoryEvents = pgTable("memory_events", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), type: text("type").notNull(), goalId: text("goal_id").references(() => goals.id), entityId: text("entity_id"), payload: jsonb("payload").$type<Record<string, unknown>>().notNull(), source: jsonb("source").$type<Record<string, unknown>>().notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, (table) => [index("memory_events_user_time_idx").on(table.userId, table.occurredAt)]);
export const memoryRecords = pgTable("memory_records", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), type: text("type").notNull(), entityId: text("entity_id"), value: jsonb("value").$type<Record<string, unknown>>().notNull(), sourceEventId: text("source_event_id").references(() => memoryEvents.id).notNull(), superseded: boolean("superseded").default(false).notNull(), ...editable });
export const memoryChunks = pgTable("memory_chunks", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), recordId: text("record_id").references(() => memoryRecords.id), projectId: text("project_id").references(() => projects.id), goalId: text("goal_id").references(() => goals.id), kind: text("kind").notNull(), content: text("content").notNull(), contentHash: text("content_hash").notNull(), embeddingModel: text("embedding_model"), embedding: vector("embedding", { dimensions: 1536 }), tokenEstimate: integer("token_estimate").notNull(), importance: real("importance").default(0.5).notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(), sourceEventIds: text("source_event_ids").array().default([]).notNull(), metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(), superseded: boolean("superseded").default(false).notNull(), ...editable }, (table) => [
  index("memory_chunks_user_time_idx").on(table.userId, table.occurredAt),
  index("memory_chunks_user_kind_idx").on(table.userId, table.kind),
  uniqueIndex("memory_chunks_user_hash_idx").on(table.userId, table.contentHash),
  index("memory_chunks_embedding_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
]);
export const entitySummaries = pgTable("entity_summaries", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(), summary: text("summary").notNull(), tokenEstimate: integer("token_estimate").notNull(), sourceEventIds: text("source_event_ids").array().default([]).notNull(), eventWatermark: timestamp("event_watermark", { withTimezone: true }).notNull(), ...editable }, (table) => [uniqueIndex("entity_summaries_current_idx").on(table.userId, table.entityType, table.entityId)]);
export const sessionReceipts = pgTable("session_receipts", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), sessionId: text("session_id").notNull(), goalId: text("goal_id").references(() => goals.id), projectId: text("project_id").references(() => projects.id), summary: text("summary").notNull(), completed: text("completed").array().default([]).notNull(), decisions: text("decisions").array().default([]).notNull(), conceptsLearned: text("concepts_learned").array().default([]).notNull(), misconceptions: text("misconceptions").array().default([]).notNull(), unresolvedQuestions: text("unresolved_questions").array().default([]).notNull(), nextActions: text("next_actions").array().default([]).notNull(), evidenceIds: text("evidence_ids").array().default([]).notNull(), sourceEventIds: text("source_event_ids").array().default([]).notNull(), createdByClientId: text("created_by_client_id"), ...timestamps }, (table) => [index("session_receipts_user_time_idx").on(table.userId, table.createdAt)]);
export const assistantSessions = pgTable("assistant_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  status: text("status").default("active").notNull(),
  summary: text("summary"),
  decisions: text("decisions").array().default([]).notNull(),
  unresolvedQuestions: text("unresolved_questions").array().default([]).notNull(),
  createdTasks: text("created_tasks").array().default([]).notNull(),
  importantFacts: text("important_facts").array().default([]).notNull(),
  linkedEntityIds: text("linked_entity_ids").array().default([]).notNull(),
  memoryExcluded: boolean("memory_excluded").default(false).notNull(),
  pinned: boolean("pinned").default(false).notNull(),
  archived: boolean("archived").default(false).notNull(),
  groupLabel: text("group_label"),
  contextSettings: jsonb("context_settings").$type<Record<string, unknown>>().default({}).notNull(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
  ...editable,
}, (table) => [index("assistant_sessions_user_time_idx").on(table.userId, table.lastMessageAt)]);
export const assistantMessages = pgTable("assistant_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => assistantSessions.id).notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  provider: text("provider"),
  model: text("model"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  ...timestamps,
}, (table) => [
  index("assistant_messages_session_time_idx").on(table.sessionId, table.createdAt),
  index("assistant_messages_user_time_idx").on(table.userId, table.createdAt),
]);
export const codeWorkspaces = pgTable("code_workspaces", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  name: text("name").default("Primary workspace").notNull(),
  state: jsonb("state").$type<Record<string, unknown>>().default({}).notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("code_workspaces_user_name_idx").on(table.userId, table.name), index("code_workspaces_user_time_idx").on(table.userId, table.updatedAt)]);
export const memoryProposals = pgTable("memory_proposals", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), clientId: text("client_id"), kind: text("kind").notNull(), entityId: text("entity_id"), summary: text("summary").notNull(), payload: jsonb("payload").$type<Record<string, unknown>>().notNull(), risk: text("risk").notNull(), status: text("status").default("pending").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), confirmedAt: timestamp("confirmed_at", { withTimezone: true }), ...timestamps }, (table) => [index("memory_proposals_user_status_idx").on(table.userId, table.status)]);
export const contextAccessLog = pgTable("context_access_log", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), clientId: text("client_id"), tool: text("tool").notNull(), focus: text("focus"), selectedRecordIds: text("selected_record_ids").array().default([]).notNull(), tokenEstimate: integer("token_estimate").notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull() }, (table) => [index("context_access_user_time_idx").on(table.userId, table.occurredAt)]);
export const resourceRegistry = pgTable("resource_registry", { id: text("id").primaryKey(), title: text("title").notNull(), provider: text("provider").notNull(), authority: text("authority").notNull(), cost: text("cost").notNull(), url: text("url").notNull(), metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(), qualityScore: real("quality_score").notNull(), lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }).notNull(), active: boolean("active").default(true).notNull(), ...timestamps });
export const resourceActivities = pgTable("resource_activities", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), resourceId: text("resource_id").references(() => resourceRegistry.id).notNull(), recommendationId: text("recommendation_id").notNull(), goalId: text("goal_id").references(() => goals.id), conceptId: text("concept_id").references(() => concepts.id), status: text("status").notNull(), startedAt: timestamp("started_at", { withTimezone: true }).notNull(), returnedAt: timestamp("returned_at", { withTimezone: true }), verifiedAt: timestamp("verified_at", { withTimezone: true }), evidenceIds: text("evidence_ids").array().default([]).notNull(), verificationScore: real("verification_score"), metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(), ...timestamps }, (table) => [index("resource_activities_user_time_idx").on(table.userId, table.startedAt)]);
export const modelRoutes = pgTable("model_routes", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), taskClass: text("task_class").notNull(), provider: text("provider").notNull(), model: text("model").notNull(), reason: text("reason").notNull(), verificationStatus: text("verification_status").notNull(), fallbackUsed: boolean("fallback_used").default(false).notNull(), ...timestamps });
export const modelUsage = pgTable("model_usage", { id: text("id").primaryKey(), routeId: text("route_id").references(() => modelRoutes.id).notNull(), userId: text("user_id").references(() => users.id).notNull(), feature: text("feature").default("unknown").notNull(), inputTokens: integer("input_tokens").notNull(), outputTokens: integer("output_tokens").notNull(), costClass: text("cost_class").notNull(), estimatedCostUsd: real("estimated_cost_usd").default(0).notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, (table) => [index("model_usage_user_time_idx").on(table.userId, table.occurredAt), index("model_usage_time_idx").on(table.occurredAt)]);
export const aiRequestLeases = pgTable("ai_request_leases", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), feature: text("feature").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, (table) => [index("ai_request_leases_expiry_idx").on(table.expiresAt), index("ai_request_leases_user_idx").on(table.userId)]);
export const auditLog = pgTable("audit_log", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), actor: text("actor").notNull(), action: text("action").notNull(), entityIds: text("entity_ids").array().default([]).notNull(), changeSummary: text("change_summary").notNull(), metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() });
export const oauthClients = pgTable("oauth_clients", { id: text("id").primaryKey(), name: text("name").notNull(), redirectUris: text("redirect_uris").array().notNull(), scopes: text("scopes").array().notNull(), publicClient: boolean("public_client").default(true).notNull(), revokedAt: timestamp("revoked_at", { withTimezone: true }), ...timestamps });
export const oauthTokens = pgTable("oauth_tokens", { id: text("id").primaryKey(), clientId: text("client_id").references(() => oauthClients.id).notNull(), userId: text("user_id").references(() => users.id).notNull(), tokenHash: text("token_hash").notNull(), refreshTokenHash: text("refresh_token_hash"), scopes: text("scopes").array().notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), revokedAt: timestamp("revoked_at", { withTimezone: true }), ...timestamps }, (table) => [uniqueIndex("oauth_tokens_hash_idx").on(table.tokenHash)]);
export const oauthGrants = pgTable("oauth_grants", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), clientId: text("client_id").notNull(), kind: text("kind").notNull(), scopes: text("scopes").array().default([]).notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), consumedAt: timestamp("consumed_at", { withTimezone: true }), revokedAt: timestamp("revoked_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() }, (table) => [index("oauth_grants_user_idx").on(table.userId), index("oauth_grants_expiry_idx").on(table.expiresAt)]);
export const oauthConnections = pgTable("oauth_connections", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), clientId: text("client_id").notNull(), clientName: text("client_name").notNull(), scopes: text("scopes").array().default([]).notNull(), connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(), lastAuthorizedAt: timestamp("last_authorized_at", { withTimezone: true }).defaultNow().notNull(), revokedAt: timestamp("revoked_at", { withTimezone: true }), ...timestamps }, (table) => [uniqueIndex("oauth_connections_user_client_idx").on(table.userId, table.clientId), index("oauth_connections_user_idx").on(table.userId)]);
export const integrationTokens = pgTable("integration_tokens", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), provider: text("provider").notNull(), name: text("name").notNull(), tokenHash: text("token_hash").notNull(), scopes: text("scopes").array().default([]).notNull(), lastUsedAt: timestamp("last_used_at", { withTimezone: true }), expiresAt: timestamp("expires_at", { withTimezone: true }), revokedAt: timestamp("revoked_at", { withTimezone: true }), ...timestamps }, (table) => [uniqueIndex("integration_tokens_hash_idx").on(table.tokenHash), index("integration_tokens_user_idx").on(table.userId)]);
export const syncedDocuments = pgTable("synced_documents", { id: text("id").primaryKey(), userId: text("user_id").references(() => users.id).notNull(), provider: text("provider").notNull(), externalId: text("external_id").notNull(), path: text("path").notNull(), mimeType: text("mime_type").notNull(), contentHash: text("content_hash").notNull(), sourceId: text("source_id").references(() => sources.id), remoteUpdatedAt: timestamp("remote_updated_at", { withTimezone: true }).notNull(), lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow().notNull(), syncVersion: integer("sync_version").default(1).notNull(), metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(), ...editable }, (table) => [uniqueIndex("synced_documents_external_idx").on(table.userId, table.provider, table.externalId), index("synced_documents_user_path_idx").on(table.userId, table.path)]);
export const syncSettings = pgTable("sync_settings", {
  userId: text("user_id").primaryKey().references(() => users.id),
  paused: boolean("paused").default(false).notNull(),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const syncRecords = pgTable("sync_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  syncId: text("sync_id").notNull(),
  recordId: text("record_id").notNull(),
  recordType: text("record_type").notNull(),
  schemaVersion: integer("schema_version").default(1).notNull(),
  ownerFingerprint: text("owner_fingerprint").notNull(),
  title: text("title").notNull(),
  path: text("path").notNull(),
  content: text("content").default("").notNull(),
  baseContent: text("base_content").default("").notNull(),
  contentHash: text("content_hash").notNull(),
  baseHash: text("base_hash").notNull(),
  localRevision: integer("local_revision").default(0).notNull(),
  serverRevision: integer("server_revision").default(0).notNull(),
  commonBaseRevision: integer("common_base_revision").default(0).notNull(),
  origin: text("origin").notNull(),
  deletionState: text("deletion_state").default("active").notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  blockedAt: timestamp("blocked_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("sync_records_user_sync_idx").on(table.userId, table.syncId),
  index("sync_records_user_state_idx").on(table.userId, table.deletionState),
  index("sync_records_user_path_idx").on(table.userId, table.path),
]);

export const syncVersions = pgTable("sync_versions", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  syncId: text("sync_id").notNull(),
  revision: integer("revision").notNull(),
  side: text("side").notNull(),
  content: text("content").default("").notNull(),
  contentHash: text("content_hash").notNull(),
  path: text("path").notNull(),
  title: text("title").notNull(),
  deletionState: text("deletion_state").default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("sync_versions_identity_idx").on(table.userId, table.syncId, table.revision, table.side),
  index("sync_versions_user_sync_idx").on(table.userId, table.syncId),
]);

export const syncOperations = pgTable("sync_operations", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  syncId: text("sync_id").notNull(),
  direction: text("direction").notNull(),
  operationType: text("operation_type").notNull(),
  payloadVersion: integer("payload_version").default(1).notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  status: text("status").default("pending").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  latestError: text("latest_error"),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  bridgeAcknowledgedAt: timestamp("bridge_acknowledged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("sync_operations_idempotency_idx").on(table.idempotencyKey),
  index("sync_operations_user_status_retry_idx").on(table.userId, table.status, table.nextRetryAt),
  index("sync_operations_user_sync_idx").on(table.userId, table.syncId),
]);

export const syncConflicts = pgTable("sync_conflicts", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  syncId: text("sync_id").notNull(),
  baseRevision: integer("base_revision").notNull(),
  serverRevision: integer("server_revision").notNull(),
  localRevision: integer("local_revision").notNull(),
  baseContent: text("base_content").default("").notNull(),
  serverContent: text("server_content").default("").notNull(),
  localContent: text("local_content").default("").notNull(),
  serverPath: text("server_path").notNull(),
  localPath: text("local_path").notNull(),
  status: text("status").default("open").notNull(),
  resolution: text("resolution"),
  resolvedContent: text("resolved_content"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("sync_conflicts_user_status_idx").on(table.userId, table.status),
  index("sync_conflicts_user_sync_idx").on(table.userId, table.syncId),
]);

export const zoteroLibraries = pgTable("zotero_libraries", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  libraryType: text("library_type").notNull(),
  libraryId: text("library_id").notNull(),
  name: text("name").notNull(),
  permissions: jsonb("permissions").$type<Record<string, unknown>>().default({}).notNull(),
  libraryVersion: integer("library_version").default(0).notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  stats: jsonb("stats").$type<Record<string, unknown>>().default({}).notNull(),
  ...editable,
}, (table) => [
  uniqueIndex("zotero_libraries_user_external_idx").on(table.userId, table.libraryType, table.libraryId),
  index("zotero_libraries_user_idx").on(table.userId),
]);

export const zoteroCollections = pgTable("zotero_collections", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  libraryType: text("library_type").notNull(),
  libraryId: text("library_id").notNull(),
  collectionKey: text("collection_key").notNull(),
  parentCollectionKey: text("parent_collection_key"),
  name: text("name").notNull(),
  remoteVersion: integer("remote_version").default(0).notNull(),
  itemCount: integer("item_count").default(0).notNull(),
  ...editable,
}, (table) => [
  uniqueIndex("zotero_collections_identity_idx").on(table.userId, table.libraryType, table.libraryId, table.collectionKey),
  index("zotero_collections_parent_idx").on(table.userId, table.libraryId, table.parentCollectionKey),
]);

export const zoteroItems = pgTable("zotero_items", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  libraryType: text("library_type").notNull(),
  libraryId: text("library_id").notNull(),
  itemKey: text("item_key").notNull(),
  parentItemKey: text("parent_item_key"),
  itemType: text("item_type").notNull(),
  title: text("title").default("").notNull(),
  doi: text("doi"),
  remoteVersion: integer("remote_version").default(0).notNull(),
  collectionKeys: text("collection_keys").array().default([]).notNull(),
  tags: text("tags").array().default([]).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  attachments: jsonb("attachments").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  sourceId: text("source_id").references(() => sources.id),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).defaultNow().notNull(),
  ...editable,
}, (table) => [
  uniqueIndex("zotero_items_identity_idx").on(table.userId, table.libraryType, table.libraryId, table.itemKey),
  index("zotero_items_user_library_idx").on(table.userId, table.libraryId),
  index("zotero_items_user_doi_idx").on(table.userId, table.doi),
]);

export const savedExternalEntities = pgTable("saved_external_entities", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  provider: text("provider").notNull(),
  entityType: text("entity_type").notNull(),
  externalId: text("external_id").notNull(),
  title: text("title").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  ...editable,
}, (table) => [
  uniqueIndex("saved_external_entities_identity_idx").on(table.userId, table.provider, table.entityType, table.externalId),
  index("saved_external_entities_user_type_idx").on(table.userId, table.entityType),
]);

export const externalApiCache = pgTable("external_api_cache", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  cacheKey: text("cache_key").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  staleAt: timestamp("stale_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("external_api_cache_identity_idx").on(table.provider, table.cacheKey),
  index("external_api_cache_expiry_idx").on(table.expiresAt),
]);

export const imageExtractions = pgTable("image_extractions", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  contentHash: text("content_hash").notNull(),
  sourceId: text("source_id").references(() => sources.id),
  status: text("status").notNull(),
  structure: jsonb("structure").$type<Record<string, unknown>>().default({}).notNull(),
  assetPaths: text("asset_paths").array().default([]).notNull(),
  injectionDetected: boolean("injection_detected").default(false).notNull(),
  error: text("error"),
  ...timestamps,
}, (table) => [
  uniqueIndex("image_extractions_user_hash_idx").on(table.userId, table.contentHash),
  index("image_extractions_user_status_idx").on(table.userId, table.status),
]);
