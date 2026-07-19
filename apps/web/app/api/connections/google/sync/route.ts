import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { sealCredential } from "@/lib/credential-vault";
import { googleApi, googleCredential } from "@/lib/google-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type GoogleEvent = { id?: string; summary?: string; status?: string; transparency?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; extendedProperties?: { private?: Record<string, string> } };

function stableEventId(value: string) {
  return `google_${createHash("sha256").update(value).digest("hex").slice(0, 28)}`;
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin calendar sync is not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "google-calendar-sync", 12, 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Calendar sync is temporarily rate limited" }, { status: 429, headers: { "retry-after": "3600" } });
  try {
    const { repo, integration, credential } = await googleCredential(user.id);
    const now = new Date();
    const query = new URLSearchParams({ timeMin: new Date(now.getTime() - 24 * 60 * 60_000).toISOString(), timeMax: new Date(now.getTime() + 180 * 24 * 60 * 60_000).toISOString(), singleEvents: "true", showDeleted: "false", maxResults: "2500", orderBy: "startTime" });
    const eventPage = await googleApi<{ items?: GoogleEvent[] }>(credential.accessToken, `/calendars/primary/events?${query}`);
    const external = (eventPage.items ?? []).filter((event) => event.id && event.status !== "cancelled" && event.transparency !== "transparent" && !event.extendedProperties?.private?.continuumBlockId && event.start?.dateTime && event.end?.dateTime).map((event) => ({ id: stableEventId(event.id!), title: event.summary?.slice(0, 200) || "Busy", startsAt: event.start!.dateTime!, endsAt: event.end!.dateTime! }));
    await repo.replaceCalendarConstraints(user.id, "google", external);

    const state = await repo.getWorkspaceSnapshot(user.id, "today") as Record<string, unknown>;
    const tasks = new Map(((state.tasks as Array<{ id: string; title: string }> | undefined) ?? []).map((task) => [task.id, task.title]));
    const remotelyPresent = (eventPage.items ?? []).map((event) => event.extendedProperties?.private?.continuumBlockId).filter((value): value is string => Boolean(value));
    const pushed = new Set([...(credential.pushedBlockIds ?? []), ...remotelyPresent]);
    let exported = 0;
    for (const block of ((state.schedule as Array<{ id: string; taskId: string; start: string | Date; end: string | Date; committedAt?: string | Date | null; status?: string }> | undefined) ?? []).filter((item) => item.committedAt && !pushed.has(item.id)).slice(0, 40)) {
      await googleApi(credential.accessToken, "/calendars/primary/events", { method: "POST", body: JSON.stringify({ summary: tasks.get(block.taskId) ?? "Continuum study block", description: "Planned in Continuum. Progress stays in your Continuum academic memory.", start: { dateTime: new Date(block.start).toISOString() }, end: { dateTime: new Date(block.end).toISOString() }, extendedProperties: { private: { continuumBlockId: block.id } } }) });
      pushed.add(block.id);
      exported += 1;
    }
    const lastSyncAt = new Date().toISOString();
    await repo.upsertIntegration({ id: integration.id, userId: user.id, provider: "google-calendar", encryptedCredentials: sealCredential({ ...credential, pushedBlockIds: [...pushed].slice(-1000), lastSyncAt }), scopes: integration.scopes });
    return NextResponse.json({ imported: external.length, exported, lastSyncAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Calendar sync failed" }, { status: 502 });
  }
}
