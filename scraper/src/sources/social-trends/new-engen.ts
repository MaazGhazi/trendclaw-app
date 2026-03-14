import type { RunType, SourceResult } from "../../types.js";
import { fetchPage, extractHeadings } from "./utils.js";

const URL = "https://newengen.com/tiktok-trends/";

export async function collect(runType: RunType): Promise<SourceResult> {
  try {
    const html = await fetchPage(URL);
    if (html === null) {
      return { source: "New Engen TikTok Trends", status: "ok", items: [], scrapedAt: new Date().toISOString() };
    }
    const items = extractHeadings(html, URL, "tiktok");
    return {
      source: "New Engen TikTok Trends",
      status: items.length > 0 ? "ok" : "error",
      error: items.length === 0 ? "No trends extracted" : undefined,
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { source: "New Engen TikTok Trends", status: "error", error: String(e), items: [], scrapedAt: new Date().toISOString() };
  }
}
