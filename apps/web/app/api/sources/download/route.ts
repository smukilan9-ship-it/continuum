import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { enforceRateLimit, getRequestUser } from "@/lib/auth";
import { logRequestFailure } from "@/lib/api-errors";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

/**
 * §13.2 "Download" — streams back the original file a source was created from.
 *
 * The Library menu carried a disabled Download for want of this route. The
 * blob is stored `access: "private"` and its `storage_path` is stripped from
 * every listing by `publicSourceMetadata`, so the browser has no URL it could
 * fetch itself; the path is resolved here, server-side, from a source the
 * caller demonstrably owns, and only the bytes cross back.
 *
 * Not every source has one. Pasted text, Zotero metadata and anything ingested
 * while the blob store was unreachable were only ever indexed as passages —
 * those return 404 with the reason, and the menu disables the item with the
 * same sentence, rather than offering a button that breaks.
 */
export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "source-download", Number(process.env.SOURCE_DOWNLOADS_PER_HOUR ?? 120), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Source download rate limit exceeded" }, { status: 429, headers: { "retry-after": "3600" } });

  const sourceId = new URL(request.url).searchParams.get("sourceId");
  if (!sourceId || sourceId.length > 200) return NextResponse.json({ error: "A valid sourceId is required" }, { status: 400 });

  const source = await getStore(user.id).getSourceOriginal(sourceId);
  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });
  if (!source.storagePath) {
    return NextResponse.json({ error: "Continuum indexed this source's text but did not keep an original file to download.", code: "no_original" }, { status: 404 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN && !(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)) {
    return NextResponse.json({ error: "File storage is not configured on this deployment, so originals cannot be served.", code: "storage_unconfigured" }, { status: 503 });
  }

  try {
    const blob = await get(source.storagePath, { access: "private" });
    if (!blob?.stream) return NextResponse.json({ error: "The stored original is no longer available.", code: "no_original" }, { status: 404 });
    // A quoted ASCII fallback plus RFC 5987 UTF-8, because a source title is a
    // filename the person chose and may hold anything.
    const asciiName = source.title.replace(/["\\\r\n]/g, "").replace(/[^\x20-\x7e]/g, "_") || "source";
    return new Response(blob.stream, {
      headers: {
        "content-type": blob.blob?.contentType || source.mimeType || "application/octet-stream",
        "content-disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(source.title)}`,
        ...(blob.blob?.size ? { "content-length": String(blob.blob.size) } : {}),
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    logRequestFailure("source_download_failed", { sourceId }, error);
    return NextResponse.json({ error: "The stored original could not be read. Your source and its passages are unaffected.", code: "storage_unavailable" }, { status: 502 });
  }
}
