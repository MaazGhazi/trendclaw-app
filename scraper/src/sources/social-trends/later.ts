import type { RunType, SourceResult } from "../../types.js";
import { fetchPage, extractHeadings } from "./utils.js";

const PAGES = [
  { url: "https://later.com/blog/tiktok-trends/", platform: "tiktok" },
  { url: "https://later.com/blog/instagram-reels-trends/", platform: "reels" },
];

export async function collect(runType: RunType): Promise<SourceResult> {
  try {
    const allItems = await Promise.all(
      PAGES.map(async ({ url, platform }) => {
        try {
          const html = await fetchPage(url);
          if (html === null) return []; // 304 — page unchanged
          return extractHeadings(html, url, platform);
        } catch {
          return [];
        }
      }),
    );

    const items = allItems.flat();
    return {
      source: "Later Trends",
      status: items.length > 0 ? "ok" : "error",
      error: items.length === 0 ? "No trends extracted from pages" : undefined,
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: "Later Trends",
      status: "error",
      error: String(e),
      items: [],
      scrapedAt: new Date().toISOString(),
    };
  }
}
