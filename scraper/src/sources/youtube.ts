import type { RunType, ScrapedItem, SourceResult } from "../types.js";

const BASE = "https://www.googleapis.com/youtube/v3";

export async function collect(runType: RunType): Promise<SourceResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return {
      source: "YouTube Trending",
      status: "skipped",
      error: "YOUTUBE_API_KEY not set",
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }

  try {
    const maxResults = runType === "pulse" ? 10 : 20;
    const res = await fetch(
      `${BASE}/videos?part=snippet,statistics&chart=mostPopular&regionCode=US&maxResults=${maxResults}&key=${apiKey}`
    );
    if (!res.ok) throw new Error(`YouTube API returned ${res.status}`);
    const data = await res.json();

    const items: ScrapedItem[] = (data.items ?? []).map((v: any) => ({
      title: v.snippet.title,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      description: v.snippet.channelTitle,
      views: Number(v.statistics?.viewCount ?? 0),
      comments: Number(v.statistics?.commentCount ?? 0),
      category: v.snippet.categoryId,
      publishedAt: v.snippet.publishedAt,
    }));

    return {
      source: "YouTube Trending",
      status: "ok",
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: "YouTube Trending",
      status: "error",
      error: String(e),
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }
}
