ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletion_requested_at" timestamp with time zone;
ALTER TABLE "app_sessions" ADD COLUMN IF NOT EXISTS "authenticated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "app_sessions" ADD COLUMN IF NOT EXISTS "user_agent" text;
ALTER TABLE "assistant_sessions" ADD COLUMN IF NOT EXISTS "pinned" boolean DEFAULT false NOT NULL;
ALTER TABLE "assistant_sessions" ADD COLUMN IF NOT EXISTS "archived" boolean DEFAULT false NOT NULL;
ALTER TABLE "assistant_sessions" ADD COLUMN IF NOT EXISTS "group_label" text;
ALTER TABLE "assistant_sessions" ADD COLUMN IF NOT EXISTS "context_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "assistant_messages" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE TABLE IF NOT EXISTS "code_workspaces" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "name" text DEFAULT 'Primary workspace' NOT NULL,
  "state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "code_workspaces_user_name_idx" ON "code_workspaces" ("user_id", "name");
CREATE INDEX IF NOT EXISTS "code_workspaces_user_time_idx" ON "code_workspaces" ("user_id", "updated_at");

-- Existing native accounts remain usable. Historical federated-only accounts
-- are intentionally left without a credential and enter the email ownership
-- conversion flow.
UPDATE "users" SET "email_verified_at" = COALESCE("email_verified_at", now())
WHERE EXISTS (SELECT 1 FROM "user_credentials" WHERE "user_credentials"."user_id" = "users"."id");
UPDATE "users" SET "email_verified_at" = COALESCE("email_verified_at", now())
WHERE EXISTS (
  SELECT 1 FROM "auth_identities"
  WHERE "auth_identities"."user_id" = "users"."id"
    AND "auth_identities"."provider" = 'google'
);
DROP TABLE IF EXISTS "auth_identities";

CREATE TABLE IF NOT EXISTS "auth_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "purpose" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "auth_tokens_hash_idx" ON "auth_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "auth_tokens_user_purpose_idx" ON "auth_tokens" ("user_id", "purpose");
CREATE INDEX IF NOT EXISTS "auth_tokens_expiry_idx" ON "auth_tokens" ("expires_at");

CREATE TABLE IF NOT EXISTS "password_history" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "password_hash" text NOT NULL,
  "password_salt" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "password_history_user_time_idx" ON "password_history" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "sync_settings" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "users"("id"),
  "paused" boolean DEFAULT false NOT NULL,
  "paused_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sync_records" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "sync_id" text NOT NULL,
  "record_id" text NOT NULL,
  "record_type" text NOT NULL,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "owner_fingerprint" text NOT NULL,
  "title" text NOT NULL,
  "path" text NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "base_content" text DEFAULT '' NOT NULL,
  "content_hash" text NOT NULL,
  "base_hash" text NOT NULL,
  "local_revision" integer DEFAULT 0 NOT NULL,
  "server_revision" integer DEFAULT 0 NOT NULL,
  "common_base_revision" integer DEFAULT 0 NOT NULL,
  "origin" text NOT NULL,
  "deletion_state" text DEFAULT 'active' NOT NULL,
  "last_synced_at" timestamp with time zone,
  "blocked_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "sync_records_user_sync_idx" ON "sync_records" ("user_id", "sync_id");
CREATE INDEX IF NOT EXISTS "sync_records_user_state_idx" ON "sync_records" ("user_id", "deletion_state");
CREATE INDEX IF NOT EXISTS "sync_records_user_path_idx" ON "sync_records" ("user_id", "path");

CREATE TABLE IF NOT EXISTS "sync_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "sync_id" text NOT NULL,
  "revision" integer NOT NULL,
  "side" text NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "content_hash" text NOT NULL,
  "path" text NOT NULL,
  "title" text NOT NULL,
  "deletion_state" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "sync_versions_identity_idx" ON "sync_versions" ("user_id", "sync_id", "revision", "side");
CREATE INDEX IF NOT EXISTS "sync_versions_user_sync_idx" ON "sync_versions" ("user_id", "sync_id");

CREATE TABLE IF NOT EXISTS "sync_operations" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "sync_id" text NOT NULL,
  "direction" text NOT NULL,
  "operation_type" text NOT NULL,
  "payload_version" integer DEFAULT 1 NOT NULL,
  "idempotency_key" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "latest_error" text,
  "next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "bridge_acknowledged_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "sync_operations_idempotency_idx" ON "sync_operations" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "sync_operations_user_status_retry_idx" ON "sync_operations" ("user_id", "status", "next_retry_at");
CREATE INDEX IF NOT EXISTS "sync_operations_user_sync_idx" ON "sync_operations" ("user_id", "sync_id");

CREATE TABLE IF NOT EXISTS "sync_conflicts" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "sync_id" text NOT NULL,
  "base_revision" integer NOT NULL,
  "server_revision" integer NOT NULL,
  "local_revision" integer NOT NULL,
  "base_content" text DEFAULT '' NOT NULL,
  "server_content" text DEFAULT '' NOT NULL,
  "local_content" text DEFAULT '' NOT NULL,
  "server_path" text NOT NULL,
  "local_path" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "resolution" text,
  "resolved_content" text,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sync_conflicts_user_status_idx" ON "sync_conflicts" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "sync_conflicts_user_sync_idx" ON "sync_conflicts" ("user_id", "sync_id");

CREATE TABLE IF NOT EXISTS "zotero_libraries" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "library_type" text NOT NULL,
  "library_id" text NOT NULL,
  "name" text NOT NULL,
  "permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "library_version" integer DEFAULT 0 NOT NULL,
  "last_sync_at" timestamp with time zone,
  "last_error" text,
  "next_retry_at" timestamp with time zone,
  "stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "deleted" boolean DEFAULT false NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "zotero_libraries_user_external_idx" ON "zotero_libraries" ("user_id", "library_type", "library_id");
CREATE INDEX IF NOT EXISTS "zotero_libraries_user_idx" ON "zotero_libraries" ("user_id");

CREATE TABLE IF NOT EXISTS "zotero_collections" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "library_type" text NOT NULL,
  "library_id" text NOT NULL,
  "collection_key" text NOT NULL,
  "parent_collection_key" text,
  "name" text NOT NULL,
  "remote_version" integer DEFAULT 0 NOT NULL,
  "item_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "deleted" boolean DEFAULT false NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "zotero_collections_identity_idx" ON "zotero_collections" ("user_id", "library_type", "library_id", "collection_key");
CREATE INDEX IF NOT EXISTS "zotero_collections_parent_idx" ON "zotero_collections" ("user_id", "library_id", "parent_collection_key");

CREATE TABLE IF NOT EXISTS "zotero_items" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "library_type" text NOT NULL,
  "library_id" text NOT NULL,
  "item_key" text NOT NULL,
  "parent_item_key" text,
  "item_type" text NOT NULL,
  "title" text DEFAULT '' NOT NULL,
  "doi" text,
  "remote_version" integer DEFAULT 0 NOT NULL,
  "collection_keys" text[] DEFAULT '{}' NOT NULL,
  "tags" text[] DEFAULT '{}' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source_id" text REFERENCES "sources"("id"),
  "retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "deleted" boolean DEFAULT false NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "zotero_items_identity_idx" ON "zotero_items" ("user_id", "library_type", "library_id", "item_key");
CREATE INDEX IF NOT EXISTS "zotero_items_user_library_idx" ON "zotero_items" ("user_id", "library_id");
CREATE INDEX IF NOT EXISTS "zotero_items_user_doi_idx" ON "zotero_items" ("user_id", "doi");

CREATE TABLE IF NOT EXISTS "saved_external_entities" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "provider" text NOT NULL,
  "entity_type" text NOT NULL,
  "external_id" text NOT NULL,
  "title" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "deleted" boolean DEFAULT false NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "saved_external_entities_identity_idx" ON "saved_external_entities" ("user_id", "provider", "entity_type", "external_id");
CREATE INDEX IF NOT EXISTS "saved_external_entities_user_type_idx" ON "saved_external_entities" ("user_id", "entity_type");

CREATE TABLE IF NOT EXISTS "external_api_cache" (
  "id" text PRIMARY KEY NOT NULL,
  "provider" text NOT NULL,
  "cache_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "source_updated_at" timestamp with time zone,
  "stale_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "external_api_cache_identity_idx" ON "external_api_cache" ("provider", "cache_key");
CREATE INDEX IF NOT EXISTS "external_api_cache_expiry_idx" ON "external_api_cache" ("expires_at");

CREATE TABLE IF NOT EXISTS "image_extractions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "content_hash" text NOT NULL,
  "source_id" text REFERENCES "sources"("id"),
  "status" text NOT NULL,
  "structure" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "asset_paths" text[] DEFAULT '{}' NOT NULL,
  "injection_detected" boolean DEFAULT false NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "image_extractions_user_hash_idx" ON "image_extractions" ("user_id", "content_hash");
CREATE INDEX IF NOT EXISTS "image_extractions_user_status_idx" ON "image_extractions" ("user_id", "status");
