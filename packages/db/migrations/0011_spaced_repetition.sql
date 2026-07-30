-- Spaced repetition. The product measured mastery in four dimensions and then
-- scheduled nothing with it, so a student had no answer to "what should I
-- review today". These four columns are the SM-2 state per concept.
ALTER TABLE "learning_states" ADD COLUMN IF NOT EXISTS "due_at" timestamp with time zone;
ALTER TABLE "learning_states" ADD COLUMN IF NOT EXISTS "interval_days" real DEFAULT 0 NOT NULL;
ALTER TABLE "learning_states" ADD COLUMN IF NOT EXISTS "ease" real DEFAULT 2.5 NOT NULL;
ALTER TABLE "learning_states" ADD COLUMN IF NOT EXISTS "reps" integer DEFAULT 0 NOT NULL;
ALTER TABLE "learning_states" ADD COLUMN IF NOT EXISTS "lapses" integer DEFAULT 0 NOT NULL;
CREATE INDEX IF NOT EXISTS "learning_states_due_idx" ON "learning_states" ("user_id", "due_at");

-- An explain-back attempt: the student writes the idea in their own words and
-- it is graded against the passage it came from.
CREATE TABLE IF NOT EXISTS "explanations" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "concept_id" text NOT NULL REFERENCES "concepts"("id"),
  "source_chunk_id" text,
  "prompt" text NOT NULL,
  "answer" text NOT NULL,
  "score" real NOT NULL,
  "verdict" text NOT NULL,
  "missing" text[] DEFAULT '{}' NOT NULL,
  "wrong" text[] DEFAULT '{}' NOT NULL,
  "feedback" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "deleted" boolean DEFAULT false NOT NULL
);
CREATE INDEX IF NOT EXISTS "explanations_user_concept_idx" ON "explanations" ("user_id", "concept_id");
