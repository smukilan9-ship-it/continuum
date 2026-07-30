-- Study sessions (redesign.md §14.1, §16.11 migration 2).
--
-- Additive and nullable throughout: no existing row is read or rewritten. The
-- localStorage drafts this replaces are per-browser and are simply not carried
-- over — there is no server-side copy of them to migrate.
CREATE TABLE IF NOT EXISTS "study_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "goal_id" text REFERENCES "goals"("id"),
  "concept_id" text REFERENCES "concepts"("id"),
  "phase" text DEFAULT 'learn' NOT NULL,
  "lesson" jsonb,
  "checkpoint" jsonb,
  "answer" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "study_sessions_user_time_idx" ON "study_sessions" ("user_id", "updated_at");
