import type { RunType, SourceResult } from "../../types.js";
import { fetchPage, extractHeadings, makeResult } from "./utils.js";

// https://www.socialpilot.co/blog/tiktok-trends
// https://www.socialpilot.co/blog/instagram-reels-trends
//
// Excellent structure: numbered h2/h3 trends like:
//   1. "67" — March 10, 2026
//   2. "POP DAT THANG" — March 6, 2026
// Standard heading extraction works perfectly.

const PAGES = [
  { url: "https://www.socialpilot.co/blog/tiktok-trends", platform: "tiktok" },
  { url: "https://www.socialpilot.co/blog/instagram-reels-trends", platform: "reels" },
];

export async function collect(runType: RunType): Promise<SourceResult> {
  const allItems = await Promise.all(
    PAGES.map(async ({ url, platform }) => {
      try {
        const html = await fetchPage(url);
        if (html === null) return [];
        return extractHeadings(html, url, platform);
      } catch {
        return [];
      }
    }),
  );

  return makeResult("SocialPilot Trends", allItems.flat());
}
