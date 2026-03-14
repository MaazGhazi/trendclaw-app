import type { RunType, SourceResult } from "../../types.js";
import { fetchPage, extractHeadings, makeResult, makeUnchangedResult } from "./utils.js";

// https://www.ramd.am/blog/trends-instagram
// https://www.ramd.am/blog/trends-tiktok

const PAGES = [
  { url: "https://www.ramd.am/blog/trends-instagram", platform: "reels" },
  { url: "https://www.ramd.am/blog/trends-tiktok", platform: "tiktok" },
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

  return makeResult("Ramdam Trends", allItems.flat());
}
