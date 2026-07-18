import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";

export function createDatabase(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is required for persistent database access");
  const client = postgres(url, { prepare: false, max: 1 });
  return drizzle(client, { schema });
}
