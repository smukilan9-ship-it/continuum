import { NextResponse } from "next/server";
import { environmentStatus } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET() {
  const status = environmentStatus();
  return NextResponse.json({ status: status.ready ? "ready" : "misconfigured", ...(process.env.NODE_ENV === "production" ? {} : { services: status.services, errors: status.errors }) }, { status: status.ready ? 200 : 503, headers: { "cache-control": "no-store" } });
}
