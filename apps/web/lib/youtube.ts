export type LearningVideo = {
  id: string;
  title: string;
  channelTitle: string;
  description: string;
  publishedAt: string;
  thumbnailUrl?: string;
  watchUrl: string;
  embedUrl: string;
  provider: "youtube";
  reviewState: "provider_result" | "trusted_channel";
};

type YouTubeFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim() : "";
}

function safeThumbnail(value: unknown) {
  if (typeof value !== "string") return undefined;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : undefined; }
  catch { return undefined; }
}

export function youtubeSearchHandoffUrl(query: string) {
  const url = new URL("https://www.youtube.com/results");
  url.searchParams.set("search_query", query.trim());
  return url.toString();
}

export function normalizeYouTubeSearchItem(value: unknown, trustedChannelIds = new Set<string>()): LearningVideo | undefined {
  const item = record(value);
  const id = cleanText(record(item.id).videoId);
  const snippet = record(item.snippet);
  const title = cleanText(snippet.title);
  const channelTitle = cleanText(snippet.channelTitle);
  const channelId = cleanText(snippet.channelId);
  const publishedAt = cleanText(snippet.publishedAt);
  if (!id || !title || !channelTitle || !publishedAt || !/^[\w-]{6,20}$/.test(id)) return undefined;
  const thumbnails = record(snippet.thumbnails);
  const thumbnail = record(thumbnails.high);
  return {
    id,
    title,
    channelTitle,
    description: cleanText(snippet.description),
    publishedAt,
    ...(safeThumbnail(thumbnail.url) ? { thumbnailUrl: safeThumbnail(thumbnail.url) } : {}),
    watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`,
    provider: "youtube",
    reviewState: channelId && trustedChannelIds.has(channelId) ? "trusted_channel" : "provider_result",
  };
}

export class YouTubeProviderError extends Error {
  constructor(message: string, readonly code: "unconfigured" | "timeout" | "quota" | "upstream") { super(message); this.name = "YouTubeProviderError"; }
}

export async function searchLearningVideos(input: { query: string; apiKey?: string; maxResults?: number; trustedChannelIds?: string[] }, fetcher: YouTubeFetch = fetch) {
  if (!input.apiKey?.trim()) throw new YouTubeProviderError("YouTube search needs a YOUTUBE_API_KEY", "unconfigured");
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("key", input.apiKey.trim());
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("q", input.query.trim());
  url.searchParams.set("maxResults", String(Math.min(8, Math.max(1, input.maxResults ?? 6))));
  url.searchParams.set("safeSearch", "strict");
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("videoSyndicated", "true");
  url.searchParams.set("relevanceLanguage", "en");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetcher(url, { signal: controller.signal, cache: "no-store", headers: { accept: "application/json" } });
    if (!response.ok) throw new YouTubeProviderError(`YouTube returned ${response.status}`, response.status === 403 ? "quota" : "upstream");
    const payload = record(await response.json());
    const trusted = new Set((input.trustedChannelIds ?? []).map((value) => value.trim()).filter(Boolean));
    return (Array.isArray(payload.items) ? payload.items : []).map((item) => normalizeYouTubeSearchItem(item, trusted)).filter((video): video is LearningVideo => Boolean(video));
  } catch (error) {
    if (error instanceof YouTubeProviderError) throw error;
    if ((error as { name?: string }).name === "AbortError") throw new YouTubeProviderError("YouTube search timed out", "timeout");
    throw new YouTubeProviderError("YouTube search could not be reached", "upstream");
  } finally { clearTimeout(timeout); }
}
