import { randomUUID } from "node:crypto";
import { NeonRepository } from "@continuum/db";
import { openCredential, sealCredential } from "@/lib/credential-vault";

const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const calendarApi = "https://www.googleapis.com/calendar/v3";

export const googleCalendarScopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.events.owned",
] as const;

export type GoogleCalendarCredential = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
  lastSyncAt?: string;
  pushedBlockIds?: string[];
};

function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google Calendar connection is not configured yet");
  return { clientId, clientSecret };
}

export function googleCalendarConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.DATABASE_URL);
}

export function googleRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/connections/google/callback`;
}

export function googleAuthorizationUrl(input: { origin: string; state: string; loginHint?: string }) {
  const { clientId } = googleConfig();
  const parameters = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(input.origin),
    response_type: "code",
    scope: googleCalendarScopes.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: input.state,
  });
  if (input.loginHint) parameters.set("login_hint", input.loginHint);
  return `${authorizationEndpoint}?${parameters}`;
}

export async function exchangeGoogleCode(input: { code: string; origin: string }) {
  const config = googleConfig();
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: input.code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: googleRedirectUri(input.origin), grant_type: "authorization_code" }),
    cache: "no-store",
  });
  const payload = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !payload.access_token || !payload.refresh_token) throw new Error(payload.error_description ?? "Google did not return a renewable calendar connection");
  return { accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 };
}

async function refreshGoogleToken(refreshToken: string) {
  const config = googleConfig();
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token" }),
    cache: "no-store",
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description ?? "Google Calendar access needs to be reconnected");
  return { accessToken: payload.access_token, expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 };
}

export async function googleCredential(userId: string) {
  const repo = new NeonRepository();
  const integration = await repo.getIntegration(userId, "google-calendar");
  if (!integration) throw new Error("Google Calendar is not connected");
  let credential = openCredential<GoogleCalendarCredential>(integration.encryptedCredentials);
  if (credential.expiresAt <= Date.now() + 60_000) {
    const refreshed = await refreshGoogleToken(credential.refreshToken);
    credential = { ...credential, ...refreshed };
    await repo.upsertIntegration({ id: integration.id, userId, provider: "google-calendar", encryptedCredentials: sealCredential(credential), scopes: integration.scopes });
  }
  return { repo, integration, credential };
}

export async function googleApi<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${calendarApi}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? `Google Calendar returned ${response.status}`);
  return payload;
}

export async function googleAccountEmail(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as { email?: string };
  return response.ok ? payload.email : undefined;
}

export function newGoogleIntegrationId() {
  return `integration_google_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

