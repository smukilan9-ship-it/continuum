import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { DEMO_USER_ID, NeonRepository, type AuthUser } from "@continuum/db";
export { sameOriginWrite } from "./request-security";

export const SESSION_COOKIE = "continuum_session";
const sessionDurationMs = 30 * 24 * 60 * 60_000;
const dummyPasswordHash = Buffer.alloc(64).toString("base64url");
const dummyPasswordSalt = "continuum-timing-equalization";

export function authTokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function privacySalt() {
  const value = process.env.SESSION_PRIVACY_SALT;
  if (!value && process.env.NODE_ENV === "production") throw new Error("SESSION_PRIVACY_SALT is required in production");
  return value ?? "continuum-local-development";
}

function scryptHash(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derivedKey) => error ? reject(error) : resolve(derivedKey));
  });
}

export function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
}

export function safeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}

export async function createPasswordCredential(password: string) {
  const salt = randomBytes(24).toString("base64url");
  return { salt, passwordHash: (await scryptHash(password, salt)).toString("base64url") };
}

export async function verifyPassword(password: string, salt: string, expected: string) {
  const actual = await scryptHash(password, salt);
  const expectedBuffer = Buffer.from(expected, "base64url");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

export async function registerUser(input: { email: string; password: string; displayName: string; timezone: string; educationLevel?: string }) {
  if (!process.env.DATABASE_URL) throw new Error("Persistent accounts require DATABASE_URL");
  const repo = new NeonRepository();
  const credential = await createPasswordCredential(input.password);
  const id = `user_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  return repo.createUser({ id, email: input.email, displayName: input.displayName, timezone: input.timezone, educationLevel: input.educationLevel, passwordHash: credential.passwordHash, passwordSalt: credential.salt });
}

export async function authenticateUser(email: string, password: string) {
  if (!process.env.DATABASE_URL) return undefined;
  const repo = new NeonRepository();
  const row = await repo.findUserForLogin(email);
  if (!row || (row.credential.lockedUntil && row.credential.lockedUntil > new Date())) {
    await verifyPassword(password, dummyPasswordSalt, dummyPasswordHash);
    return undefined;
  }
  const valid = await verifyPassword(password, row.credential.passwordSalt, row.credential.passwordHash);
  await repo.updateLoginFailure(row.user.id, valid);
  if (!valid) return undefined;
  return { id: row.user.id, email: row.user.email, displayName: row.profile.displayName, timezone: row.profile.timezone, ...(row.profile.educationLevel ? { educationLevel: row.profile.educationLevel } : {}) } satisfies AuthUser;
}

export async function createAppSession(userId: string, request: Request) {
  if (!process.env.DATABASE_URL) return "demo-local-session";
  const repo = new NeonRepository();
  const token = randomBytes(32).toString("base64url");
  const userAgent = request.headers.get("user-agent") ?? "";
  const address = clientAddress(request);
  await repo.createSession({
    id: `session_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
    userId,
    tokenHash: authTokenHash(token),
    expiresAt: new Date(Date.now() + sessionDurationMs).toISOString(),
    userAgent: userAgent.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 300),
    userAgentHash: authTokenHash(userAgent),
    ipHash: authTokenHash(`${privacySalt()}:${address}`),
  });
  return token;
}

export function sessionCookie(token: string, maxAgeSeconds = Math.floor(sessionDurationMs / 1000)) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Priority=High; Max-Age=${maxAgeSeconds}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

function tokenFromCookieHeader(header: string | null) {
  return header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
}

export async function getRequestUser(request: Request): Promise<AuthUser | undefined> {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "production") return undefined;
    return { id: DEMO_USER_ID, email: "maya@continuum.demo", displayName: "Maya Singh", timezone: "Asia/Kolkata", educationLevel: "CBSE Class 12" };
  }
  const token = tokenFromCookieHeader(request.headers.get("cookie"));
  if (!token) return undefined;
  return new NeonRepository().getSession(authTokenHash(decodeURIComponent(token)));
}

export async function getServerUser(): Promise<AuthUser | undefined> {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "production") return undefined;
    return { id: DEMO_USER_ID, email: "maya@continuum.demo", displayName: "Maya Singh", timezone: "Asia/Kolkata", educationLevel: "CBSE Class 12" };
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? new NeonRepository().getSession(authTokenHash(token)) : undefined;
}

export async function revokeAppSession(request: Request) {
  if (!process.env.DATABASE_URL) return;
  const token = tokenFromCookieHeader(request.headers.get("cookie"));
  if (token) await new NeonRepository().revokeSession(authTokenHash(decodeURIComponent(token)));
}

export async function enforceRateLimit(request: Request, namespace: string, limit: number, windowMs: number, discriminator = "") {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100_000, Math.floor(limit))) : 60;
  const safeWindow = Number.isFinite(windowMs) ? Math.max(1_000, Math.min(30 * 24 * 60 * 60_000, Math.floor(windowMs))) : 60_000;
  if (!process.env.DATABASE_URL) return { allowed: true, count: 0, resetAt: new Date(Date.now() + safeWindow).toISOString() };
  const addressHash = authTokenHash(`${privacySalt()}:${clientAddress(request)}`);
  return new NeonRepository().consumeRateLimit(`${namespace}:${addressHash}:${authTokenHash(discriminator.toLowerCase())}`, safeLimit, safeWindow);
}

export async function currentSession(request: Request) {
  if (!process.env.DATABASE_URL) return undefined;
  const token = tokenFromCookieHeader(request.headers.get("cookie"));
  return token ? new NeonRepository().sessionByTokenHash(authTokenHash(decodeURIComponent(token))) : undefined;
}

export function appUserId(user: AuthUser | undefined) {
  if (!user) throw new Error("Unauthorized");
  return user.id;
}
