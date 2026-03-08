import type { RunType, ScrapedItem, SourceResult } from "../types.js";
import { getUserConfig } from "../user-config.js";

const BASE = "https://public.api.bsky.app/xrpc";

/** Global: trending topics on Bluesky */
export async function collect(_runType: RunType): Promise<SourceResult> {
  const items: ScrapedItem[] = [];

  try {
    // Trending topics
    const trendingRes = await fetch(`${BASE}/app.bsky.unspecced.getTrendingTopics`, { signal: AbortSignal.timeout(15_000) });
    if (trendingRes.ok) {
      const data = await trendingRes.json();
      for (const topic of data.topics ?? []) {
        items.push({
          title: topic.topic ?? topic.displayName,
          description: topic.description ?? topic.displayName,
          url: `https://bsky.app/search?q=${encodeURIComponent(topic.topic ?? topic.displayName)}`,
          category: "trending_topic",
        });
      }
    }

    // Also search for popular recent posts about tech/crypto (generic fallback)
    const queries = ["AI", "crypto", "tech"];
    for (const q of queries) {
      try {
        const searchRes = await fetch(
          `${BASE}/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&sort=top&limit=5`,
          { signal: AbortSignal.timeout(15_000) }
        );
        if (searchRes.ok) {
          const data = await searchRes.json();
          for (const post of data.posts ?? []) {
            items.push({
              title: (post.record?.text ?? "").slice(0, 120),
              url: `https://bsky.app/profile/${post.author?.handle}/post/${post.uri?.split("/").pop()}`,
              description: `@${post.author?.handle}`,
              score: post.likeCount ?? 0,
              comments: post.replyCount ?? 0,
              extra: { reposts: post.repostCount ?? 0 },
              category: q.toLowerCase(),
            });
          }
        }
      } catch {
        // Individual query failure is ok
      }
    }

    return {
      source: "Bluesky",
      status: items.length > 0 ? "ok" : "error",
      error: items.length === 0 ? "No data returned" : undefined,
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: "Bluesky",
      status: "error",
      error: String(e),
      items,
      scrapedAt: new Date().toISOString(),
    };
  }
}

/** Topic-based: search Bluesky for user's keywords */
export async function collectByKeywords(_runType: RunType): Promise<SourceResult> {
  const config = getUserConfig();
  const keywords = config.keywords.length > 0 ? config.keywords : [config.niche];

  if (keywords.length === 0 || (keywords.length === 1 && !keywords[0])) {
    return {
      source: "Bluesky Keywords",
      status: "skipped",
      error: "No keywords configured",
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }

  const items: ScrapedItem[] = [];

  try {
    for (const keyword of keywords.slice(0, 5)) {
      try {
        const searchRes = await fetch(
          `${BASE}/app.bsky.feed.searchPosts?q=${encodeURIComponent(keyword)}&sort=top&limit=10`,
          { signal: AbortSignal.timeout(15_000) }
        );
        if (searchRes.ok) {
          const data = await searchRes.json();
          for (const post of data.posts ?? []) {
            items.push({
              title: (post.record?.text ?? "").slice(0, 120),
              url: `https://bsky.app/profile/${post.author?.handle}/post/${post.uri?.split("/").pop()}`,
              description: `@${post.author?.handle}`,
              score: post.likeCount ?? 0,
              comments: post.replyCount ?? 0,
              extra: { reposts: post.repostCount ?? 0, keyword },
              category: keyword,
            });
          }
        }
      } catch {
        // Individual keyword failure is ok
      }
    }

    return {
      source: "Bluesky Keywords",
      status: items.length > 0 ? "ok" : "error",
      error: items.length === 0 ? "No results for keywords" : undefined,
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: "Bluesky Keywords",
      status: "error",
      error: String(e),
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }
}
