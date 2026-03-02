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
    const [topRes, bestRes] = await Promise.all([
      fetch(`${BASE}/topstories.json`),
      fetch(`${BASE}/beststories.json`),
    ]);
    if (!topRes.ok) throw new Error(`HN top API returned ${topRes.status}`);
    if (!bestRes.ok) throw new Error(`HN best API returned ${bestRes.status}`);

    const topIds: number[] = await topRes.json();
    const bestIds: number[] = await bestRes.json();

    // Merge both lists, deduplicate, take top N
    const seen = new Set<number>();
    const mergedIds: number[] = [];
    for (const id of [...topIds, ...bestIds]) {
      if (!seen.has(id)) {
        seen.add(id);
        mergedIds.push(id);
      }
      if (mergedIds.length >= limit) break;
    }

    const items: ScrapedItem[] = [];
    // Fetch in batches of 10 to avoid hammering
    for (let i = 0; i < mergedIds.length; i += 10) {
      const batch = mergedIds.slice(i, i + 10);
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
