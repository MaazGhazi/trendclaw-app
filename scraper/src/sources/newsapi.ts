import type { RunType, ScrapedItem, SourceResult } from "../types.js";
import { getUserConfig } from "../user-config.js";

const BASE = "https://newsapi.org/v2";

/** Region-based: top headlines in user's country */
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
    const region = getUserConfig().region.toLowerCase();

    // Top headlines (general)
    const topRes = await fetch(
      `${BASE}/top-headlines?country=${region}&pageSize=15&apiKey=${apiKey}`
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
        `${BASE}/top-headlines?country=${region}&category=technology&pageSize=10&apiKey=${apiKey}`
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

/** Topic-based: search news for user's keywords */
export async function collectByKeywords(runType: RunType): Promise<SourceResult> {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    return {
      source: "NewsAPI Keywords",
      status: "skipped",
      error: "NEWSAPI_KEY not set",
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }

  const config = getUserConfig();
  const keywords = config.keywords.length > 0 ? config.keywords : [config.niche];
  const query = keywords.slice(0, 5).join(" OR ");

  if (!query) {
    return {
      source: "NewsAPI Keywords",
      status: "skipped",
      error: "No keywords configured",
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }

  try {
    const pageSize = runType === "pulse" ? 10 : 20;
    const region = config.region.toLowerCase();

    // Use 'everything' endpoint for keyword search (last 3 days)
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 3);

    const res = await fetch(
      `${BASE}/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=${pageSize}&from=${fromDate.toISOString().split("T")[0]}&apiKey=${apiKey}`
    );

    if (!res.ok) throw new Error(`NewsAPI everything returned ${res.status}`);
    const data = await res.json();

    const items: ScrapedItem[] = (data.articles ?? []).map((article: any) => ({
      title: article.title,
      url: article.url,
      description: article.description,
      publishedAt: article.publishedAt,
      category: `search:${query}`,
      extra: { source: article.source?.name },
    }));

    return {
      source: "NewsAPI Keywords",
      status: "ok",
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: "NewsAPI Keywords",
      status: "error",
      error: String(e),
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }
}
