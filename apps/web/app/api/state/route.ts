import { NextResponse } from "next/server";
import { demoStore } from "@/lib/demo-store";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ data: demoStore, freshness: new Date().toISOString() });
}
