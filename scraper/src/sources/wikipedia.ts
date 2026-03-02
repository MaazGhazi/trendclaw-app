import type { RunType, ScrapedItem, SourceResult } from "../types.js";

// Wikipedia Pageviews API - most viewed articles = what people are searching for
const BASE = "https://wikimedia.org/api/rest_v1/metrics/pageviews";

export async function collect(_runType: RunType): Promise<SourceResult> {
  async function attempt(): Promise<SourceResult> {
    // Get yesterday's most viewed (today's data isn't complete yet)
    const now = new Date();
    const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    const year = yesterday.getUTCFullYear();
    const month = String(yesterday.getUTCMonth() + 1).padStart(2, "0");
    const day = String(yesterday.getUTCDate()).padStart(2, "0");
    const dateStr = `${year}/${month}/${day}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(
        `${BASE}/top/en.wikipedia/all-access/${dateStr}`,
        {
          headers: { "User-Agent": "TrendClaw/1.0 (trend monitoring)" },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

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
      clearTimeout(timeout);
      throw e;
    }
  }

  // Try once, retry once on failure with 1s delay
  try {
    return await attempt();
  } catch (firstError) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      return await attempt();
    } catch (retryError) {
      return {
        source: "Wikipedia Most Viewed",
        status: "error",
        error: `Failed after retry: ${String(retryError)}`,
        items: [],
        scrapedAt: new Date().toISOString(),
      };
    }
  }
}
