-- Source lifecycle (redesign.md §13.3, migration 1 of §16.11).
--
-- Additive only. Every existing row lands on `processing_state = 'ready'` and
-- `retention = 'library'`, which is what the library already assumed silently:
-- a source row existed only after ingestion had completed, so "ready" is the
-- truthful backfill and nothing that reads `sources` today changes behaviour.
--
-- `processing_state` values: pending | processing | ready | failed.
-- `retention` values: library | session.
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "processing_state" text DEFAULT 'ready' NOT NULL;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "processing_error" text;
ALTER TABLE "sources" ADD COLUMN IF NOT EXISTS "retention" text DEFAULT 'library' NOT NULL;

-- The Sources tab filters by state within one user's library, which is exactly
-- this pair; without it the filter degrades to a full user-scoped scan.
CREATE INDEX IF NOT EXISTS "sources_user_state_idx" ON "sources" ("user_id", "processing_state");
