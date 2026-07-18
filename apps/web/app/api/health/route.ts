import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ status: "ok", service: "continuum", runtime: "nodejs", mcp: "/api/mcp", timestamp: new Date().toISOString() });
}
