import { getDatabase, sql } from "@continuum/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import { normalizeAssistantDefaults } from "@/components/settings/assistant-defaults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Settings › Privacy and Settings › Account, persisted.
 *
 * It lived at `/account/preferences` — a route handler inside the page tree,
 * which the §16.1 move turned into a redirect target. It belongs under
 * `/api` with every other endpoint.
 *
 * `profiles.preferences` is already `jsonb` with a `{}` default, so the four
 * assistant-source switches and the identity fields need no migration — they are
 * merged into the object that is already there rather than replacing it, which
 * is what would silently drop the onboarding intake stored under the same key.
 */

const bodySchema = z.object({
  assistantDefaults: z.object({
    sources: z.boolean(),
    obsidian: z.boolean(),
    zotero: z.boolean(),
    code: z.boolean(),
  }).partial().optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
  educationLevel: z.string().trim().max(80).optional(),
});

type ProfileRow = { preferences: Record<string, unknown> | null; display_name: string; education_level: string | null; email: string; email_verified_at: string | null };

async function readProfile(userId: string) {
  const result = await getDatabase().execute(sql`
    select p.preferences, p.display_name, p.education_level, u.email, u.email_verified_at
    from profiles p join users u on u.id = p.user_id
    where p.user_id = ${userId} and p.deleted = false
    limit 1
  `);
  return (result.rows as ProfileRow[])[0];
}

function body(profile: ProfileRow | undefined, fallbackName: string) {
  return {
    account: {
      displayName: profile?.display_name ?? fallbackName,
      educationLevel: profile?.education_level ?? "",
      email: profile?.email ?? "",
      emailVerified: Boolean(profile?.email_verified_at),
    },
    assistantDefaults: normalizeAssistantDefaults((profile?.preferences as { assistantDefaults?: unknown } | null)?.assistantDefaults),
  };
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json(body(undefined, user.displayName), { headers: { "cache-control": "private, no-store" } });
  const profile = await readProfile(user.id);
  return NextResponse.json(body(profile, user.displayName), { headers: { "cache-control": "private, no-store" } });
}

export async function PUT(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin preference writes are not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "settings-preferences", 60, 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Too many changes at once. Try again shortly." }, { status: 429 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Check the values and try again" }, { status: 400 });
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Continuum cannot save preferences until persistent storage is configured." }, { status: 503 });
  }

  const profile = await readProfile(user.id);
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const nextPreferences = {
    ...(profile.preferences ?? {}),
    assistantDefaults: {
      ...normalizeAssistantDefaults((profile.preferences as { assistantDefaults?: unknown } | null)?.assistantDefaults),
      ...(parsed.data.assistantDefaults ?? {}),
    },
  };
  const displayName = parsed.data.displayName ?? profile.display_name;
  const educationLevel = parsed.data.educationLevel === undefined
    ? profile.education_level
    : parsed.data.educationLevel || null;

  await getDatabase().execute(sql`
    update profiles
    set preferences = ${JSON.stringify(nextPreferences)}::jsonb,
        display_name = ${displayName},
        education_level = ${educationLevel},
        updated_at = now()
    where user_id = ${user.id} and deleted = false
  `);

  return NextResponse.json(body({ ...profile, preferences: nextPreferences, display_name: displayName, education_level: educationLevel }, user.displayName), {
    headers: { "cache-control": "no-store" },
  });
}
