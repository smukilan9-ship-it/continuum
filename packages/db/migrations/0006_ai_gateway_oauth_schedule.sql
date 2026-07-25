ALTER TABLE "model_usage"
  ADD COLUMN IF NOT EXISTS "feature" text DEFAULT 'unknown' NOT NULL,
  ADD COLUMN IF NOT EXISTS "estimated_cost_usd" real DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS "model_usage_user_time_idx"
  ON "model_usage" USING btree ("user_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "model_usage_time_idx"
  ON "model_usage" USING btree ("occurred_at");

CREATE TABLE IF NOT EXISTS "ai_request_leases" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "feature" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ai_request_leases_expiry_idx"
  ON "ai_request_leases" USING btree ("expires_at");
CREATE INDEX IF NOT EXISTS "ai_request_leases_user_idx"
  ON "ai_request_leases" USING btree ("user_id");

CREATE TABLE IF NOT EXISTS "oauth_connections" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "client_id" text NOT NULL,
  "client_name" text NOT NULL,
  "scopes" text[] DEFAULT '{}' NOT NULL,
  "connected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_connections_user_client_idx"
  ON "oauth_connections" USING btree ("user_id", "client_id");
CREATE INDEX IF NOT EXISTS "oauth_connections_user_idx"
  ON "oauth_connections" USING btree ("user_id");

ALTER TABLE "schedule_blocks"
  ADD COLUMN IF NOT EXISTS "flexible" boolean DEFAULT true NOT NULL;
