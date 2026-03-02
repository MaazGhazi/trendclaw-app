import type { RunType, ScrapedItem, SourceResult } from "../types.js";

const BASE = "https://newsapi.org/v2";

export async function collect(runType: RunType): Promise<SourceResult> {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    return {
      source: "NewsAPI",
      status: "skipped",
      error: "NEWSAPI_KEY not set",
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }

  try {
    const items: ScrapedItem[] = [];

    // Top headlines (general)
    const topRes = await fetch(
      `${BASE}/top-headlines?country=us&pageSize=15&apiKey=${apiKey}`
    );
    if (topRes.ok) {
      const data = await topRes.json();
      for (const article of data.articles ?? []) {
        items.push({
          title: article.title,
          url: article.url,
          description: article.description,
          publishedAt: article.publishedAt,
          extra: { source: article.source?.name },
        });
      }
    }

    // Tech headlines (digest and deep dive)
    if (runType !== "pulse") {
      const techRes = await fetch(
        `${BASE}/top-headlines?country=us&category=technology&pageSize=10&apiKey=${apiKey}`
      );
      if (techRes.ok) {
        const data = await techRes.json();
        for (const article of data.articles ?? []) {
          if (!items.some((i) => i.url === article.url)) {
            items.push({
              title: article.title,
              url: article.url,
              description: article.description,
              publishedAt: article.publishedAt,
              category: "technology",
              extra: { source: article.source?.name },
            });
          }
        }
      }
    }

    return {
      source: "NewsAPI",
      status: "ok",
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: "NewsAPI",
      status: "error",
      error: String(e),
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }
}
