import type { RunType, ScrapedItem, SourceResult } from "../types.js";
import { getUserConfig } from "../user-config.js";

const BASE = "https://www.googleapis.com/youtube/v3";

/** Region-based: most popular videos in the user's country */
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
    const region = getUserConfig().region;
    const res = await fetch(
      `${BASE}/videos?part=snippet,statistics&chart=mostPopular&regionCode=${region}&maxResults=${maxResults}&key=${apiKey}`,
      { signal: AbortSignal.timeout(15_000) }
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

/** Topic-based: search YouTube for user's keywords */
export async function collectByKeywords(runType: RunType): Promise<SourceResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return {
      source: "YouTube Search",
      status: "skipped",
      error: "YOUTUBE_API_KEY not set",
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }

  const config = getUserConfig();
  const keywords = config.keywords.length > 0 ? config.keywords : [config.niche];
  const query = keywords.slice(0, 3).join(" OR ");

  if (!query) {
    return {
      source: "YouTube Search",
      status: "skipped",
      error: "No keywords configured",
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }

  try {
    const maxResults = runType === "pulse" ? 10 : 20;
    const region = getUserConfig().region;

    // Search for videos matching user's keywords, sorted by view count in last 24h
    const res = await fetch(
      `${BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=video&regionCode=${region}&maxResults=${maxResults}&order=viewCount&publishedAfter=${recentDate()}&key=${apiKey}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) throw new Error(`YouTube Search API returned ${res.status}`);
    const data = await res.json();

    const videoIds = (data.items ?? []).map((v: any) => v.id.videoId).filter(Boolean);
    if (videoIds.length === 0) {
      return {
        source: "YouTube Search",
        status: "ok",
        items: [],
        scrapedAt: new Date().toISOString(),
      };
    }

    // Fetch stats for all found videos
    const statsRes = await fetch(
      `${BASE}/videos?part=statistics&id=${videoIds.join(",")}&key=${apiKey}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    const statsData = statsRes.ok ? await statsRes.json() : { items: [] };
    const statsMap = new Map<string, any>();
    for (const v of statsData.items ?? []) {
      statsMap.set(v.id, v.statistics);
    }

    const items: ScrapedItem[] = (data.items ?? []).map((v: any) => {
      const stats = statsMap.get(v.id.videoId);
      return {
        title: v.snippet.title,
        url: `https://www.youtube.com/watch?v=${v.id.videoId}`,
        description: v.snippet.channelTitle,
        views: Number(stats?.viewCount ?? 0),
        comments: Number(stats?.commentCount ?? 0),
        publishedAt: v.snippet.publishedAt,
        category: `search:${query}`,
      };
    });

    return {
      source: "YouTube Search",
      status: "ok",
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: "YouTube Search",
      status: "error",
      error: String(e),
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }
}

function recentDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 3); // last 3 days
  return d.toISOString();
}
