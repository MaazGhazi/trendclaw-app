import type { RunType, SourceResult } from "../../types.js";
import { fetchPage, extractHeadings, makeResult } from "./utils.js";

// https://bluebearcreative.co/blog/social-media-trends-this-week/
//
// Structure: date-based h2/h3 headings like "3/11/2026: SOCIAL MEDIA TRENDS THIS WEEK"
// with trend content in paragraphs below each date section.

const URL = "https://bluebearcreative.co/blog/social-media-trends-this-week/";

export async function collect(runType: RunType): Promise<SourceResult> {
  try {
    const html = await fetchPage(URL);
    if (html === null) {
      return { source: "BlueBear Weekly Trends", status: "ok", items: [], scrapedAt: new Date().toISOString() };
    }
    return makeResult("BlueBear Weekly Trends", extractHeadings(html, URL, "social"));
  } catch (e) {
    return { source: "BlueBear Weekly Trends", status: "error", error: String(e), items: [], scrapedAt: new Date().toISOString() };
  }
}
