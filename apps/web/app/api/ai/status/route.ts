import { NextResponse } from "next/server";
import { configuredProviders, providerHealth } from "@continuum/ai";
import { enforceRateLimit, getRequestUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * Live AI provider health. Runs short real probes (cached ~30s) so the UI shows
 * the truth — which providers are healthy, degraded, or unavailable right now,
 * and which concrete model each is currently using — instead of assuming a
 * configured key means a working route.
 */
export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "ai-status", Number(process.env.AI_STATUS_REQUESTS_PER_MINUTE ?? 20), 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "AI status rate limit exceeded", resetAt: rate.resetAt }, { status: 429, headers: { "retry-after": "60" } });

  const configured = configuredProviders();
  let reports;
  try {
    reports = await providerHealth();
  } catch (error) {
    return NextResponse.json({ error: "Provider health probe failed", detail: error instanceof Error ? error.message : "unknown" }, { status: 502 });
  }
  const anyHealthy = reports.some((report) => report.status === "healthy");
  return NextResponse.json(
    { status: anyHealthy ? "operational" : "degraded", configured, providers: reports, checkedAt: new Date().toISOString() },
    { headers: { "cache-control": "private, no-store" } },
  );
}
