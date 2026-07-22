import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getRequestUser } from "@/lib/auth";
import { searchLearningVideos, youtubeSearchHandoffUrl, YouTubeProviderError } from "@/lib/youtube";

export const runtime = "nodejs";

const querySchema = z.object({ q: z.string().trim().min(2).max(300) });

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "learning-video-search", 20, 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Video search limit reached. Try again in a minute." }, { status: 429 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Enter a topic with at least two characters." }, { status: 400 });
  const handoffUrl = youtubeSearchHandoffUrl(parsed.data.q);
  try {
    const videos = await searchLearningVideos({
      query: parsed.data.q,
      apiKey: process.env.YOUTUBE_API_KEY,
      trustedChannelIds: (process.env.YOUTUBE_TRUSTED_CHANNEL_IDS ?? "").split(","),
    });
    return NextResponse.json({ videos, status: "live", handoffUrl, note: "YouTube provider results are not curriculum claims. Trusted-channel badges require an operator allowlist." });
  } catch (error) {
    const known = error instanceof YouTubeProviderError ? error : new YouTubeProviderError("YouTube search failed", "upstream");
    return NextResponse.json({ videos: [], status: known.code === "unconfigured" ? "unconfigured" : "failed", message: known.message, handoffUrl, note: "Use the search handoff to review results directly on YouTube." });
  }
}
