WITH "ranked_integrations" AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "user_id", "provider" ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC) AS "position"
  FROM "integrations"
)
DELETE FROM "integrations" WHERE "id" IN (SELECT "id" FROM "ranked_integrations" WHERE "position" > 1);

CREATE UNIQUE INDEX IF NOT EXISTS "integrations_user_provider_idx" ON "integrations" USING btree ("user_id", "provider");
