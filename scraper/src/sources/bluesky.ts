import type { RunType, ScrapedItem, SourceResult } from "../types.js";

const BASE = "https://public.api.bsky.app/xrpc";

export async function collect(_runType: RunType): Promise<SourceResult> {
  const items: ScrapedItem[] = [];

  try {
    // Trending topics
    const trendingRes = await fetch(`${BASE}/app.bsky.unspecced.getTrendingTopics`);
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

    // Also search for popular recent posts about tech/crypto
    const queries = ["AI", "crypto", "tech"];
    for (const q of queries) {
      try {
        const searchRes = await fetch(
          `${BASE}/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&sort=top&limit=5`
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
