import type { RunType, SourceResult } from "../../types.js";
import { fetchPage, extractHeadings, makeResult } from "./utils.js";

// https://later.com/blog/instagram-reels-trends/
// https://later.com/blog/tiktok-trends/

const PAGES = [
  { url: "https://later.com/blog/instagram-reels-trends/", platform: "reels" },
  { url: "https://later.com/blog/tiktok-trends/", platform: "tiktok" },
];

export async function collect(_runType: RunType): Promise<SourceResult> {
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

  return makeResult("Later Trends", allItems.flat());
}
