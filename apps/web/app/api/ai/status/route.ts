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
  } catch {
    return NextResponse.json({ error: "Provider health probe failed" }, { status: 502 });
  }
  const anyHealthy = reports.some((report) => report.status === "healthy");
  const publicReports = reports.map((report) => ({
    provider: report.provider,
    configured: report.configured,
    status: report.status,
    ...(report.model ? { model: report.model } : {}),
    ...(typeof report.latencyMs === "number" ? { latencyMs: report.latencyMs } : {}),
    checkedAt: report.checkedAt,
    ...(report.capabilities ? { capabilities: report.capabilities } : {}),
    ...(report.credentialHealth ? {
      credentialHealth: report.credentialHealth.map((credential) => ({
        id: credential.id,
        status: credential.status,
        inFlight: credential.inFlight,
        failures: credential.failures,
        lastStatus: credential.lastStatus,
        retryAfter: credential.retryAfter,
      })),
    } : {}),
    detail: report.status === "healthy" ? "Available" : report.status === "degraded" ? "Temporarily limited" : report.status === "not_configured" ? "Not configured" : "Temporarily unavailable",
  }));
  return NextResponse.json(
    { status: anyHealthy ? "operational" : "degraded", configured, providers: publicReports, checkedAt: new Date().toISOString() },
    { headers: { "cache-control": "private, no-store" } },
  );
}
