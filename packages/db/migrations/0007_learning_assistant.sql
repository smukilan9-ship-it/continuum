CREATE TABLE IF NOT EXISTS "question_banks" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "source_id" text NOT NULL REFERENCES "sources"("id"),
  "concept_id" text REFERENCES "concepts"("id"),
  "title" text NOT NULL,
  "status" text DEFAULT 'ready' NOT NULL,
  "mode" text DEFAULT 'mixed_review' NOT NULL,
  "questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "injection_detected" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "deleted" boolean DEFAULT false NOT NULL
);

CREATE INDEX IF NOT EXISTS "question_banks_user_time_idx" ON "question_banks" ("user_id", "updated_at");
CREATE INDEX IF NOT EXISTS "question_banks_source_idx" ON "question_banks" ("source_id");

CREATE TABLE IF NOT EXISTS "question_bank_attempts" (
  "id" text PRIMARY KEY NOT NULL,
  "question_bank_id" text NOT NULL REFERENCES "question_banks"("id"),
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "mode" text NOT NULL,
  "answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evaluations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "score" real DEFAULT 0 NOT NULL,
  "current_index" integer DEFAULT 0 NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL
);

CREATE INDEX IF NOT EXISTS "question_bank_attempts_user_time_idx" ON "question_bank_attempts" ("user_id", "updated_at");
CREATE INDEX IF NOT EXISTS "question_bank_attempts_bank_idx" ON "question_bank_attempts" ("question_bank_id");

CREATE TABLE IF NOT EXISTS "assistant_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "title" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "summary" text,
  "decisions" text[] DEFAULT '{}' NOT NULL,
  "unresolved_questions" text[] DEFAULT '{}' NOT NULL,
  "created_tasks" text[] DEFAULT '{}' NOT NULL,
  "important_facts" text[] DEFAULT '{}' NOT NULL,
  "linked_entity_ids" text[] DEFAULT '{}' NOT NULL,
  "memory_excluded" boolean DEFAULT false NOT NULL,
  "last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "deleted" boolean DEFAULT false NOT NULL
);

CREATE INDEX IF NOT EXISTS "assistant_sessions_user_time_idx" ON "assistant_sessions" ("user_id", "last_message_at");

CREATE TABLE IF NOT EXISTS "assistant_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL REFERENCES "assistant_sessions"("id"),
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "role" text NOT NULL,
  "content" text NOT NULL,
  "provider" text,
  "model" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL
);

CREATE INDEX IF NOT EXISTS "assistant_messages_session_time_idx" ON "assistant_messages" ("session_id", "created_at");
CREATE INDEX IF NOT EXISTS "assistant_messages_user_time_idx" ON "assistant_messages" ("user_id", "created_at");
