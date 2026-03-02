import type { RunType, ScrapedItem, SourceResult } from "../types.js";

const BASE = "https://hacker-news.firebaseio.com/v0";

async function fetchItem(id: number): Promise<ScrapedItem | null> {
  try {
    const res = await fetch(`${BASE}/item/${id}.json`);
    if (!res.ok) return null;
    const item = await res.json();
    if (!item || item.dead || item.deleted) return null;
    return {
      title: item.title,
      url: item.url,
      score: item.score,
      comments: item.descendants ?? 0,
      publishedAt: new Date(item.time * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function collect(runType: RunType): Promise<SourceResult> {
  const limit = runType === "pulse" ? 10 : runType === "digest" ? 20 : 30;

  try {
    const res = await fetch(`${BASE}/topstories.json`);
    if (!res.ok) throw new Error(`HN API returned ${res.status}`);
    const ids: number[] = await res.json();
    const topIds = ids.slice(0, limit);

    const items: ScrapedItem[] = [];
    // Fetch in batches of 10 to avoid hammering
    for (let i = 0; i < topIds.length; i += 10) {
      const batch = topIds.slice(i, i + 10);
      const results = await Promise.all(batch.map(fetchItem));
      for (const r of results) {
        if (r) items.push(r);
      }
    }

    return {
      source: "Hacker News",
      status: "ok",
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: "Hacker News",
      status: "error",
      error: String(e),
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }
}
