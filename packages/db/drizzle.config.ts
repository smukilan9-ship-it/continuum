import { defineConfig } from "drizzle-kit";
import { securePostgresConnectionString } from "./src/connection";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/continuum";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: securePostgresConnectionString(databaseUrl) },
});
