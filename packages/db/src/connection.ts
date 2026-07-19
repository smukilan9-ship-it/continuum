export function securePostgresConnectionString(value: string) {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL must use the PostgreSQL protocol");
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if (!loopback) url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
