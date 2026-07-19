import { NeonRepository } from "@continuum/db";
import { NextResponse } from "next/server";
import { getRequestUser, sameOriginWrite } from "@/lib/auth";
import { openCredential } from "@/lib/credential-vault";
import type { GoogleCalendarCredential } from "@/lib/google-calendar";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin disconnect is not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const repo = new NeonRepository();
  const connection = await repo.getIntegration(user.id, "google-calendar");
  if (connection?.encryptedCredentials) {
    try {
      const credential = openCredential<GoogleCalendarCredential>(connection.encryptedCredentials);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(credential.refreshToken)}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" } });
    } catch { /* Local revocation remains authoritative even if Google is unavailable. */ }
  }
  return NextResponse.json({ disconnected: await repo.revokeIntegration(user.id, "google-calendar") });
}
