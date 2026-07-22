import { describe, expect, it, vi } from "vitest";
import { normalizeYouTubeSearchItem, searchLearningVideos, youtubeSearchHandoffUrl, YouTubeProviderError } from "../apps/web/lib/youtube";

describe("learning video retrieval", () => {
  const fixture = { id: { videoId: "abcDEF_1234" }, snippet: { title: "Potential &amp; energy", channelTitle: "Physics Lab", channelId: "channel-trusted", description: "A &quot;clear&quot; lesson", publishedAt: "2025-05-01T00:00:00Z", thumbnails: { high: { url: "https://i.ytimg.com/vi/abcDEF_1234/hqdefault.jpg" } } } };

  it("normalizes search metadata into privacy-enhanced embed and watch URLs", () => {
    expect(normalizeYouTubeSearchItem(fixture, new Set(["channel-trusted"]))).toMatchObject({ id: "abcDEF_1234", title: "Potential & energy", reviewState: "trusted_channel", watchUrl: "https://www.youtube.com/watch?v=abcDEF_1234", embedUrl: "https://www.youtube-nocookie.com/embed/abcDEF_1234" });
  });

  it("uses strict, embeddable video-only official API parameters", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://www.googleapis.com");
      expect(url.searchParams.get("type")).toBe("video");
      expect(url.searchParams.get("safeSearch")).toBe("strict");
      expect(url.searchParams.get("videoEmbeddable")).toBe("true");
      expect(url.searchParams.get("maxResults")).toBe("8");
      return new Response(JSON.stringify({ items: [fixture] }));
    });
    const result = await searchLearningVideos({ query: "electric potential", apiKey: "fixture", maxResults: 99 }, fetcher);
    expect(result).toHaveLength(1);
  });

  it("fails explicitly when unconfigured and provides a search-only handoff", async () => {
    await expect(searchLearningVideos({ query: "electric potential" })).rejects.toEqual(expect.objectContaining<Partial<YouTubeProviderError>>({ code: "unconfigured" }));
    const handoff = new URL(youtubeSearchHandoffUrl("electric potential"));
    expect(handoff.origin).toBe("https://www.youtube.com");
    expect(handoff.searchParams.get("search_query")).toBe("electric potential");
  });
});
