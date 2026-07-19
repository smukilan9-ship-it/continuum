import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "./schema";
import { securePostgresConnectionString } from "./connection";

export function createDatabase(url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is required for persistent database access");
  const configuredMax = Number(process.env.DATABASE_POOL_MAX ?? 5);
  const pool = new Pool({
    connectionString: securePostgresConnectionString(url),
    max: Number.isFinite(configuredMax) ? Math.max(1, Math.min(20, Math.floor(configuredMax))) : 5,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 8_000,
  });
  if (process.env.VERCEL) attachDatabasePool(pool);
  return drizzle({ client: pool, schema });
}

let database: ReturnType<typeof createDatabase> | undefined;

export function getDatabase() {
  database ??= createDatabase();
  return database;
}

export async function closeDatabase() {
  if (!database) return;
  await database.$client.end();
  database = undefined;
}
