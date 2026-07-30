import { DELETE as apiDelete, GET as apiGet, OPTIONS as apiOptions, POST as apiPost } from "@/app/api/mcp/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) { return apiGet(request); }
export async function POST(request: Request) { return apiPost(request); }
export async function DELETE(request: Request) { return apiDelete(request); }
export function OPTIONS(request: Request) { return apiOptions(request); }
