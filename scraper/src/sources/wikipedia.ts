import type { RunType, ScrapedItem, SourceResult } from "../types.js";

// Wikipedia Pageviews API - most viewed articles = what people are searching for
const BASE = "https://wikimedia.org/api/rest_v1/metrics/pageviews";

export async function collect(_runType: RunType): Promise<SourceResult> {
  try {
    // Get yesterday's most viewed (today's data isn't complete yet)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10).replace(/-/g, "/");

    const res = await fetch(
      `${BASE}/top/en.wikipedia/all-access/${dateStr}`,
      { headers: { "User-Agent": "TrendClaw/1.0 (trend monitoring)" } }
    );
    if (!res.ok) throw new Error(`Wikipedia API returned ${res.status}`);
    const data = await res.json();

    const articles = data.items?.[0]?.articles ?? [];
    // Filter out Main_Page and Special: pages
    const items: ScrapedItem[] = articles
      .filter((a: any) => !a.article.startsWith("Special:") && a.article !== "Main_Page")
      .slice(0, 25)
      .map((a: any) => ({
        title: a.article.replace(/_/g, " "),
        url: `https://en.wikipedia.org/wiki/${a.article}`,
        views: a.views,
        rank: a.rank,
      }));

    return {
      source: "Wikipedia Most Viewed",
      status: "ok",
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: "Wikipedia Most Viewed",
      status: "error",
      error: String(e),
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }
}
