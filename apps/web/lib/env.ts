import { z } from "zod";

const productionSchema = z.object({
  DATABASE_URL: z.string().url().refine((value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol), "DATABASE_URL must use the PostgreSQL protocol"),
  DATABASE_URL_UNPOOLED: z.string().url().refine((value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol), "DATABASE_URL_UNPOOLED must use the PostgreSQL protocol").optional(),
  APP_BASE_URL: z.string().url()
    .refine((value) => value.startsWith("https://"), "APP_BASE_URL must use HTTPS in production")
    .refine((value) => { const url = new URL(value); return url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password; }, "APP_BASE_URL must be an origin without a path, credentials, query, or fragment"),
  MCP_OAUTH_ISSUER_URL: z.string().url().refine((value) => value.startsWith("https://"), "MCP_OAUTH_ISSUER_URL must use HTTPS in production").optional(),
  MCP_JWT_SIGNING_SECRET: z.string().min(32),
  SESSION_PRIVACY_SALT: z.string().min(16),
  EMBEDDING_DIMENSIONS: z.literal("1536").default("1536"),
}).passthrough();

export function applicationBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercelHost = env.VERCEL_URL?.trim() || env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercelHost ? `https://${vercelHost.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : undefined;
}

export function publicRegistrationEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production" || env.PUBLIC_REGISTRATION_ENABLED === "true";
}

export function environmentStatus(env: NodeJS.ProcessEnv = process.env) {
  const errors: string[] = [];
  if (env.NODE_ENV === "production") {
    const parsed = productionSchema.safeParse({ ...env, APP_BASE_URL: applicationBaseUrl(env), DATABASE_URL_UNPOOLED: env.DATABASE_URL_UNPOOLED || undefined, MCP_OAUTH_ISSUER_URL: env.MCP_OAUTH_ISSUER_URL || undefined });
    if (!parsed.success) errors.push(...parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
    const gemini = env.GEMINI_DATA_USE_ACKNOWLEDGED === "true" && Boolean(env.GEMINI_API_KEY || env.GEMINI_API_KEYS || env.GEMINI_API_KEY_1);
    const gateway = env.AI_GATEWAY_ENABLED === "true" && Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN);
    const ollama = Boolean(env.OLLAMA_BASE_URL);
    if (!env.FEATHERLESS_API_KEY && !env.GROQ_API_KEY && !gateway && !ollama && !gemini) errors.push("At least one model provider must be configured");
    if (!(env.FEATHERLESS_API_KEY && env.FEATHERLESS_EMBEDDING_MODEL) && !gateway && !(env.OLLAMA_BASE_URL && env.OLLAMA_EMBEDDING_MODEL) && !gemini) errors.push("At least one configured 1536-dimensional embedding provider must be configured");
    if (env.MCP_JWT_SIGNING_SECRET && env.SESSION_PRIVACY_SALT && env.MCP_JWT_SIGNING_SECRET === env.SESSION_PRIVACY_SALT) errors.push("MCP_JWT_SIGNING_SECRET and SESSION_PRIVACY_SALT must be distinct");
  }
  return {
    ready: errors.length === 0,
    errors,
    services: {
      database: Boolean(env.DATABASE_URL),
      privateBlob: Boolean(env.BLOB_READ_WRITE_TOKEN || (env.BLOB_STORE_ID && env.VERCEL_OIDC_TOKEN)),
      mcpOAuth: Boolean(env.MCP_JWT_SIGNING_SECRET),
      featherless: Boolean(env.FEATHERLESS_API_KEY),
      groq: Boolean(env.GROQ_API_KEY),
      geminiKeys: Boolean(env.GEMINI_API_KEY || env.GEMINI_API_KEYS || env.GEMINI_API_KEY_1),
      geminiDataUseAcknowledged: env.GEMINI_DATA_USE_ACKNOWLEDGED === "true",
      ollamaServer: Boolean(env.OLLAMA_BASE_URL),
    },
  };
}

export function assertProductionEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const status = environmentStatus(env);
  if (!status.ready) throw new Error(`Production environment is incomplete: ${status.errors.join("; ")}`);
  return status;
}
