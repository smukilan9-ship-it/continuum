CREATE TABLE "app_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent_hash" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_access_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text,
	"tool" text NOT NULL,
	"focus" text,
	"selected_record_ids" text[] DEFAULT '{}' NOT NULL,
	"token_estimate" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"summary" text NOT NULL,
	"token_estimate" integer NOT NULL,
	"source_event_ids" text[] DEFAULT '{}' NOT NULL,
	"event_watermark" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"record_id" text,
	"project_id" text,
	"goal_id" text,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding_model" text,
	"embedding" vector(1536),
	"token_estimate" integer NOT NULL,
	"importance" real DEFAULT 0.5 NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"source_event_ids" text[] DEFAULT '{}' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"superseded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text,
	"kind" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"payload" jsonb NOT NULL,
	"risk" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"recommendation_id" text NOT NULL,
	"goal_id" text,
	"concept_id" text,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"returned_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"evidence_ids" text[] DEFAULT '{}' NOT NULL,
	"verification_score" real,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"provider" text NOT NULL,
	"authority" text NOT NULL,
	"cost" text NOT NULL,
	"url" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"quality_score" real NOT NULL,
	"last_reviewed_at" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"goal_id" text,
	"project_id" text,
	"summary" text NOT NULL,
	"completed" text[] DEFAULT '{}' NOT NULL,
	"decisions" text[] DEFAULT '{}' NOT NULL,
	"concepts_learned" text[] DEFAULT '{}' NOT NULL,
	"misconceptions" text[] DEFAULT '{}' NOT NULL,
	"unresolved_questions" text[] DEFAULT '{}' NOT NULL,
	"next_actions" text[] DEFAULT '{}' NOT NULL,
	"evidence_ids" text[] DEFAULT '{}' NOT NULL,
	"source_event_ids" text[] DEFAULT '{}' NOT NULL,
	"created_by_client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synced_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"path" text NOT NULL,
	"mime_type" text NOT NULL,
	"content_hash" text NOT NULL,
	"source_id" text,
	"remote_updated_at" timestamp with time zone NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"user_id" text PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"password_salt" text NOT NULL,
	"password_version" integer DEFAULT 1 NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_sessions" ADD CONSTRAINT "app_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_access_log" ADD CONSTRAINT "context_access_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_summaries" ADD CONSTRAINT "entity_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_tokens" ADD CONSTRAINT "integration_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_chunks" ADD CONSTRAINT "memory_chunks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_chunks" ADD CONSTRAINT "memory_chunks_record_id_memory_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."memory_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_chunks" ADD CONSTRAINT "memory_chunks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_chunks" ADD CONSTRAINT "memory_chunks_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_proposals" ADD CONSTRAINT "memory_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_activities" ADD CONSTRAINT "resource_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_activities" ADD CONSTRAINT "resource_activities_resource_id_resource_registry_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_activities" ADD CONSTRAINT "resource_activities_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_activities" ADD CONSTRAINT "resource_activities_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_receipts" ADD CONSTRAINT "session_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_receipts" ADD CONSTRAINT "session_receipts_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_receipts" ADD CONSTRAINT "session_receipts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synced_documents" ADD CONSTRAINT "synced_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synced_documents" ADD CONSTRAINT "synced_documents_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_sessions_token_idx" ON "app_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "app_sessions_user_idx" ON "app_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "context_access_user_time_idx" ON "context_access_log" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_summaries_current_idx" ON "entity_summaries" USING btree ("user_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_tokens_hash_idx" ON "integration_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "integration_tokens_user_idx" ON "integration_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memory_chunks_user_time_idx" ON "memory_chunks" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "memory_chunks_user_kind_idx" ON "memory_chunks" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_chunks_user_hash_idx" ON "memory_chunks" USING btree ("user_id","content_hash");--> statement-breakpoint
CREATE INDEX "memory_proposals_user_status_idx" ON "memory_proposals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "resource_activities_user_time_idx" ON "resource_activities" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "session_receipts_user_time_idx" ON "session_receipts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "synced_documents_external_idx" ON "synced_documents" USING btree ("user_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "synced_documents_user_path_idx" ON "synced_documents" USING btree ("user_id","path");