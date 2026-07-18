import { revokeToken } from "@/lib/oauth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const form = await request.formData();
  try { revokeToken(String(form.get("token") ?? "")); } catch { /* OAuth revocation is intentionally idempotent. */ }
  return new NextResponse(null, { status: 200, headers: { "cache-control": "no-store" } });
}
