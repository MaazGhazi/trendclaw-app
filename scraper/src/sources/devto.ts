import type { RunType, ScrapedItem, SourceResult } from "../types.js";

export async function collect(runType: RunType): Promise<SourceResult> {
  try {
    const perPage = runType === "pulse" ? 10 : 20;
    const res = await fetch(
      `https://dev.to/api/articles?top=1&per_page=${perPage}`,
      { headers: { "User-Agent": "TrendClaw/1.0" } }
    );
    if (!res.ok) throw new Error(`Dev.to API returned ${res.status}`);
    const articles = await res.json();

    const items: ScrapedItem[] = articles.map((a: any) => ({
      title: a.title,
      url: a.url,
      description: a.description,
      score: a.public_reactions_count,
      comments: a.comments_count,
      views: a.page_views_count ?? undefined,
      publishedAt: a.published_at,
      extra: { tags: a.tag_list, user: a.user?.username, readingTime: a.reading_time_minutes },
    }));

    return {
      source: "Dev.to",
      status: "ok",
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: "Dev.to",
      status: "error",
      error: String(e),
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }
}
