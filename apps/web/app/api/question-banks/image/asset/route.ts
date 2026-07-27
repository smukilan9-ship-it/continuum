import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { enforceRateLimit, getRequestUser } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  extractionId: z.string().min(3).max(200),
  page: z.coerce.number().int().min(1).max(100),
  x: z.coerce.number().min(0).max(1).optional(),
  y: z.coerce.number().min(0).max(1).optional(),
  width: z.coerce.number().min(0.001).max(1).optional(),
  height: z.coerce.number().min(0.001).max(1).optional(),
});

async function cropIfRequested(bytes: Buffer, query: z.infer<typeof querySchema>) {
  if ([query.x, query.y, query.width, query.height].some((value) => value === undefined)) return bytes;
  const image = sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Image dimensions are unavailable");
  const left = Math.max(0, Math.min(metadata.width - 1, Math.floor(query.x! * metadata.width)));
  const top = Math.max(0, Math.min(metadata.height - 1, Math.floor(query.y! * metadata.height)));
  const width = Math.max(1, Math.min(metadata.width - left, Math.ceil(query.width! * metadata.width)));
  const height = Math.max(1, Math.min(metadata.height - top, Math.ceil(query.height! * metadata.height)));
  return image.extract({ left, top, width, height }).png().toBuffer();
}

function responseBody(bytes: Buffer) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "question-image-asset", 180, 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Image asset limit reached" }, { status: 429 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid image asset request" }, { status: 400 });
  const extraction = await getStore(user.id).getImageExtraction(parsed.data.extractionId);
  if (!extraction) return NextResponse.json({ error: "Image asset not found" }, { status: 404 });
  const assetPaths = Array.isArray(extraction.assetPaths) ? extraction.assetPaths.map(String) : [];
  const assetPath = assetPaths[parsed.data.page - 1];
  if (!assetPath) return NextResponse.json({ error: "Image page not found" }, { status: 404 });
  if (assetPath.startsWith("data:image/png;base64,")) {
    const bytes = await cropIfRequested(Buffer.from(assetPath.slice("data:image/png;base64,".length), "base64"), parsed.data);
    return new Response(responseBody(bytes), {
      headers: { "content-type": "image/png", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
    });
  }
  const result = await get(assetPath, { access: "private", abortSignal: AbortSignal.timeout(12_000) });
  if (!result || result.statusCode !== 200) return NextResponse.json({ error: "Image page is temporarily unavailable" }, { status: 503 });
  if ([parsed.data.x, parsed.data.y, parsed.data.width, parsed.data.height].every((value) => value !== undefined)) {
    const original = Buffer.from(await new Response(result.stream).arrayBuffer());
    const cropped = await cropIfRequested(original, parsed.data);
    return new Response(responseBody(cropped), {
      headers: {
        "content-type": "image/png",
        "content-length": String(cropped.byteLength),
        "cache-control": "private, max-age=3600",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
      },
    });
  }
  return new Response(result.stream, {
    headers: {
      "content-type": "image/png",
      "content-length": String(result.blob.size),
      "cache-control": "private, max-age=3600",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
    },
  });
}
