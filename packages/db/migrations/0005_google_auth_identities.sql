CREATE TABLE IF NOT EXISTS "auth_identities" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "provider" text NOT NULL,
  "subject" text NOT NULL,
  "email" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "auth_identities_provider_subject_idx" ON "auth_identities" USING btree ("provider", "subject");
CREATE UNIQUE INDEX IF NOT EXISTS "auth_identities_user_provider_idx" ON "auth_identities" USING btree ("user_id", "provider");
