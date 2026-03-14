import type { RunType, SourceResult } from "../../types.js";
import { fetchPage, extractHeadings } from "./utils.js";

const URL = "https://www.heyorca.com/blog/trending-audio-for-reels-tiktok";

export async function collect(runType: RunType): Promise<SourceResult> {
  try {
    const html = await fetchPage(URL);
    if (html === null) {
      return { source: "HeyOrca Trending Audio", status: "ok", items: [], scrapedAt: new Date().toISOString() };
    }
    const items = extractHeadings(html, URL, "tiktok");
    // Tag items as audio-focused
    for (const item of items) {
      if (item.extra) {
        (item.extra as Record<string, unknown>).contentType = "audio";
      }
    }
    return {
      source: "HeyOrca Trending Audio",
      status: items.length > 0 ? "ok" : "error",
      error: items.length === 0 ? "No trends extracted" : undefined,
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { source: "HeyOrca Trending Audio", status: "error", error: String(e), items: [], scrapedAt: new Date().toISOString() };
  }
}
